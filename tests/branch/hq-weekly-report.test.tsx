import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HqWeeklyReport from "@/components/admin/branch/sections/HqWeeklyReport"
import type { BranchWeeklyCompassReport } from "@/lib/branch/weekly-report-contract"

// 본사 주간 보고서는 본사 양식(韩国业务周报)의 5개 구획 순서와 표 머리를 그대로 따른다.
const week = (startDate: string, endDate: string, label: string) => ({ label, startDate, endDate, since: `${startDate}T00:00+09:00`, until: `${endDate}T00:00+09:00` })
const report: BranchWeeklyCompassReport = {
  generatedAt: "2026-11-25T00:00:00Z",
  week: week("2026-11-16", "2026-11-22", "2026 W47"),
  previousWeek: week("2026-11-09", "2026-11-15", "2026 W46"),
  scope: { team: "ALL", manager: null, teamSource: null },
  funnel: {
    state: "ready", truncated: false, inflow: { current: 24, previous: 56 },
    stages: [{ key: "demo", label: "데모", current: 4, previous: 27 }], lost: { current: 1, previous: 6 }, lostReasons: [], owners: [], unassigned: 11,
  },
  evaluation: { state: "not_configured", month: "2026-11", basis: null, people: [] },
  ka: { quarter: "FY2026-Q3", months: ["2026-10", "2026-11", "2026-12"], confirmed: 46_250, open: 122_500, customerCount: 1,
    customers: [{ customer: "윤유경플러스", manager: "Junhyuk", team: "MKT", confirmed: 46_250, open: 122_500, total: 168_750, deals: 2 }] },
}
const render = (lang: "zh" | "ko", actions = [{ title: "海鸥语文 설명회 일정 확정", owner: "Junhyuk", due: "2099-01-01" }, { title: "오래된 액션", owner: "BD팀", due: "2024-06-04" }]) =>
  renderToStaticMarkup(<HqWeeklyReport team="ALL" refreshKey={0} lang={lang}
    weekly={{ key: "k", data: report, error: null, loading: false, stale: false, staleSince: null }} notes={["매출 요약"]} actions={actions} />)

describe("본사 주간 보고서 양식", () => {
  it("중국어 양식의 다섯 구획을 순서대로 싣는다", () => {
    const html = render("zh")
    const order = ["一、财年业绩进展表", "二、本月收款计划与实施情况", "三、重点KA客户情况跟进", "四、市场活动计划统计表", "五、其它情况"].map((h) => html.indexOf(h))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toContain("2026 W47")
    expect(html).toContain("本周阶段变化")
  })
  it("KA 고객은 이번 분기 확정·미확정과 함께 싣고 Compass 단계명은 중국어로 바꾼다", () => {
    const html = render("zh")
    expect(html).toContain("윤유경플러스")
    expect(html).toContain("本季确认 4.6 · 未确认 12.3")
    expect(html).toContain("演示")
    expect(html).not.toContain(">데모<")
  })
  it("다음 주 계획 초안에는 기한이 지난 AI 액션을 싣지 않는다", () => {
    const html = render("ko")
    expect(html).toContain("海鸥语文 설명회 일정 확정")
    expect(html).not.toContain("오래된 액션")
    expect(html).toContain("1. 회계연도 실적 진척표")
  })
})
