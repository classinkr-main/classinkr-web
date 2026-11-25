import { readFileSync } from "fs"
import { join } from "path"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import SalesLedgerWorkbench from "@/components/admin/branch/SalesLedgerWorkbench"
import LedgerSheet from "@/components/admin/branch/ledger/LedgerSheet"
import { buildSheetColumns, sumSheetRows } from "@/components/admin/branch/ledger/ledger-sheet-logic"

// 워크벤치의 '오늘'(KST 영업일 · 서버가 넘긴 첫 날) · 첫 불러오기 · 머리 타일 배선(F-10 · F-11 · F-13 · F-27 · F-45 · D3).
// 이 저장소 vitest 는 node 환경이라 effect 가 돌지 않는 서버 렌더(renderToStaticMarkup)로 첫 화면을 본다 — 첫 화면이 곧
// 하이드레이션이 맞아야 하는 화면이다.

let search = ""
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}))

afterEach(() => {
  vi.useRealTimers()
  search = ""
})

const source = readFileSync(join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"), "utf8").replace(/\r\n/g, "\n")
const pageSource = readFileSync(join(process.cwd(), "app/admin/branch/ledger/page.tsx"), "utf8").replace(/\r\n/g, "\n")

function render(props: { initialBusinessDate?: string } = {}) {
  return renderToStaticMarkup(<SalesLedgerWorkbench defaultManager="예시 담당" {...props} />)
}

describe("첫 화면의 이번 달 — KST 영업일(F-10) · 서버가 넘긴 날(F-45)", () => {
  it("12/1 00:05 KST(UTC 로는 11/30)에 열면 12월이 이번 달이다 — 지난달(11월)로 열지 않는다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-30T15:05:00Z"))
    const html = render()
    expect(html).toContain('aria-label="12월 계 값 있음 필터 풀기"')
    expect(html).toMatch(/<option value="2026-12" selected="">FY26 · 12월<\/option>/)
  })

  it("서버가 넘긴 날이 있으면 브라우저 시계보다 그 날로 첫 화면을 그린다 — 서버 · 브라우저가 달 경계 양쪽에 있어도 같은 HTML", () => {
    vi.useFakeTimers()
    // 브라우저는 이미 12/1 00:00:30 KST, 서버는 11/30 23:59:59 KST 에 그렸다.
    vi.setSystemTime(new Date("2026-11-30T15:00:30Z"))
    const html = render({ initialBusinessDate: "2026-11-30" })
    expect(html).toContain('aria-label="11월 계 값 있음 필터 풀기"')
    expect(html).toMatch(/<option value="2026-11" selected="">FY26 · 11월<\/option>/)
  })

  it("4/1 00:05 KST 에는 새 회계연도(FY27)의 4월로 연다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2027-03-31T15:05:00Z"))
    const html = render()
    expect(html).toMatch(/<option value="2027-04" selected="">FY27 · 4월<\/option>/)
    expect(html).toContain('<option value="2028-03">FY27 · 3월</option>')
    expect(html).not.toContain('value="2027-03"')
  })
})

describe("건별 시트의 이번 주 열 — 화면이 들고 있는 오늘(F-11)", () => {
  const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
  const sheet = (today: string) => {
    const columns = buildSheetColumns(MONTHS, "2026-11")
    return renderToStaticMarkup(
      <LedgerSheet
        columns={columns}
        views={[]}
        allViews={[]}
        totals={sumSheetRows([], columns)}
        filters={{}}
        onFiltersChange={() => {}}
        currentMonth="2026-11"
        today={today}
        loading={false}
        emptyText="행이 없습니다."
        activeRowId={null}
        onOpenRow={() => {}}
        editor={null}
        pendingByCell={null}
      />,
    )
  }

  it("넘긴 오늘의 주차에 '이번 주' 표시 — 22일 시작 주는 W4, 8일 시작 주는 W2", () => {
    expect(sheet("2026-11-25")).toContain('aria-label="11월 W4 · 이번 주 필터 메뉴"')
    const second = sheet("2026-11-09")
    expect(second).toContain('aria-label="11월 W2 · 이번 주 필터 메뉴"')
    expect(second).not.toContain('aria-label="11월 W4 · 이번 주 필터 메뉴"')
  })

  it("오늘이 기준 달 밖이면(다음 달로 넘어감) 이번 주 표시가 없다", () => {
    expect(sheet("2026-12-01")).not.toContain("· 이번 주 필터 메뉴")
  })
})

describe("첫 불러오기 중의 결과 줄(F-13)", () => {
  it("시트 행 · 초안 목록이 아직이면 결과 줄은 행 수 · 합계 대신 '불러오는 중'", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-25T03:00:00Z"))
    const html = render()
    expect(html).toMatch(/<p aria-busy="true"[^>]*>불러오는 중<\/p>/)
    expect(html).not.toMatch(/>0<span[^>]*> \/ 0<\/span>/)
  })
})

