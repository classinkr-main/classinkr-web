import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  aggregateDshTotals,
  deriveDshProgress,
  deriveDshSegments,
  deriveDshTeamProgress,
  deriveDshWeeklyFromDealMix,
  dshElapsed,
  dshTotalsFromRows,
} from "@/components/admin/branch/ledger/dsh-derive"
import { DshProgressOverview, DshWeeklyHeroBody } from "@/components/admin/branch/ledger/DshProgressOverview"
import { weeklySnapshotSummary } from "@/components/admin/branch/ledger/DshDetailFolds"
import type { WeeklyCloseDiffView, WeeklyCloseRunView } from "@/components/admin/branch/ledger/shared"
import type { BranchDealMix, BranchDshBreakdownRow, BranchDshRow } from "@/components/admin/branch/types"

// DSH 진도 개요(시안 "매출시트 DSH 1a") 파생·렌더 계약 — 시안의 예시 수치(오늘 = 2026-10-21)를
// 그대로 픽스처로 쓴다: 월 목표 G·실적 S(¥백만), 구성 7조합, 팀 BD/MKT/CSM.

const FY_MONTHS = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
]
const G = [3.2, 3.4, 3.8, 3.6, 3.8, 4.4, 4.0, 4.2, 4.6, 3.8, 3.6, 5.6].map((v) => v * 1e6)
const S = [3.36, 3.06, 3.99, 2.88, 3.42, 4.62, 1.92, 0.24, 0, 0, 0, 0].map((v) => v * 1e6)
const GT = G.reduce((a, b) => a + b, 0)
const ST = S.reduce((a, b) => a + b, 0)
const NOW = new Date(Date.UTC(2026, 9, 21, 3))

// 연간 값을 시안의 월 분포(G 또는 S 비중)로 펼친 수치 묶음.
function spread(annual: number, shape: number[], shapeTotal: number) {
  const monthly = shape.map((v) => (annual * v) / shapeTotal)
  const months = Object.fromEntries(FY_MONTHS.map((ym, i) => [ym, monthly[i]]))
  const quarters = [0, 1, 2, 3].map((q) => monthly[q * 3] + monthly[q * 3 + 1] + monthly[q * 3 + 2]) as [
    number,
    number,
    number,
    number,
  ]
  return { annual, quarters, months }
}

const SEG: Array<[string, string, string, number, number]> = [
  ["Software", "New", "Direct", 16.8, 8.9],
  ["Software", "New", "Channel", 7.2, 3.1],
  ["Software", "Renew", "Direct", 9.6, 5.94],
  ["Software", "Renew", "Channel", 2.4, 1.05],
  ["Hardware", "New", "Direct", 6.0, 2.6],
  ["Hardware", "New", "Channel", 3.6, 1.2],
  ["Hardware", "Renew", "(미구분)", 2.4, 0.7],
]

function breakdownFixture(): BranchDshBreakdownRow[] {
  const rows: BranchDshBreakdownRow[] = []
  for (const [category, statusType, channel, goal, status] of SEG) {
    const combo = { category, status_type: statusType, channel }
    rows.push({ kind: "goal", ...combo, ...spread(goal * 1e6, G, GT) })
    rows.push({ kind: "status", ...combo, ...spread(status * 1e6, S, ST) })
  }
  // 팀·멤버 섹션의 같은 조합 반복(작은 annual) — 채택되면 3중 계상이다.
  rows.push({ kind: "goal", category: "Software", status_type: "New", channel: "Direct", ...spread(4e6, G, GT) })
  // 시트의 빈 조합(목표·실적 0) — 행을 만들지 않아야 한다.
  rows.push({ kind: "goal", category: "Hardware", status_type: "Renew", channel: "Direct", ...spread(0, G, GT) })
  return rows
}

function teamRow(team: string, kind: "goal" | "status", annual: number, member?: string): BranchDshRow {
  const shape = kind === "goal" ? G : S
  const total = kind === "goal" ? GT : ST
  return { level: member ? "member" : "team", team, ...(member ? { member } : {}), kind, ...spread(annual * 1e6, shape, total) }
}

