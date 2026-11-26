// getAllEventAttendanceMatrices — 1000행 절단·오류 은폐 회귀.
import { beforeEach, describe, expect, it, vi } from "vitest"

import { createFakePostgrest } from "./unified-fake-postgrest"

let datasets: Record<string, Array<Record<string, unknown>>>
let failTables: Set<string>

async function load() {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () => createFakePostgrest(datasets, { failTables }).client,
  }))
  return import("@/lib/repositories/event-attendance")
}

const leadId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

beforeEach(() => {
  failTables = new Set()
  datasets = { crm_customer_events: [], leads: [] }
})

describe("getAllEventAttendanceMatrices", () => {
  it("counts every attendance row past the 1000-row PostgREST cap", async () => {
    datasets.crm_customer_events = Array.from({ length: 1200 }, (_, i) => ({
      id: `e${String(i).padStart(5, "0")}`,
      public_event_id: "ev1",
      target_type: "lead",
      target_id: leadId(i),
      attendee_origin: "ad_lead",
    }))
    datasets.leads = Array.from({ length: 1200 }, (_, i) => ({ id: leadId(i), status: i < 10 ? "converted" : "new" }))
    const { getAllEventAttendanceMatrices } = await load()
    const result = await getAllEventAttendanceMatrices()
    expect(result.ev1.total).toBe(1200)
    expect(result.ev1.converted).toBe(10)
  })

  it("throws instead of returning an empty matrix when the attendance read fails", async () => {
    failTables = new Set(["crm_customer_events"])
    const { getAllEventAttendanceMatrices } = await load()
    await expect(getAllEventAttendanceMatrices()).rejects.toThrow("행사 참석 조회 실패")
  })

  it("throws when the lead status read fails instead of reporting converted=0", async () => {
    datasets.crm_customer_events = [
      { id: "e1", public_event_id: "ev1", target_type: "lead", target_id: leadId(1), attendee_origin: "ad_lead" },
    ]
    failTables = new Set(["leads"])
    const { getAllEventAttendanceMatrices } = await load()
    await expect(getAllEventAttendanceMatrices()).rejects.toThrow("리드 상태 조회 실패")
  })
})
