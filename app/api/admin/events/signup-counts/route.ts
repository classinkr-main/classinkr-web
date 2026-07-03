import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { countEventTokenSignups, type EventTokenTarget } from "@/lib/events/attribution"
import { getLeads } from "@/lib/repositories/leads"
import { getAllEventsForAdmin } from "@/lib/repositories/public-events"

// 행사별 신청 리드 수 집계 — 리드 notes 첫 줄의 [event:<slug_or_id>] 토큰 기준.
// 공개 신청 폼은 slug, 리드 보드 수동 연결·캡처 배치는 id 토큰을 써 왔으므로
// 행사 카탈로그로 정규화해 정규 키(slug ?? id)로 합산한다.
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const leads = await getLeads()

    // 카탈로그 조회 실패가 집계 자체를 막지 않도록 — 실패 시 원본 토큰 키로 폴백
    let events: EventTokenTarget[] = []
    try {
      events = await getAllEventsForAdmin()
    } catch (error) {
      console.warn("[GET /api/admin/events/signup-counts] event catalog fetch failed", error)
    }

    const counts = countEventTokenSignups(
      leads.map((lead) => lead.notes),
      events
    )

    return NextResponse.json({ counts })
  } catch (error) {
    console.error("[GET /api/admin/events/signup-counts]", error)
    return NextResponse.json({ error: "Failed to fetch signup counts" }, { status: 500 })
  }
}
