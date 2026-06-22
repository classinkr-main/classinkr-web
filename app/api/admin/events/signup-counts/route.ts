import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { getLeads } from "@/lib/repositories/leads"
import { parseEventToken } from "@/lib/types/event-metrics"

// 행사별 신청 리드 수 집계 — 리드 notes 첫 줄의 [event:<slug>] 토큰 기준
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const leads = await getLeads()
    const counts: Record<string, number> = {}
    for (const lead of leads) {
      const { token } = parseEventToken(lead.notes)
      if (!token) continue
      counts[token] = (counts[token] ?? 0) + 1
    }

    return NextResponse.json({ counts })
  } catch (error) {
    console.error("[GET /api/admin/events/signup-counts]", error)
    return NextResponse.json({ error: "Failed to fetch signup counts" }, { status: 500 })
  }
}
