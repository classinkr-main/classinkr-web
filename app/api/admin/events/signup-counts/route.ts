import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { parseEventToken } from "@/lib/types/event-metrics"

// 행사별 신청 리드 수 집계 — 리드 notes 첫 줄의 [event:<slug>] 토큰 기준
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("leads")
      .select("notes")
      .like("notes", "[event:%")
      .limit(20000)

    if (error) {
      console.error("[GET /api/admin/events/signup-counts]", error)
      return NextResponse.json({ error: "Failed to fetch signup counts" }, { status: 500 })
    }

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      const { token } = parseEventToken((row as { notes: string | null }).notes)
      if (!token) continue
      counts[token] = (counts[token] ?? 0) + 1
    }

    return NextResponse.json({ counts })
  } catch (error) {
    console.error("[GET /api/admin/events/signup-counts]", error)
    return NextResponse.json({ error: "Failed to fetch signup counts" }, { status: 500 })
  }
}
