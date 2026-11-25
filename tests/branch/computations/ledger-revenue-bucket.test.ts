// 장부 매출 한 정의(D1·D2) — revenue-core.ledgerMonthNet → ledgerMonthBucket → sumLedgerRevenue.
// 월 칸 그대로(환불·명시 0 유지), 확도는 캐논, total = confirmed + high + open, 순액 양수 달에는 음수 예정 없음.
// 파이프라인 행 모양(BranchPipelineRow)을 그대로 받는다.
import { describe, expect, it } from "vitest"
import type { BranchPipelineRow } from "@/components/admin/branch/types"
import {
  isZeroLedgerBucket,
  ledgerMonthBucket,
  ledgerMonthNet,
  ledgerMonthSplit,
  sumLedgerRevenue,
  type LedgerRevenueSource,
} from "@/lib/branch/computations/revenue-core"
import { buildMonthlyGoalChart, monthlyGoalSegments } from "@/lib/branch/monthly-goal-chart"

const NOV = "2026-11"
const TODAY = "2026-11-25"

const sheet = (overrides: Partial<LedgerRevenueSource> = {}): LedgerRevenueSource => ({ ledgerOrigin: "sheet", monthlyPayments: {}, ...overrides })

describe("ledgerMonthNet", () => {
  it("월 맵 값을 그대로 — 음수와 명시 0 유지", () => {
    expect(ledgerMonthNet(sheet({ monthlyPayments: { [NOV]: -30000 } }), NOV)).toBe(-30000)
    expect(ledgerMonthNet(sheet({ monthlyPayments: { [NOV]: 0 }, revenue: 500 }), NOV)).toBe(0)
  })
  it("키가 없으면 적용 초안 행의 자기 달만 revenue, 그 밖은 0 · 숫자가 아니면 0", () => {
    expect(ledgerMonthNet({ ledgerOrigin: "draft", draftMonth: NOV, revenue: 40000 }, NOV)).toBe(40000)
    expect(ledgerMonthNet({ ledgerOrigin: "draft", draftMonth: "2026-12", revenue: 40000 }, NOV)).toBe(0)
    expect(ledgerMonthNet(sheet({ revenue: 40000 }), NOV)).toBe(0)
    expect(ledgerMonthNet(sheet({ monthlyPayments: { [NOV]: Number.NaN } }), NOV)).toBe(0)
  })
})

