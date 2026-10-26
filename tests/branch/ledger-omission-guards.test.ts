import { describe, expect, it } from "vitest"

import {
  buildMatrixPendingByCell,
  lookupMatrixPending,
  matrixCoordKey,
  railDedupTarget,
  rowCommitKind,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import { capLedgerDrafts, ledgerTruncationNotice } from "@/components/admin/branch/ledger/useLedgerDraftQueue"
import { alignOpenDraftsToSheetRows, resolveCorrectionTargets, snapshotSheetRowId } from "@/components/admin/branch/ledger/workbench-shared"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

// 매출 장부 누락·이중 계상 가드 3건(2026-10-23 결함 점검).
//   1) 시트를 다시 가져와 행 id가 바뀌어도, 장부에서 반영한 수정이 원본 시트 행의 그 달을 대체한다.
//   2) 열린 초안은 목록에서 잘리지 않는다(끝난 초안 이력만 자른다).
//   3) 고객명으로 기존 시트 행 칸에 걸린 신규 초안은 그 칸의 수정 대상이 아니다.

function sheetRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "line-1",
    sheetRow: 12,
    customer: "한빛수학",
    manager: "Han",
    team: "BD",
    region: null,
    revenue: 0,
    productVersion: "SW",
    ledgerOrigin: "sheet",
    monthlyPayments: { "2026-11": 48_000 },
    ...overrides,
  }
}

