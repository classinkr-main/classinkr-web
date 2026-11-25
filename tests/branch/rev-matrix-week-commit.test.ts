// 주차 칸 커밋 병합(F-02 · F-05)과 칸 저장 스냅샷(F-17) — rev-matrix-logic 의 순수 함수만 돌린다.
//  - 같은 달 두 번째 주차 입력이 첫 주차를 지우지 않는다(빈 달 W3 → W4, 시트 주차 W2 → W4).
//  - 응답이 오기 전에 다시 고친 경우: 보낸 입력(pendingFromDraftInput)을 기준으로 삼는다.
//  - 결과는 늘 metadata.weekly(5칸) — 2월 W5 는 W4 로 합친다(F-31).
//  - 칸 저장 스냅샷 행에 계약·경로·계약 목표·중요도가 실린다.
import { describe, expect, it } from "vitest"

import {
  buildMatrixPendingByCell,
  cellCommitMonthKey,
  cellDraftSnapshotRow,
  mergeWeekCellCommit,
  pendingFromDraftInput,
  type MatrixPendingDraft,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTH = "2026-12"

function sheetRow(partial: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-1",
    customer: "예시학원",
    manager: "예시A",
    team: "BD",
    region: "서울",
    revenue: 0,
    ledgerOrigin: "sheet",
    ...partial,
  } as LedgerRevenueRow
}

/** 워크벤치가 보낼 입력(metadata 만) — 병합 결과를 그대로 싣는다. */
function sentInput(result: ReturnType<typeof mergeWeekCellCommit>, week: number) {
  return {
    kind: "edit-row" as const,
    amount: result.amount,
    metadata: { week: `w${week + 1}`, weekly: result.weekly, weeklyConfidence: result.weeklyConfidence, confidence: "expected" },
  }
}