describe("ledgerMonthBucket", () => {
  it("환불 달(빨간 −30,000)은 음수 확정 — 0 으로 자르지 않는다", () => {
    const bucket = ledgerMonthBucket(sheet({ monthlyPayments: { [NOV]: -30000 }, monthlyConfirmed: { [NOV]: -30000 }, monthlyRed: { [NOV]: true } }), NOV, TODAY)
    expect(bucket).toEqual({ total: -30000, confirmed: -30000, high: 0, open: 0 })
    expect(isZeroLedgerBucket(bucket)).toBe(false)
  })

  it("순액 0 상계 달은 값 없음이 아니어도(확도 상계) total 0 — 0 만 있는 달은 값 없음", () => {
    expect(isZeroLedgerBucket(ledgerMonthBucket(sheet({ monthlyPayments: { [NOV]: 0 }, monthlyConfirmed: { [NOV]: 0 } }), NOV, TODAY))).toBe(true)
    expect(isZeroLedgerBucket(ledgerMonthBucket(sheet(), NOV, TODAY))).toBe(true)
  })

  it("순액이 양수인 달에는 음수 예정이 없다 — 고확도(양수)에서 먼저, 남으면 확정에서 덜어 합계는 그대로", () => {
    // 캐논(부호 보존): 확정 300 · 고확도 −100 → 예정 −100
    const row = sheet({ monthlyPayments: { [NOV]: 100 }, monthlyConfirmed: { [NOV]: 300 }, monthlyHighConfidence: { [NOV]: -100 } })
    expect(ledgerMonthSplit(row, NOV, 100, TODAY)).toEqual({ confirmed: 300, highConfidence: -100, expected: -100 })
    expect(ledgerMonthBucket(row, NOV, TODAY)).toEqual({ total: 100, confirmed: 200, high: -100, open: 0 })
    const withBlue = sheet({ monthlyPayments: { [NOV]: 100 }, monthlyConfirmed: { [NOV]: -50 }, monthlyHighConfidence: { [NOV]: 300 } })
    const bucket = ledgerMonthBucket(withBlue, NOV, TODAY)
    expect(bucket.open).toBe(0)
    expect(bucket.confirmed + bucket.high + bucket.open).toBe(100)
  })

  it("불변식: total = confirmed + high + open (음수·상계·무색상·초안 섞은 무작위 표본)", () => {
    let seed = 7
    const rand = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647 }
    const pick = <T,>(values: T[]) => values[Math.floor(rand() * values.length)]
    for (let i = 0; i < 400; i++) {
      const total = pick([0, 100, 250, -80, -300, 1000])
      const row: LedgerRevenueSource = {
        ledgerOrigin: pick(["sheet", "sheet", "draft"] as const),
        draftMonth: NOV,
        revenue: pick([0, 120]),
        monthlyPayments: rand() < 0.2 ? {} : { [NOV]: total },
        ...(rand() < 0.6 ? { monthlyConfirmed: { [NOV]: pick([0, 50, 300, -100, -300]) } } : {}),
        ...(rand() < 0.4 ? { monthlyHighConfidence: { [NOV]: pick([0, 40, -100, 600]) } } : {}),
        ...(rand() < 0.2 ? { monthlyRed: { [NOV]: true } } : {}),
      }
      const bucket = ledgerMonthBucket(row, NOV, pick([TODAY, "2026-12-05"]))
      expect(bucket.confirmed + bucket.high + bucket.open).toBeCloseTo(bucket.total, 9)
      expect(bucket.total).toBe(ledgerMonthNet(row, NOV))
      if (bucket.total > 0) expect(bucket.open).toBeGreaterThanOrEqual(0)
    }
  })

  it("파이프라인 행 모양(BranchPipelineRow, ledgerOrigin 없음)을 그대로 받는다 — 시트 행으로 본다", () => {
    const row: BranchPipelineRow = {
      id: "r1", customer: "예시학원1", manager: "예시A", team: "BD", region: null, revenue: 0,
      monthlyPayments: { "2026-10": 500 }, monthlyConfirmed: {}, monthlyHighConfidence: {}, monthlyRed: {},
    }
    // 색 데이터 없음 → 이번 영업월(11월) 이전 달인 10월은 확정
    expect(ledgerMonthBucket(row, "2026-10", TODAY)).toEqual({ total: 500, confirmed: 500, high: 0, open: 0 })
  })
})

