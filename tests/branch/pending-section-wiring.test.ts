// 매출 장부 입력 속도 라운드(docs/active/sales-ledger-input-speed-plan-2026-09-20.md §4 P1-4)
// 단계 1 — "적용 대기" 섹션 배선(읽기 전용) 회귀 가드.
//
// buildPendingDraftRows 자체(순수 파생)는 이전 라운드에 tests/branch/pending-draft-rows.test.ts로
// 이미 고정돼 있다. 이 파일은 그 결과를 워크벤치가 실제로 어떻게 "배선"하는지만 검증한다:
//  (a) buildPendingDraftRows 호출 + existingRows: rows
//  (b) 합계 격리 — rows/revBaseFilteredRows/filteredRows/revCustomerGroups/visibleDealRows
//      본문 어디에도 pendingDraftRows/visiblePendingDraftRows가 섞이지 않는다.
//  (c) revBaseFilteredRows에서 추출한 순수 함수 matchesRevRowFilters의 동작.
//  (d) 적용 대기 섹션 헤더 문구·aria-label.
// React 렌더 하네스가 없는 저장소 관례(vitest environment: "node")에 따라 (a)(b)(d)는 소스
// 스캔으로, (c)는 순수 함수를 직접 구동해 검증한다(matrix-paste-name-match.test.ts·
// matrix-keyboard-range.test.ts와 동일 관례).
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import { matchesRevRowFilters, type RevRowFilters } from "@/components/admin/branch/ledger/pending-draft-rows"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")

// CRLF 정규화(autocrlf 체크아웃에서도 마커 슬라이스가 일치하도록) — 기존 소스 스캔 테스트들과 동일 관례.
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

const source = read(workbenchPath)

describe("워크벤치가 buildPendingDraftRows를 배선한다", () => {
  it("buildPendingDraftRows({ 호출이 있다", () => {
    expect(source).toContain("buildPendingDraftRows({")
  })

  it("existingRows: rows로 넘긴다(이미 매트릭스에 보이는 시트행+적용초안행이 대조군)", () => {
    expect(source).toContain("existingRows: rows")
  })
})

describe("합계 격리 — 임시 행이 합계 파이프라인 useMemo 본문에 섞이지 않는다", () => {
  const cases: Array<[string, () => string]> = [
    ["rows", () => sliceBetween(source, "const rows = useMemo(() => {", "}, [appliedDraftRows, sheetRows, editRowOverrideMonths])")],
    [
      "revBaseFilteredRows",
      () =>
        sliceBetween(
          source,
          "const revBaseFilteredRows = useMemo(() => {",
          "}, [managerFilter, productFilter, query, regionFilter, revDealTypeFilter, revOriginFilter, revStatusFilter, rows])",
        ),
    ],
    [
      "filteredRows",
      () =>
        sliceBetween(
          source,
          "const filteredRows = useMemo(() => {",
          "}, [revBaseFilteredRows, matrixMonths, revForecastFilter, revSortDirection, revSortKey, selectedMonth])",
        ),
    ],
    [
      "revCustomerGroups",
      () =>
        sliceBetween(
          source,
          "const revCustomerGroups = useMemo<RevCustomerGroup[]>(() => {",
          "}, [filteredRows, matrixMonths, revSortDirection, revSortKey, selectedMonth])",
        ),
    ],
    [
      "visibleDealRows",
      () => sliceBetween(source, "const visibleDealRows = useMemo(() => {", "}, [visibleGroups, expandedRevGroups, expandedRevCategories])"),
    ],
  ]

  it.each(cases)("%s 본문에는 pendingDraftRows/visiblePendingDraftRows가 등장하지 않는다", (_name, body) => {
    expect(body()).not.toContain("pendingDraftRows")
    expect(body()).not.toContain("visiblePendingDraftRows")
  })
})