describe("mergeWeekCellCommit — 같은 달 주차를 잇는다(F-02)", () => {
  it("빈 달 W3 → W4: 두 번째 주차가 첫 주차를 지우지 않는다", () => {
    const row = sheetRow()
    const first = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 2, amount: 1_234_567 })
    expect(first).toMatchObject({ amount: 1_234_567, weekly: [0, 0, 1_234_567, 0, 0], base: "empty", replacedMonthDraft: false })

    // 서버 목록에 들어온 대기 초안(주차 병합) 위에 W4 를 얹는다.
    const pending: MatrixPendingDraft = pendingFromDraftInput(sentInput(first, 2), "d-1")
    const second = mergeWeekCellCommit({ pendingDraft: pending, sheetRow: row, month: MONTH, week: 3, amount: 500_000, confidence: "high-confidence" })
    expect(second.weekly).toEqual([0, 0, 1_234_567, 500_000, 0])
    expect(second.amount).toBe(1_734_567)
    expect(second.base).toBe("pending")
    expect(second.weeklyConfidence).toEqual([null, null, "expected", "high-confidence", null])
  })

  it("시트 주차 W2 → W4 → W2 다시: 시트 주차와 대기 주차를 함께 지킨다", () => {
    const row = sheetRow({ monthlyPayments: { [MONTH]: 200_000 }, weeklyPayments: { [MONTH]: [0, 200_000, 0, 0, 0] } })
    const w4 = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 3, amount: 300_000 })
    expect(w4).toMatchObject({ weekly: [0, 200_000, 0, 300_000, 0], amount: 500_000, base: "sheet" })

    // 예전에는 W2 재편집이 시트 주차만 기준으로 삼아 대기 중인 W4 300,000 을 지웠다.
    const w2 = mergeWeekCellCommit({ pendingDraft: pendingFromDraftInput(sentInput(w4, 3)), sheetRow: row, month: MONTH, week: 1, amount: 250_000 })
    expect(w2.weekly).toEqual([0, 250_000, 0, 300_000, 0])
    expect(w2.amount).toBe(550_000)
  })

  it("응답이 오기 전에 다시 고쳐도(F-05) 보낸 입력을 기준으로 이어 붙인다", () => {
    const row = sheetRow()
    const inFlight = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 2, amount: 100_000 })
    // 목록(drafts)에는 아직 없다 — 호출부는 방금 보낸 입력을 요약해 넘긴다.
    const again = mergeWeekCellCommit({
      pendingDraft: pendingFromDraftInput(sentInput(inFlight, 2)),
      sheetRow: row,
      month: MONTH,
      week: 4,
      amount: 70_000,
    })
    expect(again.weekly).toEqual([0, 0, 100_000, 0, 70_000])
    expect(again.amount).toBe(170_000)
    // 같은 칸을 다시 고치면 그 칸만 바뀐다.
    const sameCell = mergeWeekCellCommit({
      pendingDraft: pendingFromDraftInput(sentInput(again, 4)),
      sheetRow: row,
      month: MONTH,
      week: 4,
      amount: 90_000,
    })
    expect(sameCell.weekly).toEqual([0, 0, 100_000, 0, 90_000])
  })

  it("주차 병합이 없는 한 주차 초안(옛 초안)은 그 주차 금액만 들고, 나머지는 시트 주차로 채운다", () => {
    const row = sheetRow({ monthlyPayments: { [MONTH]: 40_000 }, weeklyPayments: { [MONTH]: [40_000, 0, 0, 0, 0] } })
    const pending: MatrixPendingDraft = { id: "d-legacy", kind: "edit-row", amount: 60_000, confidence: "confirmed", weekly: null, weeklyConfidence: null, week: 2 }
    const result = mergeWeekCellCommit({ pendingDraft: pending, sheetRow: row, month: MONTH, week: 3, amount: 10_000 })
    expect(result.weekly).toEqual([40_000, 0, 60_000, 10_000, 0])
    expect(result.weeklyConfidence).toEqual([null, null, "confirmed", "expected", null])
    expect(result.base).toBe("pending")
  })

  it("대기 초안이 주차 없는 월 금액 초안이면 그 달이 주차 합으로 바뀐다고 알린다", () => {
    const row = sheetRow({ monthlyPayments: { [MONTH]: 800_000 } })
    const pending: MatrixPendingDraft = { id: "d-month", kind: "edit-row", amount: 900_000, confidence: "expected", weekly: null, weeklyConfidence: null, week: null }
    const result = mergeWeekCellCommit({ pendingDraft: pending, sheetRow: row, month: MONTH, week: 1, amount: 100_000 })
    expect(result).toMatchObject({ weekly: [0, 100_000, 0, 0, 0], amount: 100_000, replacedMonthDraft: true, base: "empty" })
  })

  it("2월 W5 는 W4 로 놓는다 — 시트에 W5 가 없다(F-31)", () => {
    const feb = "2027-02"
    const row = sheetRow({ monthlyPayments: { [feb]: 30_000 }, weeklyPayments: { [feb]: [0, 30_000, 0, 0, 0] } })
    const result = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: feb, week: 4, amount: 5_000 })
    expect(result.week).toBe(3)
    expect(result.weekly).toEqual([0, 30_000, 0, 5_000, 0])
    // 대기 초안에 남은 W5 값도 W4 로 합친다.
    const pending: MatrixPendingDraft = { id: "d", kind: "edit-row", amount: 9_000, confidence: "expected", weekly: [0, 0, 0, 1_000, 8_000], weeklyConfidence: null }
    expect(mergeWeekCellCommit({ pendingDraft: pending, sheetRow: row, month: feb, week: 0, amount: 2_000 }).weekly).toEqual([2_000, 0, 0, 9_000, 0])
  })

  it("음수 입력·음수 시트 주차는 0 으로 읽는다(환불 달은 칸이 잠겨 여기 오지 않는다)", () => {
    const row = sheetRow({ monthlyPayments: { [MONTH]: 70_000 }, weeklyPayments: { [MONTH]: [100_000, -30_000, 0, 0, 0] } })
    const result = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 2, amount: -5 })
    expect(result.weekly).toEqual([100_000, 0, 0, 0, 0])
  })

  it("장부 입력 행의 자기 달은 저장된 주차별 확도를 나머지 주차에 잇는다", () => {
    const row = sheetRow({
      ledgerOrigin: "draft",
      draftMonth: MONTH,
      monthlyPayments: { [MONTH]: 50_000 },
      weeklyPayments: { [MONTH]: [50_000, 0, 0, 0, 0] },
      draftMetadata: { weekly: [50_000, 0, 0, 0, 0], weeklyConfidence: ["confirmed", null, null, null, null] },
    })
    const result = mergeWeekCellCommit({ pendingDraft: null, sheetRow: row, month: MONTH, week: 1, amount: 20_000, confidence: "high-confidence" })
    expect(result.weeklyConfidence).toEqual(["confirmed", "high-confidence", null, null, null])
  })
})

