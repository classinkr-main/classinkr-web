import { describe, expect, it } from "vitest"
import type { CompassDemoRow } from "@/lib/compass/bridge"
import type { PlannedHardwareMovement } from "@/lib/repositories/hardware-inventory"
import { overviewOperationsRange, summarizeOverviewDemos, summarizeOverviewInstallations } from "@/lib/admin/overview/operations-summary"

// UTC 서버에서도 한국 날짜 자정으로 월·당일·7일 경계를 판단한다.
const NOW = new Date("2026-10-14T15:30:00Z")
const demo = (id: number, overrides: Partial<CompassDemoRow> = {}): CompassDemoRow => ({
  id, lead_id: id, day: "2026-10-15", kind: "demo", status: "booked", owner: "담당자",
  source: null, memo: "응답에 실으면 안 되는 원문", day_approx: false, bd: false,
  created_at: "2026-10-01T00:00:00Z", ...overrides,
})
const movement = (id: string, overrides: Partial<PlannedHardwareMovement> = {}): PlannedHardwareMovement => ({
  id, product_name: "86 IFP", quantity: 2, occurred_at: "2026-10-15", owner: null, to_location: null, ...overrides,
})

describe("Overview 실제 운영 원천 집계", () => {
  it("한국 자정과 월 경계를 사용하고 오늘 포함 7일·30일 창을 명시한다", () => {
    expect(overviewOperationsRange(NOW)).toEqual({ today: "2026-10-15", from: "2026-10-01", to: "2026-11-14", next7End: "2026-10-21" })
    expect(overviewOperationsRange(new Date("2026-10-31T15:01:00Z")).from).toBe("2026-11-01")
  })

  it("취소·노쇼·미팅·완료를 예정 데모에 섞지 않고 지난 예약을 완료로 추정하지 않는다", () => {
    const result = summarizeOverviewDemos([
      demo(1), demo(2, { day: "2026-10-21", day_approx: true }), demo(3, { day: "2026-10-22" }),
      demo(4, { status: "done", day: "2026-10-14" }), demo(5, { status: "canceled" }),
      demo(6, { status: "no_show" }), demo(7, { day: "2026-10-14" }),
      demo(8, { kind: "meeting" }), demo(9, { status: "done", day: "2026-09-30" }),
    ], NOW)
    expect(result).toMatchObject({ upcomingCount: 3, next7Count: 2, todayCount: 1, doneThisMonth: 1, unrecordedThisMonth: 1, noShowThisMonth: 1, canceledThisMonth: 1 })
    expect(result.upcoming.map((row) => row.id)).toEqual([1, 2, 3])
    expect(result.upcoming[1].approximate).toBe(true)
    expect(JSON.stringify(result)).not.toContain("응답에 실으면")
  })

  it("다음 달 예약은 예정에 포함하되 이번 달 완료에 섞지 않는다", () => {
    const result = summarizeOverviewDemos([demo(1, { day: "2026-11-01" }), demo(2, { day: "2026-11-01", status: "done" })], NOW, true)
    expect(result).toMatchObject({ upcomingCount: 1, doneThisMonth: 0, truncated: true })
  })

  it("한 리드의 여러 회차를 고객 수로 합치지 않고 미연결 회차도 보존한다", () => {
    const result = summarizeOverviewDemos([demo(1), demo(2, { lead_id: 1 }), demo(3, { lead_id: null })], NOW)
    expect(result.upcomingCount).toBe(3)
    expect(result.upcoming[2].leadId).toBeNull()
  })

  it("설치 예정일 경과·미지정·7일 범위를 분리하고 품목 행과 장비 수량을 구분한다", () => {
    const result = summarizeOverviewInstallations([
      movement("a", { occurred_at: "2026-10-14", quantity: 3 }), movement("b"),
      movement("c", { occurred_at: "2026-10-21" }), movement("d", { occurred_at: "2026-10-22" }),
      movement("e", { occurred_at: null, quantity: 1 }),
    ], NOW)
    expect(result).toMatchObject({ count: 5, units: 10, overdueCount: 1, undatedCount: 1, next7Count: 2 })
    expect(result.upcoming[0]).toMatchObject({ id: "a", overdue: true })
  })

  it("미리보기 4행과 전량 합계를 분리해 2,000행 이상의 예정도 숨기지 않는다", () => {
    const result = summarizeOverviewInstallations(Array.from({ length: 2005 }, (_, i) => movement(String(i))), NOW)
    expect(result).toMatchObject({ count: 2005, units: 4010 })
    expect(result.upcoming).toHaveLength(4)
    expect(summarizeOverviewInstallations([], NOW)).toMatchObject({ count: 0, units: 0, upcoming: [] })
  })
})
