import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import HqWeeklyReport from "@/components/admin/branch/sections/HqWeeklyReport"
import { readWeeklyReportDraft, type BranchWeeklyCompassReport, type WeeklyReportDraft } from "@/lib/branch/weekly-report-contract"
import { matchDraftKaRow } from "@/components/admin/branch/sections/HqWeeklyReport"
import { actionGroup, actionSection } from "@/lib/branch/weekly-action-sections"
import { firstSentence } from "@/components/admin/branch/sections/hq-weekly/format"

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
    expect(html).not.toMatch(/contentEditable="true"[^>]*>[^<]*오래된 액션/)
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
    expect(html).not.toMatch(/contentEditable="true"[^>]*>[^<]*AI 액션/)
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

describe("AI 액션 → 보고서 구획 매핑", () => {
  it("module KA→三, market→四, partner·other→五", () => {
    expect(actionSection({ title: "a", module: "KA" })).toBe("ka")
    expect(actionSection({ title: "a", module: "market" })).toBe("market")
    expect(actionSection({ title: "a", module: "partner" })).toBe("other")
    expect(actionSection({ title: "a", module: "other" })).toBe("other")
  })
  it("회수·수금·입금·결제 예정·回款·收款이 제목이나 근거에 있으면 module과 무관하게 二", () => {
    expect(actionSection({ title: "미수금 회수 독촉", module: "KA" })).toBe("collect")
    expect(actionSection({ title: "견적 회신", why: "12월 입금 예정", module: "partner" })).toBe("collect")
    expect(actionSection({ title: "跟进回款", module: "market" })).toBe("collect")
    expect(actionSection({ title: "收款确认" })).toBe("collect")
    expect(actionSection({ title: "결제 예정 고객 확인", module: "other" })).toBe("collect")
    expect(actionGroup({ title: "회수", module: "KA" })).toBe("collect")
  })
  it("module이 없는 옛 캐시는 문장으로 추정한다", () => {
    expect(actionSection({ title: "한빛 계약 회차 잡기" })).toBe("ka")
    expect(actionSection({ title: "12월 설명회 초청" })).toBe("market")
    expect(actionSection({ title: "교육청 시범 학교 회신" })).toBe("other")
    expect(actionSection({ title: "미분류 정리" })).toBe("other")
  })
  it("첫 문장은 소수점에서 끊지 않는다", () => {
    expect(firstSentence("11月回款达成 54.2%，软件为主。其它。")).toBe("11月回款达成 54.2%，软件为主。")
    expect(firstSentence("Rate is 54.2% now. Next.")).toBe("Rate is 54.2% now.")
  })
})

describe("자세히 보기 ①→② 모핑", () => {
  const kaReport: BranchWeeklyCompassReport = {
    ...report,
    ka: { ...report.ka, compassState: "ready", customers: [{
      ...report.ka.customers[0],
      compass: { leadId: 1, academy: "윤유경플러스", url: "https://example.com/l/1", stage: "quote", stageLabel: "견적", nextAction: null, nextActionAt: null,
        lastActivityAt: "2026-11-24T01:00:00Z", weekActivityCount: 2, recent: [{ at: "2026-11-24T01:00:00Z", kind: "stage", actor: "하람", text: "단계 변경 데모 → 면담" }] },
    }] },
  }
  const actions = [
    { title: "윤유경플러스 계약 회차 잡기", why: "견적 단계", owner: "하람", due: "2099-12-02", module: "KA" as const },
    { title: "12월 설명회 초청 재접촉", owner: "지우", due: "2099-11-28", module: "market" as const },
  ]
  const renderFocus = (focus: "ka" | null, picked: number | null, lang: "zh" | "ko" = "ko") =>
    renderToStaticMarkup(<HqWeeklyReport team="ALL" refreshKey={0} lang={lang} draft={draft} draftWeek="2026 W47" notes={[]} actions={actions}
      weekly={{ key: "k", data: kaReport, error: null, loading: false, stale: false, staleSince: null }}
      focus={focus} pickedActionIndex={picked} onFocus={() => {}} />)

  it("focus=ka: 머리에 자세히 보기·최소화, 패널에 할 일(누른 항목 강조), 다른 구획은 peek", () => {
    const html = renderFocus("ka", 0)
    expect(html).toContain("자세히 보기 · 三 핵심 KA")
    expect(html).toContain("− 최소화")
    expect(html).toContain("이 구획의 할 일")
    expect(html).toMatch(/data-picked="true"[^>]*>(?:<span[^>]*>)?윤유경플러스 계약 회차 잡기/)
    const kaSection = html.slice(html.indexOf('data-section="ka"'), html.indexOf('data-section="market"'))
    expect(kaSection).not.toContain("12월 설명회 초청 재접촉")
    // 三 요약: 확정은 확정 토큰 색, Compass 타임라인
    expect(html).toContain("#C8102E")
    expect(html).toContain("단계 변경 데모 → 면담 · 하람")
    // 다른 구획은 접힌다 — peek는 AI 小结 첫 문장
    expect(html).toContain("11月回款达成 54.2%，软件为主。")
    expect(html).toMatch(/aria-expanded="true"[^>]*>3\. 핵심 KA/)
    // 문서 표는 언마운트하지 않는다(편집 칸 유지)
    expect(html).toContain("本周完成报价沟通")
    expect(html).toContain("윤유경플러스")
  })
  it("focus=ka에서 연결된 할 일이 없는 구획 패널은 '연결된 할 일 없음'", () => {
    expect(renderFocus("ka", null)).toContain("연결된 할 일 없음")
  })
  it("focus=null: 기존 문서 그대로 — 자세히 보기 머리·최소화 없음, 모든 구획 aria-expanded=false", () => {
    const html = renderFocus(null, null, "zh")
    expect(html).not.toContain("자세히 보기 ·")
    expect(html).not.toContain("− 최소화")
    expect(html.match(/aria-expanded="false"/g)?.length).toBeGreaterThanOrEqual(5)
    expect(html).not.toContain('aria-expanded="true"')
    expect(html).toContain("复制表格")
    expect(html).toContain("本周阶段变化")
  })
  it("② 전용 요소는 복사·인쇄에서 빠지도록 data-report-exclude와 print:hidden을 단다", () => {
    const html = renderFocus("ka", 0)
    expect(html.match(/data-report-exclude/g)?.length).toBeGreaterThanOrEqual(5 * 3)
    expect(html).toContain("print:hidden")
    expect(html).toContain("print:grid-rows-[1fr]")
    expect(html).toContain("motion-reduce:transition-none")
  })
})
