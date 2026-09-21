// 입력 진입 동선 라운드(2026-09-20 기획 docs/active/sales-ledger-input-speed-plan-2026-09-20.md
// §4 P2-7, §8.4 "레일·상세"/"REV 레일 겹침") 소스 스캔 회귀 가드.
// 이 저장소는 React 렌더 하네스가 없어(vitest environment: "node") 소스 스캔 관례를 따른다
// (rail-form-order.test.ts·weekly-confidence.test.ts와 동일 관례).
//  1) 모바일 REV 리스트: 금액 탭 → 레일 "입력/수정" 직행(프리필) — RevMobileList onQuickInput.
//  2) 레일 탭 3개의 a11y — role="tab"/"tabpanel" id·aria-controls·aria-labelledby 연결.
//  3) 데스크톱 넓은 폭에서 본문(<main>) 오른쪽 여백으로 레일-매트릭스 겹침 보정.
import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const workbenchPath = join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx")
const mobileListPath = join(process.cwd(), "components/admin/branch/ledger/RevMobileList.tsx")

// CRLF 정규화: autocrlf 체크아웃(Windows)에서도 여러 줄 스캔·경계 slice가 일치하도록
// (weekly-confidence.test.ts와 동일 관례).
function read(path: string) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n")
}

describe("RevMobileList — 금액 탭이 레일 '입력/수정'으로 직행(§4 P2-7)", () => {
  it("onQuickInput prop을 선언한다", () => {
    const source = read(mobileListPath)
    expect(source).toContain("onQuickInput: (row: LedgerRevenueRow) => void | Promise<void>")
    // 컴포넌트 destructure에도 실제로 받는지(선언만 하고 안 쓰는 회귀 방지).
    expect(source).toContain("onQuickInput,")
  })

  it("금액이 <button type=\"button\">으로 렌더되고 44px 터치 타깃·전용 aria-label을 가진다", () => {
    const source = read(mobileListPath)
    const labelMarker = "aria-label={`${row.customer} 금액 입력 열기`}"
    const labelIndex = source.indexOf(labelMarker)
    expect(labelIndex, "금액 입력 버튼 aria-label 누락").toBeGreaterThan(-1)

    // aria-label이 달린 여는 태그가 <button>인지 확인(회귀: <p>로 되돌아가면 실패) — 가장
    // 가까운 앞쪽 여는 태그가 <p>가 아니라 <button>이어야 한다.
    const openButtonIndex = source.lastIndexOf("<button", labelIndex)
    const openParagraphIndex = source.lastIndexOf("<p", labelIndex)
    expect(openButtonIndex).toBeGreaterThan(-1)
    expect(openButtonIndex).toBeGreaterThan(openParagraphIndex)

    const closeButtonIndex = source.indexOf("</button>", labelIndex)
    expect(closeButtonIndex).toBeGreaterThan(labelIndex)
    const buttonBlock = source.slice(openButtonIndex, closeButtonIndex)
    expect(buttonBlock).toContain('type="button"')
    expect(buttonBlock).toContain("min-h-11")
    expect(buttonBlock).toContain("{formatMoney(monthAmount || row.revenue)}")
    expect(buttonBlock).toContain("onClick={() => void onQuickInput(row)}")
    // 기존 텍스트 스타일 유지(새 색 없음) — 감사가 지적한 원래 <p> 스타일 그대로.
    expect(buttonBlock).toContain("text-[13px] font-bold tabular-nums text-[#111110]")
  })

  it("카드의 다른 클릭(고객명·상세)은 그대로 loadDealDetail을 호출한다(회귀 방지)", () => {
    const source = read(mobileListPath)
    const customerButtons = source.split("onClick={() => void loadDealDetail(row)}").length - 1
    // 비그룹 카드의 고객명 버튼 + 상세 버튼 = 2곳.
    expect(customerButtons).toBe(2)
  })
})

