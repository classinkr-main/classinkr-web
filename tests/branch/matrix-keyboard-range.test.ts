// 입력 속도 기획 라운드 4(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4 P2-8,
// §8.4 "보드" 행) — 매트릭스 키보드 동선 보강 3건(`/` 검색 포커스, Shift+방향키 범위 선택 +
// 일괄 확도 적용, Ctrl/Cmd+Z 직전 셀 커밋 실행 취소) + 보드 카드 클릭 → 입력 탭 직행 1건.
//
// 순수 로직(computeMatrixRange)은 실제로 호출해 검증하고, React 렌더 하네스가 없는 저장소
// 관례(vitest environment: "node")에 따라 나머지 UI 배선은 소스 스캔으로 검증한다
// (ledger-entry-paths.test.ts·weekly-confidence.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { computeMatrixRange, EMPTY_MATRIX_RANGE, type MatrixCellCoord } from "@/components/admin/branch/ledger/rev-matrix-logic"

const logicPath = join(process.cwd(), "components/admin/branch/ledger/rev-matrix-logic.ts")
const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const matrixPath = join(process.cwd(), "components/admin/branch/ledger/RevMatrix.tsx")

// CRLF 정규화(autocrlf 체크아웃에서도 스캔 패턴이 일치하도록) — 기존 테스트들과 동일 관례.
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker)
  expect(start, `시작 마커를 찾지 못함: ${startMarker}`).toBeGreaterThan(-1)
  const end = source.indexOf(endMarker, start)
  expect(end, `종료 마커를 찾지 못함: ${endMarker}`).toBeGreaterThan(start)
  return source.slice(start, end)
}

const cell = (rowId: string, month: string, week?: number): MatrixCellCoord => ({ rowId, month, week })

// 3행 × 2열(월) 편집가능 셀 — useMatrixEditor의 editableCells와 같은 렌더 순서(행 위→아래,
// 월 좌→우)로 구성한 테스트 픽스처.
const EDITABLE_CELLS: MatrixCellCoord[] = [
  cell("r1", "2026-04"),
  cell("r1", "2026-05"),
  cell("r2", "2026-04"),
  cell("r2", "2026-05"),
  cell("r3", "2026-04"),
  cell("r3", "2026-05"),
]

describe("computeMatrixRange — Shift+방향키 범위 계산(순수 함수 직접 호출)", () => {
  it("좌우 이동: 같은 행 안에서 anchor~selected index 구간", () => {
    const range = computeMatrixRange(EDITABLE_CELLS, cell("r1", "2026-04"), cell("r1", "2026-05"))
    expect(range).toEqual([cell("r1", "2026-04"), cell("r1", "2026-05")])
  })

  it("상하 이동: 여러 행을 거치면 그 사이 '모든 열'이 통째로 포함된다(직사각형이 아니라 순회 순서상 연속 구간)", () => {
    // r1의 04월(index0)에서 r3의 04월(index4)까지 — 직사각형이라면 04월 열 3칸(r1/r2/r3)만
    // 담겨야 하지만, 스펙은 순회 순서(index) 구간이므로 r1의 05월·r2의 04/05월까지 전부 포함된다.
    const range = computeMatrixRange(EDITABLE_CELLS, cell("r1", "2026-04"), cell("r3", "2026-04"))
    expect(range).toEqual(EDITABLE_CELLS.slice(0, 5))
  })

  it("역방향(뒤 셀을 anchor로, 앞 셀을 selected로)도 오름차순 index로 정규화된다", () => {
    const forward = computeMatrixRange(EDITABLE_CELLS, cell("r1", "2026-04"), cell("r2", "2026-05"))
    const backward = computeMatrixRange(EDITABLE_CELLS, cell("r2", "2026-05"), cell("r1", "2026-04"))
    expect(backward).toEqual(forward)
    expect(forward).toEqual(EDITABLE_CELLS.slice(0, 4))
  })

  it("anchor===selected면 그 셀 1개짜리 배열(길이 1) — 호출부가 단일 셀 경로로 폴백하는 근거", () => {
    const range = computeMatrixRange(EDITABLE_CELLS, cell("r2", "2026-04"), cell("r2", "2026-04"))
    expect(range).toEqual([cell("r2", "2026-04")])
  })

  it("경계: anchor 또는 selected가 null이면 빈 배열(EMPTY_MATRIX_RANGE, 안정 참조)", () => {
    expect(computeMatrixRange(EDITABLE_CELLS, null, cell("r1", "2026-04"))).toBe(EMPTY_MATRIX_RANGE)
    expect(computeMatrixRange(EDITABLE_CELLS, cell("r1", "2026-04"), null)).toBe(EMPTY_MATRIX_RANGE)
    expect(computeMatrixRange(EDITABLE_CELLS, null, null)).toBe(EMPTY_MATRIX_RANGE)
  })

  it("경계: anchor·selected가 editableCells에 없으면(필터링으로 사라진 좌표) 빈 배열", () => {
    const range = computeMatrixRange(EDITABLE_CELLS, cell("ghost-row", "2026-04"), cell("r1", "2026-04"))
    expect(range).toBe(EMPTY_MATRIX_RANGE)
  })

  it("빈 배열은 매번 같은 참조(EMPTY_MATRIX_RANGE)를 돌려준다 — 새 [] 아님(memo 안정성의 근거)", () => {
    const a = computeMatrixRange(EDITABLE_CELLS, null, null)
    const b = computeMatrixRange([], cell("x", "2026-04"), cell("x", "2026-04"))
    expect(a).toBe(b)
  })
})

