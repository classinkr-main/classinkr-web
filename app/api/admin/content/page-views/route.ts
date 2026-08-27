import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 콘텐츠 영역별 page_view 집계 — 어드민 블로그/문서 대시보드의 "인기 콘텐츠" 위젯용
const ALLOWED_PREFIXES = new Set(["/blog/", "/docs/", "/events/"])
const PAGE_VIEW_SCAN_LIMIT = 50_000
const PAGE_VIEW_QUERY_TIMEOUT_MS = 12_000

interface PageViewAggregateRow {
  page: string | null
  views: number | string | null
}

function buildPageViewResponse(
  rows: PageViewAggregateRow[],
  rangeDays: number,
  limit: number
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.page) continue
    // 쿼리스트링 제거해 같은 글의 조회를 합산한다. SQL aggregate도 같은 규칙이다.
    const normalized = row.page.split("?")[0]
    const views = Number(row.views)
    if (!Number.isFinite(views) || views <= 0) continue
    counts.set(normalized, (counts.get(normalized) ?? 0) + views)
  }

  return {
    rangeDays,
    total: [...counts.values()].reduce((sum, count) => sum + count, 0),
    top: [...counts.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, limit),
  }
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const prefix = req.nextUrl.searchParams.get("prefix") ?? ""
  if (!ALLOWED_PREFIXES.has(prefix)) {
    return NextResponse.json({ error: "Invalid prefix" }, { status: 400 })
  }

  const daysParam = parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10)
  const days = Number.isFinite(daysParam) && daysParam > 0 && daysParam <= 90 ? daysParam : 30
  const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 10

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const timeoutController = new AbortController()
  const timeout = setTimeout(() => timeoutController.abort(), PAGE_VIEW_QUERY_TIMEOUT_MS)

  try {
    const sb = createSupabaseAdminClient()

    // /docs/는 이미 배포된 SQL aggregate를 사용한다. 이전 구현은 집계에 필요한 몇십 행
    // 대신 원시 page_view를 최대 5만 행 전송해 Node에서 다시 세고, 5만 건을 넘으면 조용히
    // 일부만 반환했다. RPC는 전량을 DB에서 집계해 응답 크기와 정합성을 함께 개선한다.
    if (prefix === "/docs/") {
      const aggregate = await sb
        .rpc("admin_docs_page_view_counts", { since_ts: since })
        .abortSignal(timeoutController.signal)

      if (!aggregate.error && Array.isArray(aggregate.data)) {
        return adminCachedJson(
          buildPageViewResponse(aggregate.data as PageViewAggregateRow[], days, limit)
        )
      }
    }

    const { data, error, count } = await sb
      .from("client_events")
      .select("page", { count: "exact" })
      .eq("event_name", "page_view")
      .like("page", `${prefix}%`)
      .gte("created_at", since)
      // 상한보다 한 행 더 읽어 부분 집계 여부를 감지한다. RPC가 없는 구버전 DB에서
      // 잘린 값을 정상 수치로 위장하는 것보다 명시적인 준비 오류가 안전하다.
      .limit(PAGE_VIEW_SCAN_LIMIT + 1)
      .abortSignal(timeoutController.signal)

    if (error) {
      console.error("[GET /api/admin/content/page-views]", error)
      return NextResponse.json({ error: "Failed to fetch page views" }, { status: 500 })
    }

    // PostgREST의 서버 max-rows가 요청 limit보다 작으면 data.length만으로는 절단을 알 수
    // 없다. exact count와 실제 수신 행을 함께 비교해 1,001번째 행부터의 무음 누락도 막는다.
    if (
      typeof count !== "number" ||
      count > PAGE_VIEW_SCAN_LIMIT ||
      count > (data?.length ?? 0)
    ) {
      return NextResponse.json(
        {
          error: "Page-view aggregation is not ready for this data volume.",
          code: "PAGE_VIEW_AGGREGATION_REQUIRED",
        },
        { status: 503 }
      )
    }

    return adminCachedJson(
      buildPageViewResponse(
        (data ?? []).map((row) => ({
          page: (row as { page: string | null }).page,
          views: 1,
        })),
        days,
        limit
      )
    )
  } catch (error) {
    console.error("[GET /api/admin/content/page-views]", error)
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