function rowsFixture(): BranchDshRow[] {
  return [
    teamRow("ALL", "goal", 48),
    teamRow("ALL", "status", 23.49),
    teamRow("BD", "goal", 30),
    teamRow("BD", "status", 15.6),
    teamRow("BD", "goal", 9.6, "김지훈"),
    teamRow("BD", "status", 5.8, "김지훈"),
    teamRow("BD", "goal", 8.4, "박서연"),
    teamRow("BD", "status", 4.2, "박서연"),
    teamRow("MKT", "goal", 12),
    teamRow("MKT", "status", 5.4),
    teamRow("CSM", "goal", 6),
    teamRow("CSM", "status", 2.49),
  ]
}

describe("dshElapsed — 기대 진도(오늘 포함 경과 일수 ÷ 기간 일수)", () => {
  it("2026-10-21: 연 204/365일 · Q3 21/92일 · 10월 21/31일", () => {
    const elapsed = dshElapsed(NOW, 2026)
    expect(elapsed.year.pct).toBeCloseTo((204 / 365) * 100, 6)
    expect(elapsed.quarter.pct).toBeCloseTo((21 / 92) * 100, 6)
    expect(elapsed.quarter.daysLeft).toBe(71)
    expect(elapsed.month.pct).toBeCloseTo((21 / 31) * 100, 6)
    expect(elapsed.month.daysLeft).toBe(10)
    expect(elapsed.todayLabel).toBe("10/21")
  })

  it("데이터의 회계연도 밖이면 0 또는 100으로 고정한다", () => {
    expect(dshElapsed(NOW, 2027).year.pct).toBe(0)
    expect(dshElapsed(NOW, 2025).year.pct).toBe(100)
  })

  it("1~3월은 Q4(1월 시작) 분기 경과를 쓴다", () => {
    const elapsed = dshElapsed(new Date(Date.UTC(2027, 1, 14)), 2026)
    // 1/1 → 2/14 = 45일, Q4(1~3월) = 90일.
    expect(elapsed.quarter.pct).toBeCloseTo((45 / 90) * 100, 6)
  })
})

describe("deriveDshProgress — 시안 수치", () => {
  const progress = deriveDshProgress(aggregateDshTotals(breakdownFixture()), NOW)

  it("연간 달성 48.9% · 남은 목표 ¥2,451만 · 월평균 ¥408.5만(잔여 6개월, 당월 포함)", () => {
    expect(progress.fiscalYear).toBe(2026)
    expect(progress.annual.goal).toBeCloseTo(48e6, 0)
    expect(progress.annual.status).toBeCloseTo(23.49e6, 0)
    expect(progress.annual.pct).toBeCloseTo(48.9375, 6)
    expect(progress.remaining.amount).toBeCloseTo(24.51e6, 0)
    expect(progress.remaining.monthsLeft).toBe(6)
    expect(progress.remaining.monthlyNeeded).toBeCloseTo(4.085e6, 0)
  })

  it("당월까지 누적·현재 분기·이번 달", () => {
    expect(progress.currentMonthKey).toBe("2026-10")
    expect(progress.toDate?.goal).toBeCloseTo(26.2e6, 0)
    expect(progress.toDate?.status).toBeCloseTo(23.25e6, 0)
    expect(progress.currentQuarter).toBe(3)
    expect(progress.quarter.goal).toBeCloseTo(12.8e6, 0)
    expect(progress.quarter.status).toBeCloseTo(2.16e6, 0)
    expect(progress.month.goal).toBeCloseTo(4e6, 0)
    expect(progress.month.pct).toBeCloseTo(48, 6)
  })

  it("현재 분기의 미래 월에 잡힌 실적은 선반영으로 밝힌다(11월 ¥24만)", () => {
    expect(progress.prebooked.months).toEqual(["2026-11"])
    expect(progress.prebooked.amount).toBeCloseTo(240_000, 0)
    expect(progress.months.find((month) => month.ym === "2026-11")?.isFuture).toBe(true)
  })
})