describe("워크벤치 배선(소스 스캔)", () => {
  it("'지금 → 달'은 KST 오늘 상태 하나로 — UTC ymKeyUtc(new Date()) · 하드코딩 '2026-04' 가 없다", () => {
    expect(source).not.toContain("ymKeyUtc(")
    expect(source).not.toContain('"2026-04"')
    expect(source).toContain("const [businessToday, setBusinessToday] = useState(() => ledgerBusinessDate(initialBusinessDate))")
    expect(source).toContain("const viewFiscalYear = ledgerViewFiscalYear(selectedMonth, businessToday)")
    expect(source).toContain("column.month === matrixMonths[0]")
    expect(source).toContain("buildPeriodMonths(period, selectedMonth, matrixMonths, businessToday)")
  })

  it("1분 틱(탭 복귀 포함)이 오늘을 다시 읽고, 이번 달이 바뀌면 기본 달 · 손대지 않은 폼을 옮긴다(F-11)", () => {
    const tick = source.slice(source.indexOf("useVisibleInterval(() => {"), source.indexOf("}, 60_000)"))
    expect(tick).toContain("setBusinessToday((current) => nextLedgerBusinessDate(current, new Date(now)))")
    expect(source).toContain("rolledSelectedMonth({ selectedMonth: current, previousDefault: previous, nextDefault: businessMonth, urlHasMonth })")
    expect(source).toContain("rolledDraftForm(current, previous, businessMonth, editingDraftId != null)")
    // 주소 writer 보다 먼저 돈다 — writer 가 ?month 를 지우기 전에 "주소에 달이 있었는가"를 본다.
    expect(source.indexOf("rolledSelectedMonth({")).toBeLessThan(source.indexOf("if (selectedMonth !== defaultMonthRef.current) params.set(\"month\", selectedMonth)"))
  })

  it("시트 기준 달 되돌려 쓰기(F-27)와 회계연도 시드 키(F-45)", () => {
    expect(source).toContain("sheetAnchorCorrection(selectedMonth, clampSheetAnchor(matrixMonths, selectedMonth))")
    expect(source).toContain("const pipelineUrl = ledgerPipelineUrl({ team, period, month: selectedMonth, manager: scopedManager, fy: viewFiscalYear })")
    expect(pageSource).toContain("initialBusinessDate={initialBusinessDate}")
    expect(pageSource).toContain("fy: fiscalYearOfYm(initialBusinessDate)")
    expect(pageSource).toContain("url: ledgerPipelineUrl({")
  })

  it("건별 시트 · 결과 줄은 첫 불러오기 플래그와 일부만 안내를 받는다(F-13)", () => {
    const sheet = source.slice(source.indexOf("<LedgerSheet"), source.indexOf("<ApprovalBar", source.indexOf("<LedgerSheet")))
    expect(sheet).toContain("loading={sheetRowsPending}")
    expect(sheet).toContain("partialNotice={pipelinePartial ? SHEET_PARTIAL_NOTICE : null}")
    expect(sheet).toContain("today={businessToday}")
    expect(sheet).toContain("currentMonth={businessMonth}")
    const topBar = source.slice(source.indexOf("<LedgerTopBar"), source.indexOf("foldPanelId=", source.indexOf("<LedgerTopBar")))
    expect(topBar).toContain("loading={sheetRowsPending}")
    expect(topBar).toContain("partial: pipelinePartial")
    expect(source).toContain("loading: sheetRowsPending || summaryPending")
  })

  it("머리 타일은 서버 요약 하나로 — '장부 합계' · 화면 쪽 신규 합산이 없다(D3 · F-23 · F-40)", () => {
    expect(source).not.toContain("장부 합계")
    expect(source).not.toContain("appliedDraftTotal")
    expect(source).not.toContain("시트 원천 ·")
    expect(source).not.toContain("시트 기준 목표")
    expect(source).toContain("const revPrevPeriodComparison = revenueTiles.prev")
    expect(source).toMatch(/label="장부 가감"\n\s+value=\{revenueTiles\.ledgerDelta\.value\}/)
  })

  it("주차 검수 카드는 부호 그대로 · 자르지 않는다(D2 · design-0)", () => {
    expect(source).toContain("buildRevMonthScalars(filteredRows, selectedMonth, businessToday)")
    expect(source).toContain("const revMonthOpen = revMonthScalars.open")
    expect(source).not.toContain("Math.max(revMonthTotal")
    expect(source).toContain("rowHasMonthValue(row, selectedMonth)")
    expect(source).toContain("matrixMonths.reduce((sum, month) => sum + rowMonthNet(row, month), 0)")
  })
})
