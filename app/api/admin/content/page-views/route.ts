import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 콘텐츠 영역별 page_view 집계 — 어드민 블로그/문서 대시보드의 "인기 콘텐츠" 위젯용
const ALLOWED_PREFIXES = new Set(["/blog/", "/docs/", "/events/"])

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

  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("client_events")
      .select("page")
      .eq("event_name", "page_view")
      .like("page", `${prefix}%`)
      .gte("created_at", since)
      .limit(50000)

    if (error) {
      console.error("[GET /api/admin/content/page-views]", error)
      return NextResponse.json({ error: "Failed to fetch page views" }, { status: 500 })
    }

    const counts = new Map<string, number>()
    for (const row of data ?? []) {
      const page = (row as { page: string | null }).page
      if (!page) continue
      // 쿼리스트링 제거해 같은 글의 조회를 합산
      const normalized = page.split("?")[0]
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
    }

    const top = [...counts.entries()]
      .map(([page, count]) => ({ page, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)

    return NextResponse.json({
      rangeDays: days,
      total: [...counts.values()].reduce((sum, n) => sum + n, 0),
      top,
    })
  } catch (error) {
    console.error("[GET /api/admin/content/page-views]", error)
    return NextResponse.json({ error: "Failed to fetch page views" }, { status: 500 })
  }
}
