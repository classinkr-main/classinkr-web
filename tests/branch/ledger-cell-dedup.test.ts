import { describe, expect, it } from "vitest"
import {
  buildMatrixPendingByCell,
  lookupMatrixPending,
  matrixCoordKey,
  pendingCellAmount,
  railDedupTarget,
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

// 회귀 방지(품질 웨이브 3, 항목 3): 입력 레일(InputRailSection)에서 saveDraft로 저장할 때도
// 매트릭스 셀 재편집과 동일한 lookupMatrixPending 판정(railDedupTarget)이 같은 딜·같은 셀에
// 열린 초안을 정확히 찾아내야 한다 — 그래야 saveDraft가 새 POST 대신 그 초안을 PATCH해
// 이중계상을 막는다. 기간이동(period-shift)처럼 타겟 월이 실제로 다르면 매칭되지 않아야
// 정당한 별건 초안까지 막지 않는다.
describe("입력 레일 저장 이중계상 가드 (item 3, 레일 경로)", () => {
  it("같은 딜·같은 월에 이미 열린 초안이 있으면 레일 저장이 그 초안을 갱신 대상으로 판정한다", () => {
    const row = makeRow()
    const drafts: LedgerDraft[] = [makeDraft({ id: "srv-existing", month: "2026-08", amount: 1_200_000 })]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])

    const target = railDedupTarget(pendingByCell, row.id, "2026-08", "month", null)
    expect(target?.id).toBe("srv-existing")
  })

  it("기간 이동처럼 타겟 월이 다르면 별개 초안으로 판단해 막지 않는다", () => {
    const row = makeRow()
    // 기존 열린 초안은 8월 셀에 걸려 있다.
    const drafts: LedgerDraft[] = [makeDraft({ id: "srv-existing", month: "2026-08", amount: 1_200_000 })]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])

    // period-shift 저장의 타겟(이동 월)은 9월 — 좌표(coord.month)가 달라 매칭되지 않아야 한다.
    const target = railDedupTarget(pendingByCell, row.id, "2026-09", "month", null)
    expect(target).toBeNull()
  })

  it("주차 좌표까지 일치해야 매칭된다 — 같은 딜이라도 다른 주차 초안은 별건으로 본다", () => {
    const row = makeRow()
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "srv-w1", month: "2026-08", amount: 300_000, metadata: { week: "w1" } }),
    ]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])

    // 주차 초안이 걸린 그 주차를 타겟하면 매칭.
    expect(railDedupTarget(pendingByCell, row.id, "2026-08", "w1", null)?.id).toBe("srv-w1")
    // 같은 달 다른 주차(w2)를 타겟하면, 주차 키엔 없지만 월 키로 폴백되어(lookupMatrixPending의
    // 월 단위 폴백 규약) 여전히 "이 달에 이미 초안이 있다"는 신호로 매칭된다 — 매트릭스와 동일 동작.
    expect(railDedupTarget(pendingByCell, row.id, "2026-08", "w2", null)?.id).toBe("srv-w1")
  })

  it("편집 중인 초안 자신은 회피 대상에서 제외된다(excludeDraftId)", () => {
    const row = makeRow()
    const drafts: LedgerDraft[] = [makeDraft({ id: "srv-editing", month: "2026-08", amount: 1_200_000 })]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])

    // saveEditedDraft가 자기 자신(editingDraft.id)을 넘기면 "충돌"로 오탐하지 않는다.
    const target = railDedupTarget(pendingByCell, row.id, "2026-08", "month", "srv-editing")
    expect(target).toBeNull()
  })

  it("다른 초안과 충돌하면 excludeDraftId로 자기 자신만 걸러내고 나머지는 여전히 감지한다", () => {
    const row = makeRow()
    const drafts: LedgerDraft[] = [
      makeDraft({ id: "srv-editing", month: "2026-08", amount: 1_200_000 }),
      makeDraft({ id: "srv-other", month: "2026-09", amount: 900_000 }),
    ]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])

    // srv-editing을 9월로 옮기는 편집 중이라면, 9월엔 이미 srv-other가 열려 있어 충돌을 감지해야 한다.
    const target = railDedupTarget(pendingByCell, row.id, "2026-09", "month", "srv-editing")
    expect(target?.id).toBe("srv-other")
  })
})