describe("deriveDshSegments — 구성별 달성", () => {
  it("중복 제거 후 Software → Hardware, New → Renew, Direct → Channel → 그 외 순서로 묶는다", () => {
    const groups = deriveDshSegments(breakdownFixture(), NOW, "Y")
    expect(groups.map((group) => group.category)).toEqual(["Software", "Hardware"])
    expect(groups[0].rows.map((row) => row.label)).toEqual([
      "New · Direct",
      "New · Channel",
      "Renew · Direct",
      "Renew · Channel",
    ])
    // 빈 조합(Hardware Renew Direct, 0/0)은 행이 없다.
    expect(groups[1].rows.map((row) => row.label)).toEqual(["New · Direct", "New · Channel", "Renew · (미구분)"])
    // 멤버 섹션 중복(4M)이 합산되면 Software 목표가 40M이 된다 — 정답은 36M.
    expect(groups[0].goal).toBeCloseTo(36e6, 0)
    expect(groups[0].status).toBeCloseTo(18.99e6, 0)
    expect(groups[1].pct).toBeCloseTo((4.5 / 12) * 100, 6)
  })

  it("분기·월 전환은 Q3·10월 값을 고르고, 행 구성은 연간 기준 그대로 둔다", () => {
    const keys = (groups: ReturnType<typeof deriveDshSegments>) => groups.map((group) => group.rows.map((row) => row.key))
    const yearly = deriveDshSegments(breakdownFixture(), NOW, "Y")
    const quarterly = deriveDshSegments(breakdownFixture(), NOW, "Q")
    const monthly = deriveDshSegments(breakdownFixture(), NOW, "M")
    expect(keys(quarterly)).toEqual(keys(yearly))
    expect(keys(monthly)).toEqual(keys(yearly))
    // 시안 분포: 목표 Q3 = 12.8/48, 10월 = 4.0/48 · 실적 Q3 = 2.16/23.49, 10월 = 1.92/23.49.
    expect(quarterly[0].goal).toBeCloseTo((36e6 * 12.8) / 48, 0)
    expect(quarterly[0].status).toBeCloseTo((18.99e6 * 2.16) / 23.49, 0)
    expect(monthly[0].goal).toBeCloseTo((36e6 * 4) / 48, 0)
    expect(monthly[0].status).toBeCloseTo((18.99e6 * 1.92) / 23.49, 0)
  })

  it("빈 breakdown은 빈 배열", () => {
    expect(deriveDshSegments([], NOW, "Y")).toEqual([])
  })
})

describe("deriveDshTeamProgress — 팀·멤버 달성", () => {
  it("연간·현재 분기·현재 월 값을 고른다(팀 순서 ALL → BD → MKT → CSM)", () => {
    const yearly = deriveDshTeamProgress(rowsFixture(), NOW, "Y")
    expect(yearly.map((team) => team.team)).toEqual(["ALL", "BD", "MKT", "CSM"])
    expect(yearly[1].goal).toBeCloseTo(30e6, 0)
    expect(yearly[1].members.map((member) => member.member)).toEqual(["김지훈", "박서연"])
    expect(yearly[1].members[0].pct).toBeCloseTo((5.8 / 9.6) * 100, 6)

    const quarterly = deriveDshTeamProgress(rowsFixture(), NOW, "Q")
    expect(quarterly[0].goal).toBeCloseTo(12.8e6, 0)

    const monthly = deriveDshTeamProgress(rowsFixture(), NOW, "M")
    expect(monthly[0].status).toBeCloseTo(1.92e6, 0)
  })

  it("시트에 없는 kind는 null — 0으로 합성하지 않는다", () => {
    const rows = [teamRow("BD", "goal", 10)]
    const [bd] = deriveDshTeamProgress(rows, NOW, "Y")
    expect(bd.goal).toBeCloseTo(10e6, 0)
    expect(bd.status).toBeNull()
  })

  it("월 스코프에서 오늘이 회계월 창 밖이면 값이 없다", () => {
    const [all] = deriveDshTeamProgress(rowsFixture(), new Date(Date.UTC(2027, 5, 1)), "M")
    expect(all.goal).toBeNull()
    expect(all.pct).toBeNull()
  })
})

