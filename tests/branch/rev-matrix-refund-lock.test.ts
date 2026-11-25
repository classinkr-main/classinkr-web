// 매트릭스 칸 잠금·주차 칸 표시(D2 환불 · F-04 정정 대체 · F-31 2월 W5)와 대기 금액(F-19).
//  - 시트 환불(음수)이 든 달은 금액과 무관하게 잠근다('환불 — 시트 값').
//  - computeWeekCellStates 는 양수 표시를 그대로 두고 환불을 refund 로 따로 싣는다. 2월은 W4 까지.
//  - 대기 금액은 칸 편집과 같은 종류의 초안만(고객 이름으로 걸린 신규 초안은 시트 행 금액처럼 보이지 않는다).
import { describe, expect, it } from "vitest"

import {
  buildMatrixPastePlan,
  computeWeekCellStates,
  isDraftFormTargetLocked,
  isMatrixCellLocked,
  isWholeMonthLock,
  matrixCellLockKind,
  type MatrixPendingDraft,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import { matrixMonthPendingTotal, matrixWeekPendingAmounts } from "@/components/admin/branch/ledger/RevMatrix"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTH = "2026-11"

function row(partial: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-1",
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    confidenceColorHint: true,
    ...partial,
  } as LedgerRevenueRow
}

function pending(partial: Partial<MatrixPendingDraft>): MatrixPendingDraft {
  return { id: "d-1", kind: "edit-row", amount: 0, confidence: "expected", weekly: null, weeklyConfidence: null, ...partial }
}

describe("matrixCellLockKind — 잠긴 까닭", () => {
  it("순액이 음수인 달(환불)은 잠근다 — 예전에는 금액 0 이하라 '미입력'으로 열려 있었다", () => {
    const refund = row({ monthlyPayments: { [MONTH]: -30_000 }, monthlyRed: { [MONTH]: true } })
    expect(matrixCellLockKind(refund, MONTH)).toBe("refund")
    expect(isMatrixCellLocked(refund, MONTH)).toBe(true)
  })

  it("순액은 양수여도 음수 주차가 있으면 잠근다(주차 병합이 음수를 0 으로 지운다)", () => {
    const mixed = row({ monthlyPayments: { [MONTH]: 70_000 }, weeklyPayments: { [MONTH]: [100_000, -30_000, 0, 0, 0] } })
    expect(matrixCellLockKind(mixed, MONTH)).toBe("refund")
  })

  it("정정 대체가 환불보다 먼저다 · 빈 달은 열려 있다 · 확정 달은 confirmed", () => {
    const refund = row({ monthlyPayments: { [MONTH]: -30_000 } })
    expect(matrixCellLockKind(refund, MONTH, new Set([MONTH]))).toBe("corrected")
    expect(matrixCellLockKind(row(), MONTH)).toBeNull()
    const confirmed = row({ monthlyPayments: { [MONTH]: 50_000 }, monthlyConfirmed: { [MONTH]: 50_000 } })
    expect(matrixCellLockKind(confirmed, MONTH)).toBe("confirmed")
  })

  it("주차 칸 전체 잠금은 정정 대체 · 환불 달뿐이다(확정 달은 빈 주차가 열린다, 2026-07-20)", () => {
    expect(isWholeMonthLock("corrected")).toBe(true)
    expect(isWholeMonthLock("refund")).toBe(true)
    expect(isWholeMonthLock("confirmed")).toBe(false)
    expect(isWholeMonthLock("ledger")).toBe(false)
    expect(isWholeMonthLock(null)).toBe(false)
  })

  it("레일 사전 검사도 환불 달을 막는다", () => {
    const refund = row({ monthlyPayments: { [MONTH]: -30_000 } })
    expect(isDraftFormTargetLocked(true, refund, MONTH)).toBe(true)
    expect(isDraftFormTargetLocked(false, refund, MONTH)).toBe(false)
  })

  it("붙여넣기 계획도 환불 달 칸을 locked 로 둔다", () => {
    const refund = row({ monthlyPayments: { [MONTH]: -30_000 } })
    const plan = buildMatrixPastePlan("50000", { rowId: refund.id, month: MONTH }, [refund], [MONTH], new Map())
    expect(plan?.cells[0]).toMatchObject({ status: "locked", current: 0, next: 50_000 })
  })
})