describe("useMatrixEditor — Shift 없는 이동·편집 진입·Esc는 anchor를 지운다(소스 스캔)", () => {
  const logic = read(logicPath)

  it("selectCell(클릭 선택)은 setAnchor(null)을 호출한다", () => {
    const body = sliceBetween(
      logic,
      "const selectCell = useCallback((rowId: string, month: string, week?: number) => {",
      "}, [])",
    )
    expect(body).toContain("setAnchor(null)")
  })

  it("beginEdit(편집 진입)은 setAnchor(null)을 호출한다", () => {
    const body = sliceBetween(logic, "const beginEdit = useCallback(", "[cellConfidence, cellValue]")
    expect(body).toContain("setAnchor(null)")
  })

  it("cancelEdit(Esc)은 setAnchor(null)을 호출한다", () => {
    const body = sliceBetween(logic, "const cancelEdit = useCallback(() => {", "}, [])")
    expect(body).toContain("setAnchor(null)")
  })

  it("moveSelection(좌우 이동)은 setAnchor(null)을 호출한다", () => {
    const body = sliceBetween(logic, "const moveSelection = useCallback(", "[editableCells, indexByKey]")
    expect(body).toContain("setAnchor(null)")
  })

  it("moveWithinRowOrNext(아래 이동·Tab/Enter 커밋 후 이동)는 setAnchor(null)을 호출한다", () => {
    const body = sliceBetween(logic, "const moveWithinRowOrNext = useCallback(", "[editableCells, indexByKey]")
    expect(body).toContain("setAnchor(null)")
  })

  it("onSelectedKeyDown의 ArrowUp 인라인 분기도 setAnchor(null)을 호출한다(moveWithinRowOrNext를 쓰지 않는 별도 구현)", () => {
    const body = sliceBetween(logic, "const onSelectedKeyDown = useCallback(", "const actions = useMemo(")
    const arrowUpIndex = body.indexOf('if (event.key === "ArrowUp") {')
    const enterIndex = body.indexOf('if (event.key === "Enter" || event.key === "F2") {')
    expect(arrowUpIndex).toBeGreaterThan(-1)
    expect(enterIndex).toBeGreaterThan(arrowUpIndex)
    expect(body.slice(arrowUpIndex, enterIndex)).toContain("setAnchor(null)")
  })

  it("extendRangeSelection은 anchor가 없을 때만 함수형 setState로 anchor를 고정한다(deps에 anchor를 넣지 않기 위한 트릭)", () => {
    const body = sliceBetween(logic, "const extendRangeSelection = useCallback(", "[editableCells, indexByKey]")
    expect(body).toContain("setAnchor((current) => current ?? from)")
  })
})