describe("dshTotalsFromRows — 개인 범위 폴백", () => {
  it("scopeDshToManager가 만든 ALL 사본(개인 행)을 합계로 쓴다", () => {
    const personal: BranchDshRow[] = [
      teamRow("BD", "goal", 9.6, "김지훈"),
      teamRow("BD", "status", 5.8, "김지훈"),
      { ...teamRow("ALL", "goal", 9.6), level: "team" },
      { ...teamRow("ALL", "status", 5.8), level: "team" },
    ]
    const totals = dshTotalsFromRows(personal)
    expect(totals?.goal.annual).toBeCloseTo(9.6e6, 0)
    expect(totals?.status.annual).toBeCloseTo(5.8e6, 0)
    expect(totals?.monthKeys).toEqual(FY_MONTHS)
  })

  it("ALL 행이 없으면 null", () => {
    expect(dshTotalsFromRows([teamRow("BD", "goal", 1)])).toBeNull()
  })
})

describe("weeklySnapshotSummary — 접힌 주간 스냅샷 행", () => {
  const runs: WeeklyCloseRunView[] = [
    { id: "head", startedAt: "2026-10-21T03:00:00Z", sourceName: "rev", rowCounts: {}, dataSource: "db" },
    { id: "base", startedAt: "2026-10-16T03:00:00Z", sourceName: "rev", rowCounts: {}, dataSource: "db" },
  ]
  const bucket = (count: number) => ({ count, baseAmount: 0, headAmount: 0, delta: 0 })
  const diff: WeeklyCloseDiffView = {
    month: "2026-10",
    baseTotal: 22_650_000,
    headTotal: 23_490_000,
    delta: 840_000,
    buckets: { new: bucket(3), increased: bucket(2), decreased: bucket(1), dropped: bucket(1), unchanged: bucket(4) },
    confirmedDelta: 0,
    highConfidenceDelta: 0,
    movers: [],
  }

  it("기준 → 현재 · 월 합계 증감 · 버킷 건수(유지 제외)", () => {
    expect(weeklySnapshotSummary({ runs, base: "base", head: "head", diff, loading: false, error: null })).toBe(
      "10/16 → 10/21 · 10월 합계 +¥84만 · 신규 3 · 증액 2 · 감액 1 · 소멸 1",
    )
  })

  it("0건 버킷은 생략하고, 전부 0이면 '변동 없음'", () => {
    const flat = { ...diff, delta: 0, buckets: { ...diff.buckets, new: bucket(0), increased: bucket(0), decreased: bucket(0), dropped: bucket(0) } }
    expect(weeklySnapshotSummary({ runs, base: "base", head: "head", diff: flat, loading: false, error: null })).toBe(
      "10/16 → 10/21 · 10월 합계 ±0 · 변동 없음",
    )
  })

  it("비교가 없을 때는 상태를 말한다(오류 > 로딩 > 스냅샷 부족)", () => {
    expect(weeklySnapshotSummary({ runs, base: "base", head: "head", diff: null, loading: false, error: "x" })).toContain(
      "불러오지 못했습니다",
    )
    expect(weeklySnapshotSummary({ runs, base: "base", head: "head", diff: null, loading: true, error: null })).toBe(
      "스냅샷 비교를 불러오는 중",
    )
    expect(weeklySnapshotSummary({ runs: runs.slice(0, 1), base: "", head: "head", diff: null, loading: false, error: null })).toContain(
      "두 개 이상",
    )
  })
})

