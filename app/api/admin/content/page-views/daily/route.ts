import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { getBlogPostPath } from "@/lib/blog-slug-route"
import { bucketDailyViews, kstDateKey, pageMatchesBlogPath, shiftDateKey } from "@/lib/admin/content-hub"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 블로그 글 한 편의 일별 page_view — 어드민 콘텐츠 「한눈에」 미리보기의 일별 조회 막대용.
// 글 하나·최대 90일이라 원시 행을 읽어 Node 에서 KST 날짜로 센다(상한을 넘으면 잘린 값 대신 503).
const PAGE_VIEW_SCAN_LIMIT = 20_000
const PAGE_VIEW_QUERY_TIMEOUT_MS = 12_000
// app/api/track/event 가 page 를 200자로 자른다 — 긴 한글 경로는 잘린 앞부분으로 찾는다.
const STORED_PAGE_MAX_LENGTH = 200

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const slug = (req.nextUrl.searchParams.get("slug") ?? "").trim()
  if (!slug || slug.length > 200) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 })
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "14", 10)
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 14

  const endKey = kstDateKey(new Date())
  const startKey = shiftDateKey(endKey, -(days - 1))
  const dayKeys = Array.from({ length: days }, (_, index) => shiftDateKey(startKey, index))
  // 첫 칸의 KST 자정(= 전날 UTC 15시)부터 읽는다. 칸 밖 시각은 bucketDailyViews 가 버린다.
  const since = new Date(`${shiftDateKey(startKey, -1)}T15:00:00.000Z`).toISOString()

  const postPath = getBlogPostPath(slug)
  const storedPrefix = postPath.slice(0, STORED_PAGE_MAX_LENGTH)

  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), PAGE_VIEW_QUERY_TIMEOUT_MS)

  try {
    const sb = createSupabaseAdminClient()
    // 인코딩된 경로의 `%` 는 LIKE 와일드카드라 더 넓게 읽힐 수 있다 — 아래에서 경로를 다시 대조한다.
    const { data, error, count } = await sb
      .from("client_events")
      .select("page, created_at", { count: "exact" })
      .eq("event_name", "page_view")
      .like("page", `${storedPrefix}%`)
      .gte("created_at", since)
      .limit(PAGE_VIEW_SCAN_LIMIT + 1)
      .abortSignal(timeoutController.signal)

    if (error) {
      console.error("[GET /api/admin/content/page-views/daily]", error)
      return NextResponse.json({ error: "Failed to fetch page views" }, { status: 500 })
    }

    if (typeof count !== "number" || count > PAGE_VIEW_SCAN_LIMIT || count > (data?.length ?? 0)) {
      return NextResponse.json(
        {
          error: "Page-view aggregation is not ready for this data volume.",
          code: "PAGE_VIEW_AGGREGATION_REQUIRED",
        },
        { status: 503 }
      )
    }

    const timestamps = (data ?? [])
      .filter((row) => {
        const page = (row as { page: string | null }).page
        return typeof page === "string" && pageMatchesBlogPath(page, postPath)
      })
      .map((row) => String((row as { created_at: string }).created_at))
    const counts = bucketDailyViews(timestamps, dayKeys)

    return adminCachedJson({
      slug,
      days,
      dayKeys,
      counts,
      total: counts.reduce((sum, value) => sum + value, 0),
    })
  } catch (error) {
    console.error("[GET /api/admin/content/page-views/daily]", error)
    if (timeoutController.signal.aborted) {
      return NextResponse.json(
        { error: "Page-view query timed out.", code: "PAGE_VIEW_QUERY_TIMEOUT" },
        { status: 504 }
      )
    }
    return NextResponse.json({ error: "Failed to fetch page views" }, { status: 500 })
  } finally {
    clearTimeout(timeout)
  }
}