describe("onSelectedKeyDown — Shift+방향키 범위 선택과 range 일괄 확도 배선(소스 스캔)", () => {
  const body = () => sliceBetween(
    read(logicPath),
    "const onSelectedKeyDown = useCallback(",
    "const actions = useMemo(",
  )

  it("Shift+방향키 분기가 Shift 없는 ArrowRight 분기보다 먼저 온다(같은 키값 폴스루 방지)", () => {
    const fn = body()
    const shiftBranchIndex = fn.indexOf('event.shiftKey && (event.key === "ArrowRight"')
    const plainRightIndex = fn.indexOf('if (event.key === "ArrowRight") {')
    expect(shiftBranchIndex).toBeGreaterThan(-1)
    expect(plainRightIndex).toBeGreaterThan(shiftBranchIndex)
  })

  it("Shift+ArrowRight/Left/Down/Up 4방향 모두 extendRangeSelection으로 위임한다", () => {
    const fn = body()
    expect(fn).toContain(
      'event.shiftKey && (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "ArrowDown" || event.key === "ArrowUp")',
    )
    expect(fn).toContain("extendRangeSelection(coord, event.key)")
  })

  it("E/H/C 확도 분기는 range(rangeRef, 2칸 이상)와 onCommitRangeConfidence가 함께 있을 때만 일괄 적용으로 분기한다", () => {
    const fn = body()
    expect(fn).toContain("if (onCommitRangeConfidence && rangeRef.current.length >= 2) {")
    expect(fn).toContain("onCommitRangeConfidence(rangeRef.current, shortcut)")
    // range.length를 상태값(range)이 아니라 latest-ref(rangeRef)로 읽는다 — actions identity 안정성.
    expect(fn).not.toContain("range.length >= 2")
  })

  it("onCommitRangeConfidence가 deps 배열에 있다(호출부가 최신 콜백을 쓰도록)", () => {
    expect(read(logicPath)).toContain("onCommitCell,\n      onCommitRangeConfidence,\n    ],")
  })
})

describe("useMatrixEditor — 기존 반환 필드·actions 키는 그대로, range/anchor만 추가된다", () => {
  const logic = read(logicPath)

  it("actions 객체의 키·순서는 문자 그대로 유지된다(memo 안정성 주석과 함께)", () => {
    expect(logic).toContain(
      "[setBuffer, pickEditConfidence, selectCell, beginEdit, cancelEdit, commitBuffer, onEditingKeyDown, onSelectedKeyDown]",
    )
  })

  it("훅 반환값에 anchor·range가 selected/editing/buffer/editConfidence/actions와 함께 추가된다", () => {
    const body = sliceBetween(logic, "return {\n    selected,\n    editing,\n    buffer,\n    editConfidence,", "actions,\n  }\n}")
    expect(body).toContain("anchor,")
    expect(body).toContain("range,")
  })

  it("useMatrixEditor 인자에 onCommitRangeConfidence가 선택적으로 추가된다(기존 인자는 그대로)", () => {
    expect(logic).toContain("onCommitRangeConfidence?: (coords: MatrixCellCoord[], confidence: DraftConfidence) => void")
    expect(logic).toContain("editableCells,\n  cellValue,\n  cellConfidence,\n  onCommitCell,\n  onAmountClamped,\n  onCommitRangeConfidence,\n}: {")
  })
})

describe("RevMatrix — range 셀 스타일 + 행 스코프 prop 배선(P2-8)", () => {
  const source = read(matrixPath)

  it("RevMatrixEditContext에 isRangeCell 판정이 있다", () => {
    expect(source).toContain("isRangeCell: (month: string, week?: number) => boolean")
  })

  it("RevMatrixDealRow는 rangeCoords를 행 스코프 prop으로 받고 기본값은 EMPTY_MATRIX_RANGE다(selectedCoord/editingCoord와 같은 패턴)", () => {
    expect(source).toContain("rangeCoords = EMPTY_MATRIX_RANGE,")
    expect(source).toContain("rangeCoords?: MatrixCellCoord[]")
    expect(source).toContain(
      "isRangeCell: (month, week) => rangeCoords.some((coord) => coord.month === month && (coord.week ?? -1) === (week ?? -1)),",
    )
  })

  it("월 셀·주차 셀 둘 다 range 배경에 새 색이 아니라 이 파일에 이미 쓰이는 중립 톤(#F6F5F4)을 재사용한다", () => {
    const rangeBgCount = source.split('rangeHighlighted ? "bg-[#F6F5F4]"').length - 1
    expect(rangeBgCount).toBe(2)
  })

  it("range 배경은 선택 링(ring-2 ring-inset)과 별개 클래스라 함께 켜질 수 있다(셀 하나가 둘 다 표시)", () => {
    expect(source).toContain('selected ? "ring-2 ring-inset ring-[#084734]/40" : ""')
  })
})

