import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import LedgerMatrix from "@/components/admin/branch/ledger/LedgerMatrix"
import type { LedgerRevenueRow } from "@/components/admin/branch/ledger/shared"

const MONTHS = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"]
const TODAY = new Date("2026-11-20T03:00:00Z")

const rows: LedgerRevenueRow[] = [
  { id: "a", customer: "가온어학원", manager: "A", team: "BD", region: "서울", revenue: 0, ledgerOrigin: "sheet", productVersion: "전자칠판", status: "New", dealType: "Channel",
    monthlyPayments: { "2026-10": 50, "2026-11": 100 }, monthlyConfirmed: { "2026-10": 50, "2026-11": 0 }, weeklyPayments: { "2026-11": [0, 0, 100, 0, 0] } },
]

function render(overrides: Partial<React.ComponentProps<typeof LedgerMatrix>> = {}) {
  return renderToStaticMarkup(
    <LedgerMatrix rows={rows} months={MONTHS} currentMonth="2026-11" monthlyGoals={null} groupBy="none" showManager={false} edit={null} onOpenRow={() => {}} today={TODAY} {...overrides} />,
  )
}

describe("LedgerMatrix 렌더", () => {
  it("고정 칸은 인라인 left 와 max-md:!left-auto 를 함께 가진다", () => {
    const html = render()
    expect(html).toContain("left:232px")
    expect(html).toContain("max-md:!left-auto")
    expect(html).toContain("table-fixed")
  })

  it("라벨 열 머리·깔때기·합계 행", () => {
    const html = render()
    for (const label of ["지역순 정렬", "계약순 정렬", "경로순 정렬", "제품순 정렬"]) expect(html).toContain(label)
    expect(html).toContain('aria-label="11월 값 있는 행만"')
    expect(html).toContain('aria-label="11월 w3 값 있는 행만"')
    expect(html).toContain('aria-label="11월 주차 접기"')
    expect(html).toContain('aria-label="10월 주차 펼치기"')
    expect(html).toContain("합계 · 1곳")
    expect(html).toContain("지난달 고정")
    expect(html).toContain("최근 지난달 4개를 고객 옆에 고정")
  })

  it("담당 열은 showManager 일 때만", () => {
    expect(render()).not.toContain("담당순 정렬")
    expect(render({ showManager: true })).toContain("담당순 정렬")
  })

  it("행이 없어도 조작줄과 status 가 그려진다", () => {
    const html = render({ rows: [], status: <span data-sheet-write-notice>시트 쓰기 켜짐</span> })
    expect(html).toContain("data-sheet-write-notice")
    expect(html).toContain("이 범위에 이번 회계연도 매출이 없습니다.")
    expect(html).toContain('aria-label="고객 검색"')
  })

  it("FY 밖이면 빠른 필터·지난달 고정을 숨긴다", () => {
    const html = render({ currentMonth: "2027-05" })
    expect(html).not.toContain("이번 주 값 있음")
    expect(html).not.toContain("지난달 고정")
  })
})