describe("matchesRevRowFilters — revBaseFilteredRows의 필터 술어와 동일하게 동작(순수 함수 직접 호출)", () => {
  function makeRow(overrides: Partial<LedgerRevenueRow> = {}): LedgerRevenueRow {
    return {
      id: "row-1",
      customer: "학원 A",
      manager: "김지사",
      team: "BD",
      region: "서울",
      status: "진행중",
      dealType: "신규",
      revenue: 0,
      ledgerOrigin: "sheet",
      ...overrides,
    }
  }

  const emptyFilters: RevRowFilters = {
    managerFilter: new Set(),
    regionFilter: new Set(),
    productFilter: "all",
    revStatusFilter: "ALL",
    revDealTypeFilter: "ALL",
    revOriginFilter: "all",
  }

  it("필터가 전부 기본값(전체)이고 검색어가 없으면 통과한다", () => {
    expect(matchesRevRowFilters(makeRow(), emptyFilters, [])).toBe(true)
  })

  it("담당자 필터 — Set에 없으면 제외, 있으면 통과", () => {
    const filters: RevRowFilters = { ...emptyFilters, managerFilter: new Set(["박담당"]) }
    expect(matchesRevRowFilters(makeRow(), filters, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ manager: "박담당" }), filters, [])).toBe(true)
    // manager가 null이면(고객 필드 미확보) 어떤 담당자 필터에도 걸리지 않는다.
    expect(matchesRevRowFilters(makeRow({ manager: null }), filters, [])).toBe(false)
  })

  it("지역 필터 — Set에 없으면 제외", () => {
    const filters: RevRowFilters = { ...emptyFilters, regionFilter: new Set(["부산"]) }
    expect(matchesRevRowFilters(makeRow(), filters, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ region: "부산" }), filters, [])).toBe(true)
  })

  it("상품군 필터 — rowProductCategory 판정 기준", () => {
    const filters: RevRowFilters = { ...emptyFilters, productFilter: "hardware" }
    // productVersion·draftMetadata가 없는 기본 픽스처는 unknown으로 분류돼 hardware 필터에 걸린다.
    expect(matchesRevRowFilters(makeRow(), filters, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ productVersion: "전자칠판" }), filters, [])).toBe(true)
  })

  it("상태·딜유형 필터 — ALL이 아니면 정확히 일치해야 통과", () => {
    expect(matchesRevRowFilters(makeRow(), { ...emptyFilters, revStatusFilter: "완료" }, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ status: "완료" }), { ...emptyFilters, revStatusFilter: "완료" }, [])).toBe(true)
    expect(matchesRevRowFilters(makeRow(), { ...emptyFilters, revDealTypeFilter: "갱신" }, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ dealType: "갱신" }), { ...emptyFilters, revDealTypeFilter: "갱신" }, [])).toBe(true)
  })

  it("원천(ledgerOrigin) 필터 — sheet/draft", () => {
    expect(matchesRevRowFilters(makeRow({ ledgerOrigin: "draft" }), { ...emptyFilters, revOriginFilter: "sheet" }, [])).toBe(false)
    expect(matchesRevRowFilters(makeRow({ ledgerOrigin: "draft" }), { ...emptyFilters, revOriginFilter: "draft" }, [])).toBe(true)
    expect(matchesRevRowFilters(makeRow({ ledgerOrigin: "sheet" }), { ...emptyFilters, revOriginFilter: "sheet" }, [])).toBe(true)
  })

  it("검색 토큰 — 고객명·담당자 등 필드 매칭(AND, matchesTokens 재사용)", () => {
    expect(matchesRevRowFilters(makeRow(), emptyFilters, ["학원"])).toBe(true)
    expect(matchesRevRowFilters(makeRow(), emptyFilters, ["김지사"])).toBe(true)
    expect(matchesRevRowFilters(makeRow(), emptyFilters, ["존재안함"])).toBe(false)
    // 여러 토큰은 AND — 전부 매칭해야 통과.
    expect(matchesRevRowFilters(makeRow(), emptyFilters, ["학원", "김지사"])).toBe(true)
    expect(matchesRevRowFilters(makeRow(), emptyFilters, ["학원", "존재안함"])).toBe(false)
  })

  it("여러 필터가 동시에 걸리면 전부 통과해야만 true다(AND)", () => {
    const filters: RevRowFilters = { ...emptyFilters, managerFilter: new Set(["김지사"]), regionFilter: new Set(["서울"]) }
    expect(matchesRevRowFilters(makeRow(), filters, [])).toBe(true)
    expect(matchesRevRowFilters(makeRow({ region: "부산" }), filters, [])).toBe(false)
  })
})