describe("SalesLedgerWorkbench — onCommitRangeConfidence(범위 확도 일괄 적용, P2-8)", () => {
  const body = () => sliceBetween(
    read(workbenchPath),
    "const onCommitRangeConfidence = useCallback(",
    "[buildCellDraftInput, matrixCellConfidence, matrixCellValue, persistDraftsBatch, pushMatrixToast]",
  )

  it("matrixCellValue(coord) > 0 가드로 빈 칸·이미 같은 확도인 좌표를 건너뛴다", () => {
    const fn = body()
    expect(fn).toContain("const value = matrixCellValue(coord)")
    expect(fn).toContain("value > 0 && confidence !== matrixCellConfidence(coord)")
  })

  it("셀 커밋·붙여넣기와 같은 입력 빌더(buildCellDraftInput)로 만든 항목을 persistDraftsBatch 1회로 저장한다(새 저장 경로 없음)", () => {
    const fn = body()
    expect(fn).toContain("buildCellDraftInput(coord.rowId, coord.month, value, confidence, coord.week)")
    expect(fn).toContain("const results = await persistDraftsBatch(items)")
    expect(fn).not.toContain("createDraft(")
    expect(fn).not.toContain("updateDraft(")
  })

  it("existingId가 있으면(이미 대기 초안이 있는 셀) PATCH 대상으로, 없으면 POST 항목으로 담는다", () => {
    expect(body()).toContain("items.push(built.existingId ? { id: built.existingId, input: built.input } : { input: built.input })")
  })

  it("0건이면 토스트 없이 no-op이다", () => {
    expect(body()).toContain("if (items.length === 0) return")
  })

  it("결과 집계는 붙여넣기 토스트(confirmMatrixPaste)와 같은 4분류(충돌/거부/로컬 임시/실패)·문구 톤을 재사용한다", () => {
    const fn = body()
    expect(fn).toContain("if (result.conflict) conflicts += 1")
    expect(fn).toContain("else if (result.validationMessage) rejected += 1")
    expect(fn).toContain('result.draft.id.startsWith("local-")) localOnly += 1')
    expect(fn).toContain("충돌 ${fmt(conflicts)}")
    expect(fn).toContain("로컬 임시 ${fmt(localOnly)}(장부 적용 불가)")
  })

  it("useMatrixEditor에 onCommitRangeConfidence로 배선된다", () => {
    const fn = sliceBetween(read(workbenchPath), "const matrixEditor = useMatrixEditor({", "})")
    expect(fn).toContain("onCommitRangeConfidence,")
  })

  it("rangeCoordsByRow가 matrixEditor.range를 행 id별로 묶고, 행에 없으면 EMPTY_MATRIX_RANGE를 넘긴다", () => {
    const source = read(workbenchPath)
    expect(source).toContain("const rangeCoordsByRow = useMemo(() => {")
    expect(source).toContain("for (const coord of matrixEditor.range) {")
    expect(source).toContain("rangeCoords: rangeCoordsByRow.get(rowId) ?? EMPTY_MATRIX_RANGE,")
  })
})

describe("SalesLedgerWorkbench — 매트릭스 컨테이너 keydown: '/' 검색 + Ctrl/Cmd+Z 실행 취소(P2-8)", () => {
  const body = () => sliceBetween(
    read(workbenchPath),
    "const handleMatrixContainerKeyDown = useCallback(",
    "[matrixEditor.editing, undoCellDraft]",
  )

  it("편집 중(matrixEditor.editing)이면 '/' Ctrl+Z 둘 다 가로채지 않는다", () => {
    expect(body()).toContain("if (matrixEditor.editing) return")
  })

  it("\"/\"는 ctrl/meta/alt 없이 눌렸을 때만 검색 input에 포커스·선택한다", () => {
    const fn = body()
    expect(fn).toContain('event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey')
    expect(fn).toContain("revSearchInputRef.current?.focus()")
    expect(fn).toContain("revSearchInputRef.current?.select()")
  })

  it("Ctrl 또는 Cmd+Z는 lastUndoableDraftIdRef에 담긴 직전 커밋만 되돌리고, 없으면 브라우저 기본 동작에 맡긴다", () => {
    const fn = body()
    expect(fn).toContain('(event.ctrlKey || event.metaKey) && event.key === "z"')
    expect(fn).toContain("const draftId = lastUndoableDraftIdRef.current")
    expect(fn).toContain("if (!draftId) return")
    expect(fn).toContain("void undoCellDraft(draftId)")
  })

  it("검색 input에 revSearchInputRef가 연결된다", () => {
    const source = read(workbenchPath)
    const inputIndex = source.indexOf("ref={revSearchInputRef}")
    expect(inputIndex).toBeGreaterThan(-1)
    expect(source.slice(inputIndex, inputIndex + 220)).toContain('placeholder="고객, 담당자, 팀, 지역, 상태, 메모 검색"')
  })

  it("매트릭스 스크롤 컨테이너(onPaste가 붙은 div)에 onKeyDown={handleMatrixContainerKeyDown}이 함께 연결된다", () => {
    const source = read(workbenchPath)
    const pasteIndex = source.indexOf("onPaste={handleMatrixPaste}")
    expect(pasteIndex).toBeGreaterThan(-1)
    const tagEnd = source.indexOf(">", pasteIndex)
    expect(source.slice(pasteIndex, tagEnd)).toContain("onKeyDown={handleMatrixContainerKeyDown}")
  })
})