describe("DshProgressOverview 렌더", () => {
  it("전사 범위: 시안의 히어로·월별·기간 카드·구성별·팀 섹션을 그린다", () => {
    const html = renderToStaticMarkup(
      <DshProgressOverview breakdown={breakdownFixture()} rows={rowsFixture()} now={NOW} />,
    )
    expect(html).toContain("FY26-27 연간 진도")
    expect(html).toContain("48.9%")
    expect(html).toContain("¥2,349만")
    expect(html).toContain("¥4,800만")
    expect(html).toContain("기대 진도 56% · 10/21")
    expect(html).toContain("7.0%p 뒤")
    expect(html).toContain("¥2,451만")
    expect(html).toContain("¥408.5만")
    expect(html).toContain("10월까지 누적")
    expect(html).toContain("월별 목표 대비 실적")
    expect(html).toContain("이번 달 · 10월")
    expect(html).toContain("월 경과 68%")
    expect(html).toContain("남은 10일 동안 ¥208만 필요")
    expect(html).toContain("현재 분기 · Q3")
    expect(html).toContain("분기 경과 23%")
    expect(html).toContain("11월 선반영 ¥24만 포함")
    expect(html).toContain("구성별 연간 달성")
    expect(html).toContain('aria-label="구성별 달성 기간 전환"')
    // 구성별·팀 카드가 같은 기대 진도 기준선을 밝힌다.
    expect(html.split("세로선 = 기대 진도 56% (연 경과)").length - 1).toBe(2)
    expect(html).toContain("New · Direct")
    expect(html).toContain("Renew · (미구분)")
    expect(html).toContain("SW : HW")
    expect(html).toContain("팀 · 멤버 연간 달성")
    expect(html).toContain("Team KR")
    expect(html).toContain("CSM · 이전 조직 이력")
    // 기본으로 멤버가 있는 첫 팀(BD)을 펼친다.
    expect(html).toContain("김지훈")
    expect(html).toContain("행을 누르면 멤버 펼침")
    // DESIGN.md 밖 색(시안의 #3F7A63)을 쓰지 않는다 — 당월 채움은 Classin Green 틴트.
    expect(html).not.toContain("#3F7A63")
    expect(html).toContain("bg-[#084734]/75")
  })

  it("개인 범위(breakdown 없음): 개인 행으로 진도를 그리고 구성별 분해는 생략을 알린다", () => {
    const personal: BranchDshRow[] = [
      teamRow("BD", "goal", 9.6, "김지훈"),
      teamRow("BD", "status", 5.8, "김지훈"),
      { ...teamRow("ALL", "goal", 9.6), level: "team" },
      { ...teamRow("ALL", "status", 5.8), level: "team" },
    ]
    const html = renderToStaticMarkup(
      <DshProgressOverview breakdown={[]} rows={personal} personalManager="김지훈" now={NOW} />,
    )
    expect(html).toContain("개인 DSH · 김지훈")
    expect(html).toContain("60.4%")
    expect(html).toContain("개인 범위에는 구성별")
    // 구성별 분해가 없으면 기간 전환도 두지 않는다.
    expect(html).not.toContain("구성별 달성 기간 전환")
    expect(html).toContain("개인 연간 달성")
    expect(html).not.toContain("행을 누르면 멤버 펼침")
  })

  it("데이터가 없으면 빈 상태 문구", () => {
    const html = renderToStaticMarkup(<DshProgressOverview breakdown={[]} rows={[]} now={NOW} />)
    expect(html).toContain("DSH 진도를 계산할 데이터가 없습니다")
  })

  it("주 보기: 확정 합계·전주 대비에 구성별 주간 확정액·구성비를 축별로 붙인다(지표 밴드 주간 타일 승계)", () => {
    const slice = (name: string, week: number, prevWeek: number) => ({
      name,
      goal: 0,
      actual: 0,
      pct: 0,
      week_actual: week,
      prev_week_actual: prevWeek,
    })
    const dealMix: BranchDealMix = {
      by_category: [slice("Software", 300_000, 100_000), slice("Hardware", 700_000, 400_000)],
      by_status_type: [slice("New", 600_000, 0), slice("Renew", 400_000, 0)],
      by_channel: [slice("Direct", 550_000, 0), slice("Channel", 200_000, 0)],
    }
    const weekly = deriveDshWeeklyFromDealMix(dealMix)
    if (!weekly) throw new Error("fixture weekly must not be null")
    const html = renderToStaticMarkup(<DshWeeklyHeroBody weekly={weekly} />)
    expect(html).toContain("¥100만")
    expect(html).toContain("¥50만")
    expect(html).toContain("+¥50만")
    // 축 순서(SW/HW → New/Renew → Direct/Channel)대로 금액과 주간 합계 대비 구성비를 보인다.
    const order = ["Software", "¥30만", "30.0%", "Hardware", "¥70만", "70.0%", "New", "¥60만", "Renew", "Direct", "¥55만", "55.0%", "Channel", "¥20만", "20.0%"]
    const positions = order.map((text) => html.indexOf(text))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // 채널 축은 매핑된 딜만이라 합(¥75만)이 합계보다 작다 — 문구로 밝힌다.
    expect(html).toContain("채널 축은 Direct·Channel로")
  })
})