describe("적용 대기 섹션 — 헤더 문구·aria-label(소스 스캔)", () => {
  it("별도 tbody에 aria-label이 있다", () => {
    expect(source).toContain('aria-label="적용 대기 중인 새 행"')
  })

  it("헤더에 건수·체크 큐 안내 문구가 있다", () => {
    expect(source).toContain("적용 대기 새 행")
    expect(source).toContain("체크 큐에서 체크 → 적용하면 장부 합계에 들어갑니다")
    expect(source).toContain("체크 큐 열기")
  })

  it("합계에 포함되지 않는다는 사실을 명시한다", () => {
    expect(source).toContain("합계 불포함")
  })

  it("체크 큐 열기 동작이 selectRailView(\"queue\")·setSidePanelCollapsed(false)를 호출한다", () => {
    const start = source.indexOf("const openPendingQueue = useCallback(")
    expect(start, "openPendingQueue 정의를 찾지 못함").toBeGreaterThan(-1)
    const end = source.indexOf("}, [selectRailView])", start)
    expect(end, "openPendingQueue 종료(deps)를 찾지 못함").toBeGreaterThan(start)
    const body = source.slice(start, end)
    expect(body).toContain('selectRailView("queue")')
    expect(body).toContain("setSidePanelCollapsed(false)")

    // 적용 대기 섹션 헤더의 "체크 큐 열기" 버튼이 실제로 이 콜백을 쓰는지 — 검색은 섹션 헤더
    // 문구("적용 대기 새 행") 뒤부터 시작해, 파일 다른 곳(검수 인박스 칩 등)의 같은 문구와
    // 헷갈리지 않게 한다.
    const sectionHeaderIndex = source.indexOf("적용 대기 새 행")
    expect(sectionHeaderIndex, "섹션 헤더 문구를 찾지 못함").toBeGreaterThan(-1)
    const buttonIndex = source.indexOf("체크 큐 열기", sectionHeaderIndex)
    expect(buttonIndex, "섹션 헤더 근처의 체크 큐 열기 버튼을 찾지 못함").toBeGreaterThan(sectionHeaderIndex)
    const before = source.slice(Math.max(sectionHeaderIndex, buttonIndex - 300), buttonIndex)
    expect(before).toContain("openPendingQueue")
  })
})

describe("적용 대기 섹션 — 임시 행 렌더·모바일 배선(추가 커버리지)", () => {
  it("RevMatrixPendingRow를 매트릭스 tbody에서 렌더한다", () => {
    expect(source).toContain("RevMatrixPendingRow")
  })

  it("RevMobileList에 pendingRows·onOpenQueue를 전달한다", () => {
    const renderIndex = source.indexOf("<RevMobileList")
    expect(renderIndex, "<RevMobileList 렌더 위치를 찾지 못함").toBeGreaterThan(-1)
    const renderEnd = source.indexOf("/>", renderIndex)
    const propsBlock = source.slice(renderIndex, renderEnd)
    expect(propsBlock).toContain("pendingRows={visiblePendingDraftRows}")
    expect(propsBlock).toContain("onOpenQueue={openPendingQueue}")
    // 기존 배선(회귀 방지).
    expect(propsBlock).toContain("onQuickInput={openQuickInputForRow}")
    expect(propsBlock).toContain("loadDealDetail={loadDealDetail}")
  })
})
