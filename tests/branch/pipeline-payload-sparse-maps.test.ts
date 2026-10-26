import { describe, expect, it } from "vitest"
import { listRevRevenue, sparseNumberMap, sparseBooleanMap } from "@/lib/branch/computations/pipeline"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { parseRev } from "@/lib/branch/parsers/rev"
import { ledgerMonthConfirmed, ledgerMonthSplit } from "@/lib/branch/computations/revenue-core"
import type { FormattedCell } from "@/lib/branch/google-sheets"

// 품질 감사 2026-09-10 — #1(페이로드 다이어트): /api/admin/branch/pipeline(172.6KB 실측)와
// 그 결과를 그대로 쓰는 page.tsx 서버 프리페치(RSC HTML 1,145.9KB 실측)의 상당 비중은
// 월별 맵의 0/false도 확도 근거가 될 수 있다. sparse 유틸의 기본값은 유지하지만,
// 실제 REV 응답은 키를 보존해 서버 집계와 클라이언트 캐논이 같은 결과를 내게 한다.
describe("sparseNumberMap — 0값 키를 제거하되 소비 시맨틱은 바꾸지 않는다", () => {
  it("0이 아닌 값만 남긴다", () => {
    expect(sparseNumberMap({ "2026-04": 0, "2026-05": 1000, "2026-06": 0 })).toEqual({ "2026-05": 1000 })
  })

  it("null/undefined 맵은 빈 객체를 반환한다", () => {
    expect(sparseNumberMap(null)).toEqual({})
    expect(sparseNumberMap(undefined)).toEqual({})
  })

  it("음수는 falsy가 아니므로 보존한다(가감 표현 등 실제 값)", () => {
    expect(sparseNumberMap({ "2026-04": -500 })).toEqual({ "2026-04": -500 })
  })

  it("빈 객체 입력은 빈 객체를 반환한다", () => {
    expect(sparseNumberMap({})).toEqual({})
  })
})

describe("sparseBooleanMap — false 키를 제거하되 소비 시맨틱은 바꾸지 않는다", () => {
  it("true만 남기고 false는 제거한다", () => {
    expect(sparseBooleanMap({ "2026-04": true, "2026-05": false, "2026-06": true })).toEqual({
      "2026-04": true,
      "2026-06": true,
    })
  })

  it("null/undefined 맵은 빈 객체를 반환한다", () => {
    expect(sparseBooleanMap(null)).toEqual({})
    expect(sparseBooleanMap(undefined)).toEqual({})
  })
})

const mk = (over: Partial<BranchRevDeal>): BranchRevDeal => ({
  id: "x", sheet_row: 1, customer_name: "c", branch_contact: null, team: "BD", manager: "Han",
  deal_type: "Direct", status: "New", first_payment: null, product_version: null,
  region: "서울", importance: "A", note: null, contract_target: 0,
  monthly_payments: {}, monthly_red: {}, raw: {}, synced_at: "", ...over,
})

describe("listRevRevenue — 행 데이터 시각(syncedAt, ADR-011 이중 집계 제외 기준)", () => {
  it("미러 synced_at·임포트 캡처 시각을 그대로 싣고, 비어 있으면 키를 싣지 않는다", () => {
    const [synced] = listRevRevenue([mk({ synced_at: "2026-10-23T08:05:00.000Z" })])
    expect(synced.syncedAt).toBe("2026-10-23T08:05:00.000Z")
    const [blank] = listRevRevenue([mk({ synced_at: "" })])
    expect(blank).not.toHaveProperty("syncedAt")
  })
})

