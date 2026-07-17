import { describe, expect, it } from "vitest"
import {
  buildMatrixPendingByCell,
  lookupMatrixPending,
  matrixCoordKey,
  pendingCellAmount,
  type MatrixCellCoord,
} from "@/components/admin/branch/SalesLedgerWorkbench"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/SalesLedgerWorkbench"

// 회귀 방지(품질 웨이브 2, 항목 1 — P0): 매트릭스 셀 재편집 시 대기 초안이 있으면 새 초안을
// 만들지 않고 그 초안을 갱신 대상으로 삼아야 한다. sourceDealId+month에 DB 유일성이 없어,
// 재편집마다 새 초안을 만들면 두 초안이 모두 적용됐을 때 같은 셀 매출이 이중 계상된다.
// 이 테스트는 onCommitCell/beginEdit이 실제로 쓰는 순수 함수(buildMatrixPendingByCell·
// lookupMatrixPending·pendingCellAmount)를 그대로 구동해 "같은 셀 2회 편집 → 초안 1건 유지"를 검증한다.

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
    monthlyPayments: { "2026-08": 1_000_000 },
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
    amount: 1_500_000,
    note: "",
    metadata: { week: "month" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// 매트릭스 UI의 커밋 결정을 그대로 흉내: pendingByCell에 이 셀의 초안이 있으면 PATCH(갱신),
// 없으면 POST(신규 push) — SalesLedgerWorkbench의 onCommitCell과 동일한 분기.
function commitCell(drafts: LedgerDraft[], row: LedgerRevenueRow, coord: MatrixCellCoord, amount: number): LedgerDraft[] {
  const pendingByCell = buildMatrixPendingByCell(drafts, [row])
  const existing = lookupMatrixPending(pendingByCell, coord)
  if (existing) {
    return drafts.map((draft) => (draft.id === existing.id ? { ...draft, amount, updatedAt: new Date().toISOString() } : draft))
  }
  const created = makeDraft({ id: `srv-${drafts.length + 1}`, month: coord.month, amount })
  return [created, ...drafts]
}

describe("매트릭스 셀 재편집 초안 중복 방지 (item 1, P0)", () => {
  it("같은 월 셀을 두 번 편집해도 초안이 1건만 유지된다", () => {
    const row = makeRow()
    const coord: MatrixCellCoord = { rowId: row.id, month: "2026-08" }

    let drafts: LedgerDraft[] = []
    drafts = commitCell(drafts, row, coord, 1_500_000)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].amount).toBe(1_500_000)

    // 재편집: 시작값이 시트 원값(¥1,000,000)이 아니라 대기 초안 금액(¥1,500,000)이어야 한다.
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])
    const pending = lookupMatrixPending(pendingByCell, coord)
    expect(pending?.id).toBe(drafts[0].id)
    expect(pendingCellAmount(pending!, coord.week)).toBe(1_500_000)

    drafts = commitCell(drafts, row, coord, 1_800_000)
    expect(drafts).toHaveLength(1) // 두 번째 초안이 새로 생기지 않는다 — 이중계상 차단
    expect(drafts[0].amount).toBe(1_800_000)
    expect(drafts[0].id).toBe("srv-1")
  })

  it("서로 다른 셀(다른 월) 편집은 각자 별도 초안을 만든다", () => {
    const row = makeRow()
    let drafts: LedgerDraft[] = []
    drafts = commitCell(drafts, row, { rowId: row.id, month: "2026-08" }, 1_500_000)
    drafts = commitCell(drafts, row, { rowId: row.id, month: "2026-09" }, 900_000)
    expect(drafts).toHaveLength(2)
    expect(new Set(drafts.map((d) => d.month))).toEqual(new Set(["2026-08", "2026-09"]))
  })

  it("주차 병합 초안(metadata.weekly)은 그 주차 값을 재편집 시작값으로 돌려준다", () => {
    const row = makeRow()
    const weekCoord: MatrixCellCoord = { rowId: row.id, month: "2026-08", week: 1 } // W2
    const drafts: LedgerDraft[] = [
      makeDraft({
        id: "srv-week",
        month: "2026-08",
        amount: 700_000, // 병합 후 월 합계
        metadata: { week: "w2", weekly: [0, 300_000, 0, 0, 400_000] },
      }),
    ]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])
    const monthCoord: MatrixCellCoord = { rowId: row.id, month: "2026-08" }
    const pendingForMonth = lookupMatrixPending(pendingByCell, monthCoord)
    const pendingForWeek = lookupMatrixPending(pendingByCell, weekCoord)
    expect(pendingForMonth?.id).toBe("srv-week")
    expect(pendingCellAmount(pendingForMonth!, monthCoord.week)).toBe(700_000) // 월 셀 재편집 = 합계 기준
    expect(pendingForWeek?.id).toBe("srv-week")
    expect(pendingCellAmount(pendingForWeek!, weekCoord.week)).toBe(300_000) // W2 재편집 = 그 주차 값 기준
  })

  it("matrixCoordKey는 월/주차 키를 안정적으로 생성한다(월 셀 키 회귀 방지)", () => {
    expect(matrixCoordKey({ rowId: "row-1", month: "2026-08" })).toBe("row-1::2026-08")
    expect(matrixCoordKey({ rowId: "row-1", month: "2026-08", week: 0 })).toBe("row-1::2026-08::w1")
  })
})
