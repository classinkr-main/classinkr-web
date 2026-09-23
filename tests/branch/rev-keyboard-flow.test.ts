// 라운드 5 R-7·R-13·R-14 — REV 키보드 흐름: 검색 → 첫 칸, 한 칸 붙여넣기 = 편집 진입, 잠긴 칸 Enter → 상세·고치는 길.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { firstMatrixCellForMonth, parseSinglePastedAmount, type MatrixCellCoord } from "@/components/admin/branch/ledger/rev-matrix-logic"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

describe("parseSinglePastedAmount — 한 칸 붙여넣기(R-13)", () => {
  it("엑셀 한 칸(끝 줄바꿈 포함)·콤마·통화 기호는 원 단위 정수로", () => {
    expect(parseSinglePastedAmount("1,234,567\r\n")).toBe(1_234_567)
    expect(parseSinglePastedAmount("¥ 3,000")).toBe(3000)
    // 소수는 반올림(편집 진입 seed가 숫자만 남기면 12346으로 10배가 된다 — 여기서 먼저 정수로).
    expect(parseSinglePastedAmount("1234.6")).toBe(1235)
  })

  it("여러 칸·여러 줄·숫자 없음·0 이하는 null(기존 미리보기 경로로)", () => {
    expect(parseSinglePastedAmount("100\t200")).toBeNull()
    expect(parseSinglePastedAmount("100\n200")).toBeNull()
    expect(parseSinglePastedAmount("한빛학원")).toBeNull()
    expect(parseSinglePastedAmount("0")).toBeNull()
    expect(parseSinglePastedAmount("-500")).toBeNull()
  })
})

describe("firstMatrixCellForMonth — 검색 뒤 Enter·↓(R-7)", () => {
  const cells: MatrixCellCoord[] = [
    { rowId: "a", month: "2026-08" },
    { rowId: "a", month: "2026-09" },
    { rowId: "b", month: "2026-09" },
  ]

  it("첫 행의 선택 월 칸", () => {
    expect(firstMatrixCellForMonth(cells, "2026-09")).toEqual({ rowId: "a", month: "2026-09" })
  })

  it("첫 행에 그 달 칸이 없으면 그 달의 첫 칸, 그 달이 아예 없으면 첫 편집 칸", () => {
    expect(firstMatrixCellForMonth(cells.slice(0, 1).concat(cells.slice(2)), "2026-09")).toEqual({ rowId: "b", month: "2026-09" })
    expect(firstMatrixCellForMonth(cells, "2026-12")).toEqual({ rowId: "a", month: "2026-08" })
    expect(firstMatrixCellForMonth([], "2026-09")).toBeNull()
  })

  it("펼친 달이면 W1 칸", () => {
    const weeks: MatrixCellCoord[] = [0, 1, 2, 3, 4].map((week) => ({ rowId: "a", month: "2026-09", week }))
    expect(firstMatrixCellForMonth(weeks, "2026-09")).toEqual({ rowId: "a", month: "2026-09", week: 0 })
  })
})

describe("배선", () => {
  const workbench = read("components/admin/branch/SalesLedgerWorkbench.tsx")
  const matrix = read("components/admin/branch/ledger/RevMatrix.tsx")
  const logic = read("components/admin/branch/ledger/rev-matrix-logic.ts")

  it("붙여넣기: 한 칸 숫자는 주차 칸 차단보다 먼저 편집 진입으로(R-13)", () => {
    const paste = sliceBetween(workbench, "const handleMatrixPaste = useCallback(", "const confirmMatrixPaste = useCallback(")
    const single = paste.indexOf("parseSinglePastedAmount(text)")
    const weekBlock = paste.indexOf("if (anchor.week != null) {")
    expect(single).toBeGreaterThan(-1)
    expect(weekBlock).toBeGreaterThan(single)
    expect(paste).toContain("matrixEditor.actions.beginEdit(anchor.rowId, anchor.month, String(singleAmount), anchor.week)")
  })

  it("검색창 Enter·↓ → 첫 칸 선택(한글 조합 중 Enter는 무시)(R-7)", () => {
    expect(workbench).toContain("const target = firstMatrixCellForMonth(editableCells, selectedMonth)")
    expect(workbench).toContain("event.nativeEvent.isComposing")
    expect(workbench).toContain("matrixEditor.actions.selectCell(target.rowId, target.month, target.week)")
  })

  it("잠긴 칸 Enter·F2·더블클릭 → activateLocked(월·주차 칸 모두)(R-14)", () => {
    expect(matrix.match(/actions!\.activateLocked\(/g)?.length).toBe(4)
    expect(logic).toContain("activateLocked,")
    expect(workbench).toContain("onLockedCellActivate: onMatrixLockedCellActivate,")
    const impl = sliceBetween(workbench, "const activateLockedMatrixCell = useCallback(", "lockedCellActivateRef.current = activateLockedMatrixCell")
    expect(impl).toContain("void loadDealDetail(row, { month: coord.month })")
    expect(impl).toContain("체크 큐에서 그 초안을 되돌리기(상쇄)")
    expect(impl).toContain("원본 시트에서 고친 뒤 동기화하세요")
  })

  it("잠금 안내 문구가 실제 경로를 말한다 — 레일은 잠긴 달 수정 초안을 막으므로 '정정 초안'을 약속하지 않는다", () => {
    expect(matrix).not.toContain("수정은 우측 패널에서 정정 초안으로")
    expect(read("components/admin/branch/ledger/WeeklyAmountGrid.tsx")).not.toContain("REV 렌즈 정정 초안으로")
    expect(workbench).toContain("const formMonth = options?.month ?? row.draftMonth ?? selectedMonth")
  })
})