describe("pendingFromDraftInput · buildMatrixPendingByCell — 주차 토큰을 싣는다", () => {
  it("보낸 입력의 주차 병합·주차 토큰·확도 선택 표시를 그대로 요약한다", () => {
    const summary = pendingFromDraftInput({
      kind: "edit-row",
      amount: 300,
      metadata: { week: "w3", weekly: [0, 0, 300, 0, 0], weeklyConfidence: [null, null, "confirmed", null, null], confidence: "confirmed", confidenceTouched: true },
    })
    expect(summary).toMatchObject({ kind: "edit-row", amount: 300, week: 2, weekly: [0, 0, 300, 0, 0], confidence: "confirmed", confidenceTouched: true })
  })

  it("buildMatrixPendingByCell 이 초안의 주차(metadata.week)를 week 로 싣는다", () => {
    const row = sheetRow()
    const draft: LedgerDraft = {
      id: "d-1",
      kind: "edit-row",
      status: "checked",
      sourceDealId: row.id,
      customer: row.customer,
      manager: "예시A",
      team: "BD",
      month: MONTH,
      amount: 100,
      note: "",
      metadata: { week: "w4" },
      createdAt: "2026-11-25T00:00:00Z",
      updatedAt: "2026-11-25T00:00:00Z",
    }
    const map = buildMatrixPendingByCell([draft], [row])
    expect(map.get(`${row.id}::${MONTH}`)?.week).toBe(3)
    expect(map.get(`${row.id}::${MONTH}::w4`)?.week).toBe(3)
  })

  it("cellCommitMonthKey — 같은 달의 주차는 같은 키(기준을 잇는 단위)", () => {
    expect(cellCommitMonthKey("deal-1", MONTH, "edit-row")).toBe(`edit-row::deal-1::${MONTH}`)
  })
})

describe("cellDraftSnapshotRow — 칸 저장 스냅샷에 분류를 싣는다(F-17)", () => {
  it("계약·경로·계약 목표·중요도와 직전 금액을 싣는다", () => {
    const row = sheetRow({ status: "Renew", dealType: "Channel", contractTarget: 1_200_000, importance: "KA", firstPayment: "2025-04-03", productVersion: "ClassIn X" })
    expect(cellDraftSnapshotRow(row, 40_000)).toEqual({
      id: "deal-1",
      customer: "예시학원",
      manager: "예시A",
      team: "BD",
      region: "서울",
      productVersion: "ClassIn X",
      firstPayment: "2025-04-03",
      status: "Renew",
      dealType: "Channel",
      contractTarget: 1_200_000,
      importance: "KA",
      monthAmount: 40_000,
    })
  })

  it("분류가 없는 행은 null 로 싣는다(키는 있다)", () => {
    const snapshot = cellDraftSnapshotRow(sheetRow(), 0)
    expect(snapshot).toMatchObject({ status: null, dealType: null, contractTarget: null, importance: null, firstPayment: null })
  })
})