function correction(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "ledger-entry-1",
    sheetRow: 12,
    customer: "한빛수학",
    manager: "Han",
    team: "BD",
    region: null,
    revenue: 52_000,
    productVersion: "SW",
    ledgerOrigin: "draft",
    draftKind: "edit-row",
    draftMonth: "2026-11",
    sourceDealId: "line-1",
    monthlyPayments: { "2026-11": 52_000 },
    ...overrides,
  }
}

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  const now = "2026-10-23T00:00:00Z"
  return {
    id: "d-1",
    kind: "edit-row",
    status: "checked",
    sourceDealId: "line-1",
    customer: "한빛수학",
    manager: "Han",
    team: "BD",
    month: "2026-11",
    amount: 52_000,
    note: "",
    metadata: { week: "month" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe("1) 반영한 수정의 원본 시트 행 찾기(resolveCorrectionTargets)", () => {
  it("같은 id면 그 행의 달을 대체한다", () => {
    const result = resolveCorrectionTargets([correction()], [sheetRow()])
    expect(result.overrides.get("line-1")).toEqual(new Set(["2026-11"]))
    expect(result.unresolved).toEqual([])
  })

  it("시트를 다시 가져와 행 id가 바뀌어도 같은 시트 행 번호·고객이면 원본으로 찾는다(이중 계상 방지)", () => {
    const reimported = sheetRow({ id: "line-NEW" })
    const result = resolveCorrectionTargets([correction()], [reimported])
    expect(result.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))
    expect(result.unresolved).toEqual([])
  })

  it("행이 위아래로 밀려 번호가 바뀌어도 같은 고객·같은 상품 행이 하나면 그 행으로 찾는다", () => {
    const moved = sheetRow({ id: "line-NEW", sheetRow: 15, customer: "한빛 수학" })
    const result = resolveCorrectionTargets([correction()], [moved, sheetRow({ id: "other", sheetRow: 16, customer: "가온어학원" })])
    expect(result.overrides.get("line-NEW")).toEqual(new Set(["2026-11"]))
  })

  it("같은 고객·같은 상품 행이 둘 이상이면 고르지 않고 unresolved로 돌린다(화면이 경고)", () => {
    const a = sheetRow({ id: "a", sheetRow: 20 })
    const b = sheetRow({ id: "b", sheetRow: 21 })
    const result = resolveCorrectionTargets([correction()], [a, b])
    expect(result.overrides.size).toBe(0)
    expect(result.unresolved.map((row) => row.id)).toEqual(["ledger-entry-1"])
  })

  it("원본 행이 시트에서 사라졌으면 unresolved", () => {
    const result = resolveCorrectionTargets([correction()], [sheetRow({ id: "x", customer: "다른 학원" })])
    expect(result.unresolved).toHaveLength(1)
  })
})

describe("1-a) 시트 Row ID 가 있으면 그것이 원본 행 찾기 1순위다(ADR-011 숨김 열)", () => {
  it("행 순서가 섞여 번호·id 가 모두 바뀌고 같은 고객·상품 행이 여럿이어도 Row ID 로 정확히 찾는다", () => {
    const a = sheetRow({ id: "line-A", sheetRow: 40, rowId: "r_aaaaaaaaaaaa" })
    const b = sheetRow({ id: "line-B", sheetRow: 41, rowId: "r_bbbbbbbbbbbb" })
    const result = resolveCorrectionTargets([correction({ draftId: "d-1", sourceDealId: "gone", sheetRow: 12 })], [a, b], () => "r_bbbbbbbbbbbb")
    expect(result.overrides.get("line-B")).toEqual(new Set(["2026-11"]))
    expect(result.unresolved).toEqual([])
  })

  it("Row ID 가 중복·형식 오류로 표시된 행(rowIdIssue)은 Row ID 로 고르지 않는다", () => {
    const bad = sheetRow({ id: "line-A", sheetRow: 40, rowId: "r_aaaaaaaaaaaa", rowIdIssue: "duplicate" })
    const other = sheetRow({ id: "line-B", sheetRow: 41, rowId: null })
    const result = resolveCorrectionTargets([correction({ sourceDealId: "gone", sheetRow: 99 })], [bad, other], () => "r_aaaaaaaaaaaa")
    expect(result.overrides.size).toBe(0)
    expect(result.unresolved).toHaveLength(1)
  })

  it("열린 수정 초안은 sourceSnapshot.sheetBaseline.rowId 로 지금 행에 맞춘다", () => {
    const reimported = sheetRow({ id: "line-NEW", sheetRow: 77, rowId: "r_cccccccccccc" })
    const open = draft({ id: "edit-open", sourceDealId: "line-1", sourceSheetRow: 12, sourceSnapshot: { sheetBaseline: { rowId: "r_cccccccccccc" } } })
    expect(snapshotSheetRowId(open.sourceSnapshot)).toBe("r_cccccccccccc")
    expect(alignOpenDraftsToSheetRows([open], [reimported, sheetRow({ id: "line-X", sheetRow: 12 })])[0].sourceDealId).toBe("line-NEW")
  })
})

describe("1-b) 열린 수정 초안도 다시 가져온 시트 행에 걸린다(alignOpenDraftsToSheetRows)", () => {
  it("옛 행 id를 가진 열린 수정 초안을 지금 행 id로 맞춰, 같은 칸 재편집이 새 초안 대신 그 초안을 고치게 한다", () => {
    const reimported = sheetRow({ id: "line-NEW" })
    const open = draft({ id: "edit-open", sourceDealId: "line-1", sourceSheetRow: 12 })
    const aligned = alignOpenDraftsToSheetRows([open], [reimported])
    expect(aligned[0].sourceDealId).toBe("line-NEW")
    const pendingByCell = buildMatrixPendingByCell(aligned, [reimported])
    expect(lookupMatrixPending(pendingByCell, { rowId: "line-NEW", month: "2026-11" }, "edit-row")?.id).toBe("edit-open")
  })

  it("이미 맞는 초안·끝난 초안·신규 초안은 건드리지 않는다(같은 배열을 돌려준다)", () => {
    const rows = [sheetRow()]
    const drafts = [
      draft({ id: "ok", sourceDealId: "line-1" }),
      draft({ id: "done", status: "applied", sourceDealId: "gone" }),
      draft({ id: "new", kind: "new-row", sourceDealId: undefined }),
    ]
    expect(alignOpenDraftsToSheetRows(drafts, rows)).toBe(drafts)
  })
})

describe("2) 열린 초안은 목록에서 잘리지 않는다(capLedgerDrafts)", () => {
  it("열린 초안·로컬 초안은 모두 남기고, 끝난 초안만 최근 N건으로 자른다", () => {
    const open = Array.from({ length: 80 }, (_, index) => draft({ id: `open-${index}`, status: index % 2 ? "draft" : "checked" }))
    const local = draft({ id: "local-1", status: "applied" })
    const closed = Array.from({ length: 70 }, (_, index) => draft({ id: `done-${index}`, status: index % 2 ? "applied" : "cancelled" }))
    const kept = capLedgerDrafts([...open, local, ...closed], 50)
    expect(kept.filter((item) => item.id.startsWith("open-"))).toHaveLength(80)
    expect(kept.some((item) => item.id === "local-1")).toBe(true)
    expect(kept.filter((item) => item.id.startsWith("done-"))).toHaveLength(50)
  })

  it("서버 목록이 상한에 닿으면 경고 문구를 만든다", () => {
    expect(ledgerTruncationNotice(undefined)).toBeNull()
    expect(ledgerTruncationNotice({ openDrafts: false, entries: false })).toBeNull()
    expect(ledgerTruncationNotice({ openDrafts: true })).toContain("열린 초안")
    expect(ledgerTruncationNotice({ entries: true })).toContain("반영값")
  })
})

describe("3) 고객명으로 걸린 신규 초안은 기존 행 칸의 수정 대상이 아니다", () => {
  const row = sheetRow()
  const coord = { rowId: row.id, month: "2026-11" }

  it("시트 행의 커밋 종류는 수정, 원천 딜 없는 행은 신규", () => {
    expect(rowCommitKind(row)).toBe("edit-row")
    expect(rowCommitKind({ id: "draft-x", ledgerOrigin: "draft", sourceDealId: undefined })).toBe("new-row")
  })

  it("같은 고객 신규 초안만 있으면 수정 커밋은 그 초안을 PATCH하지 않는다", () => {
    const pendingByCell = buildMatrixPendingByCell([draft({ id: "new-1", kind: "new-row", sourceDealId: undefined })], [row])
    // 칸 점 표시는 남는다(어떤 초안이든) — 편집 대상 판정만 종류를 본다.
    expect(lookupMatrixPending(pendingByCell, coord)?.id).toBe("new-1")
    expect(lookupMatrixPending(pendingByCell, coord, "edit-row")).toBeNull()
    expect(railDedupTarget(pendingByCell, row.id, "2026-11", "month", null)).toBeNull()
  })

  it("같은 칸에 더 새 신규 초안과 기존 수정 초안이 함께 있으면 수정 초안이 그 칸을 차지한다", () => {
    const drafts = [
      draft({ id: "new-1", kind: "new-row", sourceDealId: undefined, updatedAt: "2026-10-23T01:00:00Z" }),
      draft({ id: "edit-1", kind: "edit-row" }),
    ]
    const pendingByCell = buildMatrixPendingByCell(drafts, [row])
    expect(pendingByCell.get(matrixCoordKey(coord))?.id).toBe("edit-1")
    expect(lookupMatrixPending(pendingByCell, coord, "edit-row")?.id).toBe("edit-1")
  })
})