describe("computeWeekCellStates — 환불 · 없는 주차", () => {
  it("음수 주차는 display 0 · refund 로 싣고 잠근다. 양수 칸은 예전 그대로", () => {
    const states = computeWeekCellStates([100_000, -130_000, 0, 0, 0], 0, false)
    expect(states[0]).toEqual({ display: 100_000, isMonthOnly: false, locked: false })
    expect(states[1]).toEqual({ display: 0, isMonthOnly: false, locked: true, refund: -130_000 })
    expect(states[2]).toEqual({ display: 0, isMonthOnly: false, locked: false })
  })

  it("주차 값이 없는 환불 달은 순액을 마지막 주차의 환불(월합계만)로 둔다", () => {
    const states = computeWeekCellStates([0, 0, 0, 0, 0], -30_000, false)
    expect(states[4]).toEqual({ display: 0, isMonthOnly: true, locked: true, refund: -30_000 })
    expect(states.slice(0, 4).every((state) => state.refund == null && !state.locked)).toBe(true)
  })

  it("2월(weekCount 4): W5 는 absent, 월합계만은 W4, 시트에 없는 W5 값도 W4 로 합친다(F-31)", () => {
    const monthOnly = computeWeekCellStates([0, 0, 0, 0, 0], 800_000, false, 4)
    expect(monthOnly[3]).toEqual({ display: 800_000, isMonthOnly: true, locked: false })
    expect(monthOnly[4]).toEqual({ display: 0, isMonthOnly: false, locked: true, absent: true })

    const stray = computeWeekCellStates([10_000, 0, 0, 5_000, 2_000], 0, true, 4)
    expect(stray[3]).toEqual({ display: 7_000, isMonthOnly: false, locked: true })
    expect(stray[4]).toEqual({ display: 0, isMonthOnly: false, locked: true, absent: true })
  })

  it("weekCount 를 주지 않으면 예전 결과와 같다(5칸, W5 에 월합계만)", () => {
    expect(computeWeekCellStates([0, 0, 0, 0, 0], 30_000, true)[4]).toEqual({ display: 30_000, isMonthOnly: true, locked: true })
  })
})

describe("matrixWeekPendingAmounts · matrixMonthPendingTotal — 대기 금액(F-19)", () => {
  const sheet = row({ monthlyPayments: { [MONTH]: 2_430_000 }, weeklyPayments: { [MONTH]: [0, 2_430_000, 0, 0, 0] } })

  it("주차 키 초안은 그 칸에, 월 키의 주차 병합 초안은 바뀐 칸에만 대기 금액을 둔다", () => {
    const merged = pending({ amount: 3_000_000 + 1_234_567, weekly: [0, 3_000_000, 1_234_567, 0, 0], weeklyConfidence: [null, "confirmed", "expected", null, null] })
    const map = new Map([[`${sheet.id}::${MONTH}`, merged]])
    const out = matrixWeekPendingAmounts(sheet, MONTH, [0, 2_430_000, 0, 0, 0], map)
    expect(out).toEqual([null, { amount: 3_000_000, confidence: "confirmed" }, { amount: 1_234_567, confidence: "expected" }, null, null])
  })

  it("단일 주차 초안은 그 주차 칸의 금액(초안 금액)을 보인다", () => {
    const single = pending({ amount: 500_000, week: 3, confidence: "high-confidence" })
    const map = new Map([[`${sheet.id}::${MONTH}::w4`, single], [`${sheet.id}::${MONTH}`, single]])
    expect(matrixWeekPendingAmounts(sheet, MONTH, [0, 2_430_000, 0, 0, 0], map)[3]).toEqual({ amount: 500_000, confidence: "high-confidence" })
  })

  it("고객 이름으로만 걸린 신규 초안은 시트 행 칸에 대기 금액을 두지 않는다", () => {
    const newRow = pending({ kind: "new-row", amount: 900_000, weekly: [900_000, 0, 0, 0, 0] })
    const map = new Map([[`${sheet.id}::${MONTH}`, newRow]])
    expect(matrixWeekPendingAmounts(sheet, MONTH, [0, 2_430_000, 0, 0, 0], map)).toEqual([null, null, null, null, null])
    expect(matrixMonthPendingTotal(sheet, MONTH, 2_430_000, map)).toBeNull()
  })

  it("달 계: 수정 초안은 대체, 장부 행의 신규 초안은 더한다", () => {
    const edit = pending({ amount: 4_234_567 })
    expect(matrixMonthPendingTotal(sheet, MONTH, 2_430_000, new Map([[`${sheet.id}::${MONTH}`, edit]]))).toBe(4_234_567)
    const ledgerRow = row({ id: "ledger-e1", ledgerOrigin: "draft", draftKind: "new-row", draftMonth: MONTH, revenue: 100_000 })
    const add = pending({ kind: "new-row", amount: 50_000 })
    expect(matrixMonthPendingTotal(ledgerRow, MONTH, 100_000, new Map([[`${ledgerRow.id}::${MONTH}`, add]]))).toBe(150_000)
  })

  it("2월 W5 에는 대기 금액을 두지 않는다", () => {
    const feb = "2027-02"
    const merged = pending({ amount: 10, weekly: [0, 0, 0, 0, 10] })
    const map = new Map([[`${sheet.id}::${feb}`, merged]])
    expect(matrixWeekPendingAmounts(sheet, feb, [0, 0, 0, 0, 0], map)[4]).toBeNull()
  })
})