describe("listRevRevenue — 의미 있는 0/false를 응답에서 보존한다", () => {
  it("monthlyPayments/monthlyConfirmed/monthlyHighConfidence의 명시 0값 달을 보존한다", () => {
    const [row] = listRevRevenue([
      mk({
        monthly_payments: { "2026-04": 0, "2026-05": 500 },
        monthly_confirmed: { "2026-04": 0, "2026-05": 500 },
        monthly_high_conf: { "2026-04": 0 },
      }),
    ])
    expect(row.monthlyPayments).toEqual({ "2026-04": 0, "2026-05": 500 })
    expect(row.monthlyConfirmed).toEqual({ "2026-04": 0, "2026-05": 500 })
    expect(row.monthlyHighConfidence).toEqual({ "2026-04": 0 })
  })

  it("monthlyRed의 false값도 색 데이터 보유 근거이므로 보존한다", () => {
    const [row] = listRevRevenue([
      mk({ monthly_payments: { "2026-04": 100 }, monthly_red: { "2026-04": false, "2026-05": true } }),
    ])
    expect(row.monthlyRed).toEqual({ "2026-04": false, "2026-05": true })
  })

  it("트리밍 이후에도 revenue 집계(revenueFromRev)는 원본 monthly_payments 기준이라 값이 그대로다", () => {
    // 회귀 방지: sparseNumberMap을 revenueFromRev 호출 "이전"에 적용해버리면 0값 달이 아니라
    // 정상 값도 지워질 위험을 원천 차단하는 실측 가드. monthly_red를 둘 다 true로 둬 확정 산식이
    // 전액을 confirmed로 잡는 기존 스위트(computations/pipeline.test.ts)와 동일 조건을 쓴다 —
    // 이 값은 트리밍 도입 전과 동일해야 한다.
    const [row] = listRevRevenue([
      mk({
        id: "a",
        monthly_payments: { "2026-04": 100, "2026-05": 200 },
        monthly_red: { "2026-04": true, "2026-05": true },
      }),
    ], undefined, { period: "Y", now: new Date("2026-04-01T00:00:00Z") })
    expect(row.revenue).toBe(300)
    // monthlyRed는 둘 다 true라 sparseBooleanMap이 그대로 보존한다(false만 제거 대상).
    expect(row.monthlyRed).toEqual({ "2026-04": true, "2026-05": true })
  })

  it("실제 파서→서버 집계→JSON 직렬화→클라이언트에서 상계 0과 확정 0이 같다", () => {
    const cell = (value: string | number | null, color?: "red" | "blue"): FormattedCell => ({
      value, bg: null, fg: color === "red" ? { red: 1, green: 0, blue: 0 } : color === "blue" ? { red: 0, green: 0, blue: 1 } : null,
    })
    const header = Array.from({ length: 23 }, () => cell(null))
    for (const [index, value] of [[13, "4"], [14, "w1"], [15, "w2"], [16, "5"], [17, "w1"], [18, "w2"], [19, "6"], [20, "w1"], [21, "7"], [22, "w1"]] as const) header[index] = cell(value)
    const data = Array.from({ length: 23 }, () => cell(null))
    data[0] = cell("상계 고객")
    data[14] = cell(100, "red"); data[15] = cell(-100, "blue")
    data[16] = cell(500); data[17] = cell(100, "red"); data[18] = cell(-100, "red")
    data[20] = cell(0, "blue")
    const parsed = parseRev([[], header, data], { refFy: 2026 })[0]
    const [server] = listRevRevenue([mk(parsed)], undefined, { period: "Y", now: new Date("2026-04-01T00:00:00Z") })
    const client = JSON.parse(JSON.stringify(server)) as typeof server
    expect(server.revenue).toBe(100)
    expect(client.monthlyPayments).toEqual({ "2026-04": 0, "2026-05": 500, "2026-06": 0 })
    expect(client.monthlyConfirmed).toEqual({ "2026-04": 100, "2026-05": 0 })
    expect(client.weeklyPayments["2026-06"]).toEqual([0, 0, 0, 0, 0])
    expect(client.weeklyPayments["2026-07"]).toBeUndefined()
    expect(ledgerMonthSplit(client, "2026-04", 0, "2026-10")).toEqual({ confirmed: 100, highConfidence: -100, expected: 0 })
    expect(ledgerMonthSplit(client, "2026-05", 500, "2026-10")).toEqual({ confirmed: 0, highConfidence: 0, expected: 500 })
    const clientConfirmed = Object.entries(client.monthlyPayments).reduce((sum, [month, total]) => sum + ledgerMonthConfirmed(client, month, total, "2026-10"), 0)
    expect(clientConfirmed).toBe(server.revenue)
  })

  it("false 색 키를 제거해 과거 지급을 무색상 전액 확정으로 바꾸지 않는다", () => {
    const [row] = listRevRevenue([mk({ monthly_payments: { "2026-04": 100 }, monthly_red: { "2026-04": false } })])
    expect(row.revenue).toBe(0)
    expect(ledgerMonthConfirmed(row, "2026-04", 100, "2026-10")).toBe(0)
  })
})
