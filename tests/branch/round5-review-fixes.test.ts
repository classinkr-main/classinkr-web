// 라운드 5 독립 리뷰가 찾은 결함 9건의 회귀 고정. 순수 함수는 직접 구동하고, 워크벤치 배선은 소스로 확인한다.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  buildMatrixPendingByCell,
  lookupMatrixPending,
  matrixDisplayedCellAmount,
  pendingMatchesKind,
  pendingWeekDisplay,
  previewMatrixAmount,
  railDedupTarget,
  rowCommitKind,
} from "@/components/admin/branch/ledger/rev-matrix-logic"
import type { LedgerDraft, LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

function row(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
  return {
    id: "deal-a",
    customer: "한빛학원",
    manager: "Minjae",
    team: "BD",
    region: null,
    revenue: 0,
    ledgerOrigin: "sheet",
    monthlyPayments: { "2026-10": 1_000_000 },
    ...overrides,
  } as LedgerRevenueRow
}

function draft(overrides: Partial<LedgerDraft> = {}): LedgerDraft {
  return {
    id: "d-edit",
    kind: "edit-row",
    status: "checked",
    sourceDealId: "deal-a",
    customer: "한빛학원",
    manager: "Minjae",
    team: "BD",
    month: "2026-10",
    amount: 1_200_000,
    note: "",
    metadata: { week: "month" },
    createdAt: "2026-09-23T00:00:00Z",
    updatedAt: "2026-09-23T00:00:00Z",
    ...overrides,
  }
}

const newRowDraft = draft({ id: "d-new", kind: "new-row", sourceDealId: undefined, amount: 300_000 })

describe("#7 신규 초안은 기존 딜 칸의 값·편집 대상이 아니다", () => {
  it("rowCommitKind — 원천 딜이 있으면 수정, 없으면 신규", () => {
    expect(rowCommitKind(row())).toBe("edit-row")
    expect(rowCommitKind(row({ ledgerOrigin: "draft", sourceDealId: undefined, id: "draft:1" }))).toBe("new-row")
    expect(rowCommitKind(row({ ledgerOrigin: "draft", sourceDealId: "deal-a", id: "draft:2" }))).toBe("edit-row")
  })

  it("pendingMatchesKind — kind 없는 요약(과거 호출부)은 양쪽과 맞는다", () => {
    expect(pendingMatchesKind({ kind: "new-row" }, "edit-row")).toBe(false)
    expect(pendingMatchesKind({ kind: "new-row" }, "new-row")).toBe(true)
    expect(pendingMatchesKind({}, "edit-row")).toBe(true)
    expect(pendingMatchesKind({}, "new-row")).toBe(true)
  })

  it("같은 칸에 수정·신규가 함께 걸리면 더 최근 신규가 있어도 수정 초안이 칸을 차지한다(이중 계상 방지)", () => {
    const map = buildMatrixPendingByCell([newRowDraft, draft()], [row()]) // drafts는 최신이 앞
    expect(map.get("deal-a::2026-10")?.id).toBe("d-edit")
  })

  it("수정 저장·셀 재편집의 갱신 대상은 수정 초안뿐 — 신규 초안만 걸린 칸은 새 수정 초안을 만든다", () => {
    const onlyNew = buildMatrixPendingByCell([newRowDraft], [row()])
    expect(onlyNew.get("deal-a::2026-10")?.kind).toBe("new-row")
    expect(lookupMatrixPending(onlyNew, { rowId: "deal-a", month: "2026-10" }, "edit-row")).toBeNull()
    expect(railDedupTarget(onlyNew, "deal-a", "2026-10", "month", null)).toBeNull()
    // kind를 주지 않는 조회(표시용)는 그대로 찾는다.
    expect(lookupMatrixPending(onlyNew, { rowId: "deal-a", month: "2026-10" })?.id).toBe("d-new")
  })

  it("칸 표시·복사: 더해지는 신규 초안은 장부 값 그대로, 주차 칸은 additive 표시만", () => {
    const onlyNew = buildMatrixPendingByCell([newRowDraft], [row()])
    expect(matrixDisplayedCellAmount(row(), { rowId: "deal-a", month: "2026-10" }, onlyNew)).toBe(1_000_000)
    const weekNew = buildMatrixPendingByCell([draft({ id: "d-new-w", kind: "new-row", sourceDealId: undefined, amount: 50_000, metadata: { week: "w2" } })], [row()])
    expect(pendingWeekDisplay(weekNew, "deal-a", "2026-10", 1, 0, "edit-row")).toMatchObject({ amount: 0, additive: true })
    // 신규 초안 파생 행(원천 딜 없음)이라면 같은 신규 초안이 곧 그 칸의 값이다.
    expect(pendingWeekDisplay(weekNew, "deal-a", "2026-10", 1, 0, "new-row")).toMatchObject({ amount: 50_000, additive: false })
  })
})

describe("#9 편집 바 미리보기는 커밋과 같은 파싱", () => {
  it("소수는 반올림(10배 오류 없음), 숫자가 없으면 빈 칸", () => {
    expect(previewMatrixAmount("1234.5")).toBe(1235)
    expect(previewMatrixAmount("¥1,000")).toBe(1000)
    expect(previewMatrixAmount("")).toBeNull()
    expect(previewMatrixAmount("abc")).toBeNull()
  })
})

describe("워크벤치 배선", () => {
  const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")

  it("#1 0 커밋은 만들어질 초안 금액으로만 막는다(주차 병합 행의 한 주 0은 저장)", () => {
    const logic = read("components/admin/branch/ledger/rev-matrix-logic.ts")
    const commit = sliceBetween(logic, "const commitBuffer = useCallback(", "const moveSelection = useCallback(")
    expect(commit).not.toContain("onZeroCommitBlocked")
    const onCommit = sliceBetween(workbench, "const onCommitCell = useCallback(", "const persist = built.existingId")
    expect(onCommit.indexOf("if (!(built.input.amount > 0)) {")).toBeGreaterThan(onCommit.indexOf("const built = buildCellDraftInput("))
  })

  it("#2 서버 시드 뒤 첫 새로고침에도 마지막으로 보인 행을 '갱신 중'으로 유지한다", () => {
    expect(workbench).toContain("if (pipelineResolved.data != null && pipelineResolved.data !== lastPipelineData) setLastPipelineData(pipelineResolved.data)")
    expect(workbench).toContain("pipelineResolved.data == null && pipelineResolved.loading && !pipelineResolved.error && lastPipelineData != null")
    expect(workbench).toContain("{ ...pipelineResolved, data: lastPipelineData, previous: true }")
  })

  it("#3 콕핏 자동 재로드·편집기 월 선택은 열린 큐를 닫지 않는다(keepRail)", () => {
    const load = sliceBetween(workbench, "const loadDealDetail = useCallback", "const operation: DraftOperation = row.ledgerOrigin")
    expect(load).toContain("if (!options?.keepRail) {")
  })

  it("#4 대상 해제·초안 편집·새 딜은 진행 중인 상세 응답이 폼을 되채우지 못하게 폼을 가져온다", () => {
    const clear = sliceBetween(workbench, "const clearRailTarget = useCallback(", "}, [defaultDraftForm])")
    expect(clear).toContain("detailRequestSeqRef.current += 1")
    expect(clear).toContain("draftFormOwnerRef.current += 1")
    expect(clear).toContain("setDetailLoading(false)")
    expect(sliceBetween(workbench, "const editDraft = useCallback(", "setEditingDraftId(draft.id)")).toContain("draftFormOwnerRef.current += 1")
    expect(sliceBetween(workbench, "onNewDeal={() => {", "setEditingDraftId(null)")).toContain("draftFormOwnerRef.current += 1")
    const load = sliceBetween(workbench, "const loadDealDetail = useCallback", "}, [selectedMonth, team])")
    expect(load).toContain("const formOwner = ++draftFormOwnerRef.current")
    expect(load).toContain("if (data.deal && draftFormOwnerRef.current === formOwner) {")
  })

  it("#5 한 칸 붙여넣기는 선택 칸이 지금도 편집 가능할 때만 편집으로 들어간다", () => {
    const paste = sliceBetween(workbench, "const handleMatrixPaste = useCallback(", "const confirmMatrixPaste = useCallback(")
    expect(paste).toContain("editableCells.some((cell) => matrixCoordKey(cell) === anchorKey)")
  })

  it("#6 콕핏 선택 딜에서 '새 딜' 저장은 편집기가 새로 마운트되므로 결과를 토스트로 말한다", () => {
    const save = sliceBetween(workbench, "const saveDraftTracked = useCallback", "const editDraft = useCallback")
    expect(save).toContain('const remountsCockpitEditor = lens === "cockpit" && kind === "new-row" && selectedRow != null')
    expect(save).toContain('key: "cockpit-new-deal-saved"')
  })

  it("#8 토스트가 넘치면 기존 것 중에서 밀고(방금 넣은 것은 유지), 모바일 레일 시트가 열리면 위로", () => {
    const push = sliceBetween(workbench, "const pushMatrixToast = useCallback(", "const dismissMatrixToast = useCallback(")
    expect(push).toContain('const dropIndex = current.findIndex((toast) => toast.kind === "info")')
    expect(workbench).toContain('? "top-3 sm:top-auto sm:bottom-20" : "bottom-20"')
  })
})
