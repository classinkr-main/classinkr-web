import { type NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

interface EventRow {
  event_name: string
  button: string | null
  page: string | null
  created_at: string
}

interface EventCountsResponse {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{ button: string; event: string; count: number; lastSeen: string | null }>
  daily: Array<{ date: string; count: number }>
}

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  const rangeParam = req.nextUrl.searchParams.get("range")
  const parsed = rangeParam ? parseInt(rangeParam, 10) : NaN
  const rangeDays = Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 30

  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()

  try {
    const sb = createSupabaseAdminClient()
    const { data, error } = await sb
      .from("client_events")
      .select("event_name, button, page, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50000)

    if (error) {
      console.error("[GET /api/admin/event-counts]", error)
      return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 })
    }

    const rows = (data ?? []) as EventRow[]

    // 이벤트별 집계
    const eventMap = new Map<string, { count: number; lastSeen: string | null }>()
    for (const r of rows) {
      const cur = eventMap.get(r.event_name) ?? { count: 0, lastSeen: null }
      cur.count += 1
      if (!cur.lastSeen || r.created_at > cur.lastSeen) cur.lastSeen = r.created_at
      eventMap.set(r.event_name, cur)
    }

    // 버튼별 집계 (button null 제외)
    const buttonMap = new Map<
      string,
      { event: string; count: number; lastSeen: string | null }
    >()
    for (const r of rows) {
      if (!r.button) continue
      const key = `${r.event_name}::${r.button}`
      const cur = buttonMap.get(key) ?? { event: r.event_name, count: 0, lastSeen: null }
      cur.count += 1
      if (!cur.lastSeen || r.created_at > cur.lastSeen) cur.lastSeen = r.created_at
      buttonMap.set(key, cur)
    }

    // 일별 집계 (UTC 기준 YYYY-MM-DD)
    const dailyMap = new Map<string, number>()
    for (const r of rows) {
      const date = r.created_at.slice(0, 10)
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + 1)
    }

    const byEvent = Array.from(eventMap.entries())
      .map(([event, v]) => ({ event, count: v.count, lastSeen: v.lastSeen }))
      .sort((a, b) => b.count - a.count)

    const byButton = Array.from(buttonMap.entries())
      .map(([key, v]) => ({
        button: key.split("::")[1],
        event: v.event,
        count: v.count,
        lastSeen: v.lastSeen,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)

    const daily = Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    const response: EventCountsResponse = {
      rangeDays,
      total: rows.length,
      byEvent,
      byButton,
      daily,
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error("[GET /api/admin/event-counts]", error)
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 })
  }
}
