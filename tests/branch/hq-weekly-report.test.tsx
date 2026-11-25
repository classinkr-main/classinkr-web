import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HqWeeklyReport from "@/components/admin/branch/sections/HqWeeklyReport"
import { readWeeklyReportDraft, type BranchWeeklyCompassReport, type WeeklyReportDraft } from "@/lib/branch/weekly-report-contract"
import { matchDraftKaRow } from "@/components/admin/branch/sections/HqWeeklyReport"

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
const draft: WeeklyReportDraft = {
  performance: "11月回款达成 54.2%，软件为主。",
  collections: "本月确认 26.5 万，W4 计划 12.0 万待回款。",
  ka: [{ customer: "윤유경 플러스", stage: "商机推进", change: "本周完成报价沟通", issue: "预算审批未定", next_action: "12/2 前回访确认合同", hq_support: "无" }],
  activities: "上周流入 24 条，较前一周 56 条减少。",
  key_points: ["回款进度落后", "KA 윤유경플러스 进入报价"],
  next_week: [{ plan: "윤유경플러스 合同确认", module: "KA", due: "2099-01-02" }, { plan: "旧计划", module: "other", due: "2024-01-01" }],
}
const renderDraft = (draftWeek: string | null) =>
  renderToStaticMarkup(<HqWeeklyReport team="ALL" refreshKey={0} lang="zh" draft={draft} draftWeek={draftWeek}
    weekly={{ key: "k", data: report, error: null, loading: false, stale: false, staleSince: null }} notes={[]} actions={[{ title: "AI 액션", owner: "Han", due: "2099-01-01" }]} />)
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

describe("AI 간이 보고 초안", () => {
  it("같은 틀로 구획 요약 · KA 진행 · 요점 · 다음 주 계획을 채운다", () => {
    const html = renderDraft("2026 W47")
    expect(html).toContain("11月回款达成 54.2%")
    expect(html).toContain("本月确认 26.5 万")
    expect(html).toContain("上周流入 24 条")
    // KA 행은 공백이 달라도 같은 고객으로 맞춘다
    expect(html).toContain("本周完成报价沟通")
    expect(html).toContain("12/2 前回访确认合同")
    expect(html).toContain("1. 回款进度落后")
    // 5.2는 AI 액션보다 간이 보고 계획이 우선이고, 기한이 지난 계획은 뺀다. 모듈은 양식 라벨로.
    expect(html).toContain("윤유경플러스 合同确认")
    expect(html).not.toContain("旧计划")
    expect(html).not.toContain("AI 액션")
    expect(html).not.toContain("AI 草稿基于")
  })
  it("초안이 다른 보고 주 기준이면 알린다", () => {
    expect(renderDraft("2026 W46")).toContain("AI 草稿基于 2026 W46")
  })
  it("고객명은 정확히 같은 행을 먼저, 없으면 포함 관계로 맞춘다", () => {
    const rows = [{ customer: "한빛영어학원 분당" }, { customer: "한빛 영어학원" }]
    expect(matchDraftKaRow(rows, "한빛영어학원")?.customer).toBe("한빛 영어학원")
    expect(matchDraftKaRow([{ customer: "한빛영어학원 분당" }], "한빛영어학원")?.customer).toBe("한빛영어학원 분당")
    expect(matchDraftKaRow(rows, "새솔")).toBeNull()
  })
  it("저장된 raw_response 모양이 다르면 초안을 쓰지 않고, 모듈 값이 이상하면 기타로 둔다", () => {
    expect(readWeeklyReportDraft(null)).toBeNull()
    expect(readWeeklyReportDraft({ ka: "x" })).toBeNull()
    const parsed = readWeeklyReportDraft({ performance: 1, ka: [{ customer: "A" }], key_points: ["p", 3], next_week: [{ plan: "x", module: "sales", due: "" }] })
    expect(parsed?.performance).toBe("")
    expect(parsed?.ka[0]).toEqual({ customer: "A", stage: "", change: "", issue: "", next_action: "", hq_support: "" })
    expect(parsed?.key_points).toEqual(["p"])
    expect(parsed?.next_week[0].module).toBe("other")
  })
})