describe("sumLedgerRevenue — design-0 A–E 예시(11월)", () => {
  // A +50,000 확정(10월 +100,000 확정) · B −30,000 빨간 환불 · C 80,000(확정 20,000 + 고확도 60,000)
  // D 장부 +40,000 확정(11월) · E 장부 +60,000 예정(1월, 다른 담당)
  const rows: LedgerRevenueSource[] = [
    sheet({ manager: "예시A", team: "BD", monthlyPayments: { "2026-10": 100000, [NOV]: 50000 }, monthlyConfirmed: { "2026-10": 100000, [NOV]: 50000 }, monthlyRed: { "2026-10": true, [NOV]: true } }),
    sheet({ manager: "예시B", team: "BD", monthlyPayments: { [NOV]: -30000 }, monthlyConfirmed: { [NOV]: -30000 }, monthlyRed: { [NOV]: true } }),
    sheet({ manager: "예시B", team: "BD", monthlyPayments: { [NOV]: 80000 }, monthlyConfirmed: { [NOV]: 20000 }, monthlyHighConfidence: { [NOV]: 60000 } }),
    { ledgerOrigin: "draft", manager: "예시a", team: "BD", draftMonth: NOV, revenue: 40000, monthlyPayments: { [NOV]: 40000 }, monthlyConfirmed: { [NOV]: 40000 }, monthlyRed: { [NOV]: true } },
    { ledgerOrigin: "draft", manager: "예시B", team: "MKT", draftMonth: "2027-01", revenue: 60000, monthlyPayments: { "2027-01": 60000 } },
  ]

  it("11월: 확정 80,000 · 고확도 60,000 · 예정 0 · 합 140,000 · 4행", () => {
    expect(sumLedgerRevenue(rows, { months: [NOV], today: TODAY })).toEqual({ total: 140000, confirmed: 80000, high: 60000, open: 0, rows: 4 })
  })

  it("확도 부분집합 {확정} → total 은 포함 확도 합", () => {
    expect(sumLedgerRevenue(rows, { months: [NOV], confidences: new Set(["confirmed"]), today: TODAY })).toEqual({
      total: 80000, confirmed: 80000, high: 0, open: 0, rows: 4,
    })
  })

  it("담당자(별칭·대소문자 무시)·팀으로 좁힌다", () => {
    expect(sumLedgerRevenue(rows, { months: [NOV], managers: ["예시A"], today: TODAY })).toMatchObject({ total: 90000, confirmed: 90000, rows: 2 })
    expect(sumLedgerRevenue(rows, { months: [NOV, "2027-01"], team: "MKT", today: TODAY })).toMatchObject({ total: 60000, open: 60000, rows: 1 })
    expect(sumLedgerRevenue(rows, { months: [NOV], team: "ALL", managers: [], today: TODAY }).total).toBe(140000)
  })

  it("월별 목표 차트의 11월 점과 같은 숫자다(같은 함수)", () => {
    const [point] = buildMonthlyGoalChart(rows.map((row) => ({ ...row, revenue: row.revenue ?? 0 })), [{ month: NOV, goal: 200000 }], TODAY)
    expect(point).toMatchObject({ confirmed: 80000, highConfidence: 60000, expected: 0, total: 140000 })
  })
})

describe("monthlyGoalSegments — 음수 예정 조각을 그리지 않는다(F-15·D2)", () => {
  it("순액 양수 달: 양수 확도만 색 조각, 음수는 무채색 차감 한 조각", () => {
    expect(monthlyGoalSegments({ confirmed: 300, highConfidence: -100, expected: 0, total: 200, positive: 300, negative: -100 })).toEqual([
      { key: "confirmed", start: 0, value: 300 },
      { key: "deduction", start: 0, value: -100 },
    ])
  })

  it("환불 달(순액 음수)은 확도 색 없이 차감 한 조각", () => {
    expect(monthlyGoalSegments({ confirmed: -30, highConfidence: 0, expected: -20, total: -50, positive: 0, negative: -50 })).toEqual([
      { key: "deduction", start: 0, value: -50 },
    ])
  })

  it("순액 0 상계 달: 0선 위 무채색 상계 + 0선 아래 차감", () => {
    expect(monthlyGoalSegments({ confirmed: 100, highConfidence: 0, expected: -100, total: 0, positive: 100, negative: -100 })).toEqual([
      { key: "offset", start: 0, value: 100 },
      { key: "deduction", start: 0, value: -100 },
    ])
  })

  it("평범한 달은 확정 → 고확도 → 예정 순으로 쌓는다", () => {
    expect(monthlyGoalSegments({ confirmed: 40, highConfidence: 30, expected: 30, total: 100, positive: 100, negative: 0 })).toEqual([
      { key: "confirmed", start: 0, value: 40 },
      { key: "highConfidence", start: 40, value: 30 },
      { key: "expected", start: 70, value: 30 },
    ])
  })
})