describe("onCommitCell / undoCellDraft — lastUndoableDraftIdRef 기록·해제(P2-8)", () => {
  it("onCommitCell은 새 초안이 실제로 만들어진 경로(P1-6 실행 취소 토스트와 같은 조건)에서만 lastUndoableDraftIdRef를 채운다", () => {
    const fn = sliceBetween(
      read(workbenchPath),
      "const onCommitCell = useCallback",
      "[buildCellDraftInput, createDraft, pushMatrixToast, undoCellDraft, updateDraft]",
    )
    const guardIndex = fn.indexOf("if (!built.existingId && draft) {")
    expect(guardIndex).toBeGreaterThan(-1)
    expect(fn.slice(guardIndex)).toContain("lastUndoableDraftIdRef.current = draft.id")
  })

  it("onCommitCell의 deps 배열은 라운드 4 P1-6과 동일하게 유지된다(ref 기록은 deps에 영향 없음)", () => {
    expect(read(workbenchPath)).toContain("[buildCellDraftInput, createDraft, pushMatrixToast, undoCellDraft, updateDraft]")
  })

  it("undoCellDraft는 성공 시 그 draft를 가리키던 lastUndoableDraftIdRef만 비우고, deps는 [pushMatrixToast]로 그대로다", () => {
    const fn = sliceBetween(read(workbenchPath), "const undoCellDraft = useCallback", "}, [pushMatrixToast])")
    expect(fn).toContain("if (lastUndoableDraftIdRef.current === id) lastUndoableDraftIdRef.current = null")
  })
})

describe("SalesLedgerWorkbench — 보드 카드 클릭이 입력 탭으로 직행한다(§8.4 '보드' 행)", () => {
  it("<ForecastBoard onOpenRow={openQuickInputForRow}>로 배선된다(loadDealDetail 직접 호출 아님)", () => {
    const source = read(workbenchPath)
    const renderIndex = source.indexOf("<ForecastBoard")
    expect(renderIndex, "<ForecastBoard 렌더 위치를 찾지 못함").toBeGreaterThan(-1)
    const renderEnd = source.indexOf("/>", renderIndex)
    const propsBlock = source.slice(renderIndex, renderEnd)
    expect(propsBlock).toContain("onOpenRow={openQuickInputForRow}")
    expect(propsBlock).not.toContain("onOpenRow={(row) => void loadDealDetail(row)}")
  })

  it("REV 매트릭스 행 클릭(onOpen={loadDealDetail})은 두 RevMatrixDealRow 콜사이트(단독·중첩) 모두 그대로 상세를 연다(다른 진입점 불변)", () => {
    const source = read(workbenchPath)
    const count = source.split("onOpen={loadDealDetail}").length - 1
    expect(count).toBe(2)
  })

  it("모바일 리스트 금액 탭(onQuickInput)·상세(loadDealDetail) 배선도 그대로다(회귀 방지)", () => {
    const source = read(workbenchPath)
    const renderIndex = source.indexOf("<RevMobileList")
    const renderEnd = source.indexOf("/>", renderIndex)
    const propsBlock = source.slice(renderIndex, renderEnd)
    expect(propsBlock).toContain("onQuickInput={openQuickInputForRow}")
    expect(propsBlock).toContain("loadDealDetail={loadDealDetail}")
  })
})

describe("RevMatrix — 치트시트에 '/' 검색·Ctrl+Z 안내가 추가된다(P2-8)", () => {
  it("MatrixToneLegend 힌트 줄에 '· / 검색'과 '· Ctrl+Z 직전 입력 취소'가 기존 단축키 뒤에 이어진다", () => {
    const source = read(matrixPath)
    const hintIndex = source.indexOf("· Enter 편집 · Tab 이동 · Ctrl+D 아래 복사")
    expect(hintIndex).toBeGreaterThan(-1)
    const hintLineEnd = source.indexOf("</span>", hintIndex)
    expect(hintLineEnd).toBeGreaterThan(hintIndex)
    const hint = source.slice(hintIndex, hintLineEnd)
    expect(hint).toContain("Esc 취소 · / 검색 · Ctrl+Z 직전 입력 취소")
  })
})