describe("SalesLedgerWorkbench — openQuickInputForRow(§4 P2-7)", () => {
  function body() {
    const source = read(workbenchPath)
    const start = source.indexOf("const openQuickInputForRow = useCallback")
    expect(start, "openQuickInputForRow 정의를 찾지 못함").toBeGreaterThan(-1)
    const end = source.indexOf("}, [loadDealDetail])", start)
    expect(end, "openQuickInputForRow 종료(deps)를 찾지 못함").toBeGreaterThan(start)
    return source.slice(start, end)
  }

  it("loadDealDetail(행 선택·프리필·상세 진입) 완료 뒤에 input으로 덮어쓴다 — 순서 보장", () => {
    const fn = body()
    const loadDealDetailIndex = fn.indexOf("loadDealDetail(row)")
    const setRailViewIndex = fn.indexOf('setRailView("input")')
    const setSidePanelCollapsedIndex = fn.indexOf("setSidePanelCollapsed(false)")
    expect(loadDealDetailIndex).toBeGreaterThan(-1)
    expect(setRailViewIndex).toBeGreaterThan(loadDealDetailIndex)
    expect(setSidePanelCollapsedIndex).toBeGreaterThan(setRailViewIndex)
  })

  it("loadDealDetail을 await한 뒤에만 후속 호출이 이어진다(동기 fire-and-forget 회귀 방지)", () => {
    expect(body()).toContain("await loadDealDetail(row)")
  })

  it("의존성 배열은 [loadDealDetail]로 고정된다", () => {
    expect(read(workbenchPath)).toContain(
      "const openQuickInputForRow = useCallback(async (row: LedgerRevenueRow) => {",
    )
    expect(read(workbenchPath)).toContain("}, [loadDealDetail])")
  })

  it("RevMobileList에 onQuickInput={openQuickInputForRow}를 전달한다", () => {
    const source = read(workbenchPath)
    const renderIndex = source.indexOf("<RevMobileList")
    expect(renderIndex, "<RevMobileList 렌더 위치를 찾지 못함").toBeGreaterThan(-1)
    const renderEnd = source.indexOf("/>", renderIndex)
    const propsBlock = source.slice(renderIndex, renderEnd)
    expect(propsBlock).toContain("onQuickInput={openQuickInputForRow}")
    // 기존 loadDealDetail 배선(상세 경로)도 그대로 남아 있어야 한다(회귀 방지).
    expect(propsBlock).toContain("loadDealDetail={loadDealDetail}")
  })
})

describe("레일 탭 a11y — role=tab/tabpanel 연결(§8.4 '레일·상세')", () => {
  it("탭 버튼(role=\"tab\")에 id·aria-controls가 있다(railViewItems.map 루프)", () => {
    const source = read(workbenchPath)
    expect(source).toContain("id={`ledger-rail-tab-${item.id}`}")
    expect(source).toContain("aria-controls={`ledger-rail-panel-${item.id}`}")
  })

  it("3개 패널 컨테이너 모두 role=\"tabpanel\"과 대응 id·aria-labelledby를 갖는다", () => {
    const source = read(workbenchPath)
    for (const id of ["detail", "input", "queue"]) {
      expect(source).toContain(`id="ledger-rail-panel-${id}"`)
      expect(source).toContain(`aria-labelledby="ledger-rail-tab-${id}"`)
    }
    // id="ledger-rail-panel-*"는 이 라운드가 새로 붙인 3개 패널에만 있어야 한다 — 다른
    // 기존 role="tabpanel"(렌즈 콘텐츠 영역 등)과 개수를 헷갈리지 않도록 접두어로 구분한다.
    const panelIdCount = source.split('id="ledger-rail-panel-').length - 1
    expect(panelIdCount).toBe(3)
  })

  it("기존 aria-selected·roving tabIndex는 그대로 유지된다(회귀 방지)", () => {
    const source = read(workbenchPath)
    expect(source).toContain("aria-selected={active}")
    expect(source).toContain("tabIndex={active ? 0 : -1}")
    expect(source).toContain(
      "onKeyDown={(event) => handleRovingTabKeyDown(event, index, railViewItems, railTabRefs, (nextItem) => selectRailView(nextItem.id))}",
    )
  })
})

describe("<main> 폭 보정 — 레일이 매트릭스 우측 열을 덮는 문제(§8.4 'REV 레일 겹침')", () => {
  it("xl:pr-[440px]가 sidePanelCollapsed·lens !== \"cockpit\" 조건에 걸려 있다", () => {
    const source = read(workbenchPath)
    const mainIndex = source.indexOf("<main")
    expect(mainIndex, "<main 태그를 찾지 못함").toBeGreaterThan(-1)
    const mainOpenEnd = source.indexOf(">", mainIndex)
    const mainOpenTag = source.slice(mainIndex, mainOpenEnd)
    expect(mainOpenTag).toContain("xl:pr-[440px]")
    expect(mainOpenTag).toContain("!sidePanelCollapsed")
    expect(mainOpenTag).toContain('lens !== "cockpit"')
    // 기존 반응형 여백(px-4/sm:px-6/lg:px-9)은 그대로 유지된다(회귀 방지).
    expect(mainOpenTag).toContain("space-y-5 px-4 pt-5 sm:px-6 lg:px-9")
  })

  it("<main>은 문서 내에 정확히 1개뿐이다(다른 <main> 신설 방지)", () => {
    const source = read(workbenchPath)
    const count = source.split(/<main[\s>]/).length - 1
    expect(count).toBe(1)
  })
})
