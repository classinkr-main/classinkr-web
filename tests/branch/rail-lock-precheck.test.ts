import { describe, expect, it } from "vitest"
import {
  isDraftFormTargetLocked,
  resolveDraftEditTargetRow,
} from "@/components/admin/branch/SalesLedgerWorkbench"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 7, 항목 1): InputRailSection의 saveDraft/saveEditedDraft 제출 경로가
// isMatrixCellLocked(correctedMonths 포함)로 이미 잠긴 (딜, 월)을 targeting하면 서버에 보내기
// 전에 막아야 한다 — 그래야 적용된 정정과 겹쳐 409로 튕기는 헛수고가 없다. 이 스위트는 그 판정에
// 쓰는 두 순수 함수(resolveDraftEditTargetRow·isDraftFormTargetLocked)를 직접 구동한다.

function makeRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "row-1",
    sourceDealId: "deal-1",
    customer: "테스트 학원",
    manager: "김지사",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: {},
    ...overrides,
  }
}

function makeDraft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  const now = new Date().toISOString()
  return {
    id: "srv-1",
    kind: "edit-row",
    status: "draft",
    sourceDealId: "deal-1",
    customer: "테스트 학원",
    manager: "김지사",
    team: "BD",
    month: "2026-08",
    amount: 1_000_000,
    note: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("resolveDraftEditTargetRow — 레일 폼이 targeting하는 행 판정", () => {
  it("편집 중이 아니면 selectedRow를 그대로 targeting한다", () => {
    const row = makeRow()
    expect(resolveDraftEditTargetRow(null, row, new Map())).toBe(row)
  })

  it("편집 중이 아니고 selectedRow도 없으면 undefined다", () => {
    expect(resolveDraftEditTargetRow(null, null, new Map())).toBeUndefined()
  })

  it("edit-row 초안을 편집 중이면 sourceDealId로 대응 행을 찾는다(selectedRow 무시)", () => {
    const row = makeRow({ id: "row-2", sourceDealId: "deal-2" })
    const otherSelectedRow = makeRow({ id: "row-9", sourceDealId: "deal-9" })
    const rowByDealKey = new Map([["deal-2", row]])
    const draft = makeDraft({ sourceDealId: "deal-2" })
    expect(resolveDraftEditTargetRow(draft, otherSelectedRow, rowByDealKey)).toBe(row)
  })

  it("edit-row 초안의 sourceDealId가 비어 있으면 metadata.sourceDealId로 폴백한다", () => {
    const row = makeRow({ id: "row-3", sourceDealId: "deal-3" })
    const rowByDealKey = new Map([["deal-3", row]])
    const draft = makeDraft({ sourceDealId: undefined, metadata: { sourceDealId: "deal-3" } })
    expect(resolveDraftEditTargetRow(draft, null, rowByDealKey)).toBe(row)
  })

  it("new-row 초안을 편집 중이면 대응 매트릭스 행이 없어 undefined다", () => {
    const draft = makeDraft({ kind: "new-row", sourceDealId: undefined, customer: "새 학원" })
    const rowByDealKey = new Map([["deal-1", makeRow()]])
    expect(resolveDraftEditTargetRow(draft, makeRow(), rowByDealKey)).toBeUndefined()
  })

  it("edit-row 초안인데 대응 딜 키가 rowByDealKey에 없으면 undefined다(딜이 필터로 안 보이는 상태)", () => {
    const draft = makeDraft({ sourceDealId: "deal-missing" })
    expect(resolveDraftEditTargetRow(draft, null, new Map())).toBeUndefined()
  })
})

describe("isDraftFormTargetLocked — 잠금 사전검사(품질 웨이브 7, 항목 1)", () => {
  it("isEditRowTarget=false면(new-row 경로) 행·월과 무관하게 항상 false다", () => {
    const row = makeRow({ monthlyPayments: { "2026-08": 1_000_000 }, monthlyConfirmed: { "2026-08": 1_000_000 } })
    expect(isDraftFormTargetLocked(false, row, "2026-08")).toBe(false)
  })

  it("targetRow가 없으면(선택된 행 없음) false다", () => {
    expect(isDraftFormTargetLocked(true, undefined, "2026-08")).toBe(false)
    expect(isDraftFormTargetLocked(true, null, "2026-08")).toBe(false)
  })

  it("isEditRowTarget=true이고 그 달이 확정으로 잠겨 있으면 true다(isMatrixCellLocked 위임)", () => {
    const row = makeRow({
      monthlyPayments: { "2026-08": 1_000_000 },
      monthlyConfirmed: { "2026-08": 1_000_000 },
    })
    expect(isDraftFormTargetLocked(true, row, "2026-08")).toBe(true)
  })

  it("isEditRowTarget=true이고 그 달이 잠겨 있지 않으면 false다", () => {
    const row = makeRow({ monthlyPayments: { "2026-08": 1_000_000 } })
    expect(isDraftFormTargetLocked(true, row, "2026-08")).toBe(false)
  })

  it("correctedMonths(정정 적용으로 재잠금된 달)도 그대로 전달돼 금액과 무관하게 잠근다", () => {
    // adjustedSheetRows가 정정 적용 후 그 달 금액을 0으로 지운 상태를 흉내낸다.
    const row = makeRow({ monthlyPayments: { "2026-08": 0 } })
    const correctedMonths = new Set(["2026-08"])
    expect(isDraftFormTargetLocked(true, row, "2026-08", correctedMonths)).toBe(true)
  })

  it("correctedMonths가 다른 달이면 이 달 판정에 영향을 주지 않는다", () => {
    const row = makeRow({ monthlyPayments: { "2026-08": 1_000_000 } })
    const correctedMonths = new Set(["2026-09"])
    expect(isDraftFormTargetLocked(true, row, "2026-08", correctedMonths)).toBe(false)
  })
})
