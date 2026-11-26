import { beforeEach, describe, expect, it, vi } from "vitest"

// PostgREST max-rows(1000) 클램프 흉내 — 단일 .limit() 이면 1000행만 온다.
const state = vi.hoisted(() => ({
  events: [] as Array<Record<string, unknown>>,
  getLeads: vi.fn(),
}))

vi.mock("@/lib/repositories/leads", () => ({ getLeads: state.getLeads }))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const builder: Record<string, unknown> = {}
      for (const name of ["select", "in", "gte", "not", "order"]) builder[name] = () => builder
      builder.range = async (from: number, to: number) => ({
        data: state.events.slice(from, from + Math.min(to - from + 1, 1000)),
        error: null,
        count: state.events.length,
      })
      return builder
    },
  }),
}))

import { getLeadMagnetMetrics } from "@/lib/repositories/lead-magnet-metrics"

beforeEach(() => {
  state.getLeads.mockReset()
  state.getLeads.mockResolvedValue([])
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("getLeadMagnetMetrics", () => {
  it("counts events beyond the 1000-row PostgREST cap", async () => {
    const createdAt = new Date().toISOString()
    state.events = Array.from({ length: 2500 }, () => ({
      event_name: "view_resource",
      page: "/resources/a",
      params: { lead_magnet: "guide" },
      created_at: createdAt,
    }))
    const metrics = await getLeadMagnetMetrics(30)
    expect(metrics.byLeadMagnet[0]?.views).toBe(2500)
    expect(metrics.truncated).toBe(false)
  })

  it("surfaces a leads read failure in warning", async () => {
    state.events = []
    state.getLeads.mockRejectedValue(new Error("leads down"))
    const metrics = await getLeadMagnetMetrics(30)
    expect(metrics.warning).toContain("leads down")
  })
})
