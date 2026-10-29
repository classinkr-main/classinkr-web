import { describe, expect, it } from "vitest"
import {
  aggregateDshTotals,
  deriveDshComposition,
  deriveDshMonthlyPace,
  deriveDshProgress,
  deriveDshSegments,
  deriveDshWeeklyFromDealMix,
  dshRate,
  dshRateToneClass,
} from "@/components/admin/branch/ledger/dsh-derive"
import type { BranchDealMix, BranchDshBreakdownRow } from "@/components/admin/branch/types"

// DSH 렌즈 파생 SSOT(dsh-derive) 검증 — 진도 개요·월별 페이스가 소비하는 전사 합계·기간
// 지표·필요 페이스·구성별 달성·구성비. 핵심 회귀: breakdown 스코프 중복(전사+팀+멤버)은 합산하면
// 3중 계상이므로 최대-annual 채택 규칙이 모든 파생 경로에서 지켜져야 한다.

const FY_MONTHS = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
]

function monthsOf(perMonth: number): Record<string, number> {
  return Object.fromEntries(FY_MONTHS.map((ym) => [ym, perMonth]))
}

function row(
  kind: "goal" | "status",
  annual: number,
  months: Record<string, number> = {},
  combo: Partial<Pick<BranchDshBreakdownRow, "category" | "status_type" | "channel">> = {},
  quarters?: [number, number, number, number],
): BranchDshBreakdownRow {
  return {
    kind,
    category: combo.category ?? "Software",
    status_type: combo.status_type ?? "New",
    channel: combo.channel ?? "Direct",
    annual,
    quarters: quarters ?? ([annual / 4, annual / 4, annual / 4, annual / 4] as [number, number, number, number]),
    months,
  }
}

// 고정 기준 시각 — 2026-07-15 UTC: FY2026(4월 시작)의 Q2, 회계월 2026-07.
const NOW = new Date(Date.UTC(2026, 6, 15))

// 진도 개요·페이스 공용 픽스처:
//  - SW/New/Direct  goal 1.2M(월 100k), status 480k(4~7월에만: 80/60/60/280k, Q1 200k·Q2 280k)
//  - HW/Renew/(미구분) goal 600k(월 50k), status 120k(4월 120k, Q1 120k)
//  - 스코프 중복: SW/New/Direct goal 400k 멤버 행(월 100k) — 채택되면 안 된다.
function bandFixture(): BranchDshBreakdownRow[] {
  return [
    row("goal", 1_200_000, monthsOf(100_000), {}, [300_000, 300_000, 300_000, 300_000]),
    row("goal", 400_000, monthsOf(100_000)), // 멤버 섹션 중복(작은 annual) — 무시 대상
    row(
      "status",
      480_000,
      { "2026-04": 80_000, "2026-05": 60_000, "2026-06": 60_000, "2026-07": 280_000 },
      {},
      [200_000, 280_000, 0, 0],
    ),
    row(
      "goal",
      600_000,
      monthsOf(50_000),
      { category: "Hardware", status_type: "Renew", channel: "(미구분)" },
      [150_000, 150_000, 150_000, 150_000],
    ),
    row(
      "status",
      120_000,
      { "2026-04": 120_000 },
      { category: "Hardware", status_type: "Renew", channel: "(미구분)" },
      [120_000, 0, 0, 0],
    ),
  ]
}

describe("dshRate / dshRateToneClass", () => {
  it("목표 0 이하·결측은 null — 0%로 왜곡하지 않는다", () => {
    expect(dshRate(100, 0)).toBeNull()
    expect(dshRate(100, -5)).toBeNull()
    expect(dshRate(50, 200)).toBeCloseTo(25, 6)
  })

  it("색 경계: ≥100 그린 · 70~100 주의 · <70 미달 · null 회색", () => {
    expect(dshRateToneClass(120)).toBe("text-[#084734]")
    expect(dshRateToneClass(100)).toBe("text-[#084734]")
    expect(dshRateToneClass(70)).toBe("text-[#A8741A]")
    expect(dshRateToneClass(69.9)).toBe("text-[#B43E3E]")
    expect(dshRateToneClass(null)).toBe("text-[#C9C5BF]")
  })
})

describe("aggregateDshTotals", () => {
  it("스코프 중복은 최대-annual 행만 채택해 합산한다(3중 계상 방지 회귀)", () => {
    const { goal, status } = aggregateDshTotals(bandFixture())
    // 중복(400k)이 합산됐다면 goal.annual = 2.2M — 정답은 1.2M + 600k.
    expect(goal.annual).toBe(1_800_000)
    // 월 값도 채택된 행의 것이어야 한다(중복 합산이면 4월 250k).
    expect(goal.months["2026-04"]).toBe(150_000)
    expect(status.annual).toBe(600_000)
    expect(status.months["2026-04"]).toBe(200_000)
  })
})

// 대체된 지표 밴드(deriveDshMetricsBand)의 회귀를 진도 개요 파생으로 옮겼다 — 같은 픽스처·같은 값.
describe("진도 개요 파생 — 기간 지표·필요 페이스(3중 계상 방지)", () => {
  const progress = () => deriveDshProgress(aggregateDshTotals(bandFixture()), NOW)

  it("연간/현재 분기/현재 월 3종 지표를 오늘(UTC) 기준으로 계산한다", () => {
    const { fiscalYear, currentQuarter, currentMonthKey, annual, quarter, month } = progress()
    expect(fiscalYear).toBe(2026)
    expect(currentQuarter).toBe(2)
    expect(currentMonthKey).toBe("2026-07")

    expect(annual).toMatchObject({ goal: 1_800_000, status: 600_000 })
    expect(annual.pct).toBeCloseTo((600_000 / 1_800_000) * 100, 6)

    // Q2 = quarters[1]: goal 300k+150k, status 280k+0.
    expect(quarter).toMatchObject({ goal: 450_000, status: 280_000 })
    expect(quarter.pct).toBeCloseTo((280_000 / 450_000) * 100, 6)

    // 2026-07: goal 100k+50k, status 280k — 목표 초과 월.
    expect(month).toMatchObject({ goal: 150_000, status: 280_000 })
    expect(month.pct).toBeCloseTo((280_000 / 150_000) * 100, 6)
  })

  it("남은 목표·필요 페이스 — 잔여 회계월 수는 당월 포함, 월평균 = 남은 목표 ÷ 잔여 월", () => {
    const { remaining } = progress()
    expect(remaining.amount).toBe(1_200_000)
    // 2026-07..2027-03 = 9개월(당월 포함).
    expect(remaining.monthsLeft).toBe(9)
    expect(remaining.monthlyNeeded).toBeCloseTo(1_200_000 / 9, 6)
  })

  it("이미 달성(남은 목표 ≤ 0)이면 월평균 필요액 0, 회계연도 종료 후 조회면 null", () => {
    const done = deriveDshProgress(
      aggregateDshTotals([row("goal", 100_000, monthsOf(100_000 / 12)), row("status", 150_000, monthsOf(150_000 / 12))]),
      NOW,
    )
    expect(done.remaining.amount).toBe(-50_000)
    expect(done.remaining.monthlyNeeded).toBe(0)

    // FY 창(2026-04..2027-03)이 전부 과거인 시점 — 잔여 월 0, 페이스 산정 불가.
    const after = deriveDshProgress(aggregateDshTotals(bandFixture()), new Date(Date.UTC(2028, 0, 15)))
    expect(after.remaining.monthsLeft).toBe(0)
    expect(after.remaining.monthlyNeeded).toBeNull()
    expect(after.currentMonthKey).toBeNull()
  })
})

describe("deriveDshSegments / deriveDshComposition — 구성별 달성·구성비 스코프", () => {
  const totals = (groups: ReturnType<typeof deriveDshSegments>) =>
    groups.map((group) => [group.category, group.goal, group.status])

  it("채택된 콤보를 연간/현재 분기/현재 월 값으로 카테고리별 합산한다", () => {
    expect(totals(deriveDshSegments(bandFixture(), NOW, "Y"))).toEqual([
      ["Software", 1_200_000, 480_000],
      ["Hardware", 600_000, 120_000],
    ])
    // Q2: HW는 실적이 없어도 행을 유지하고 달성률 0%.
    const quarterly = deriveDshSegments(bandFixture(), NOW, "Q")
    expect(totals(quarterly)).toEqual([
      ["Software", 300_000, 280_000],
      ["Hardware", 150_000, 0],
    ])
    expect(quarterly[1].pct).toBe(0)
    expect(totals(deriveDshSegments(bandFixture(), NOW, "M"))).toEqual([
      ["Software", 100_000, 280_000],
      ["Hardware", 50_000, 0],
    ])
  })

  it("월 스코프에서 오늘이 회계월 창 밖이면 값 0·달성률 null — 행 구성은 연간 기준 그대로", () => {
    const monthly = deriveDshSegments(bandFixture(), new Date(Date.UTC(2028, 0, 15)), "M")
    expect(monthly.map((group) => group.category)).toEqual(["Software", "Hardware"])
    expect(monthly.every((group) => group.goal === 0 && group.status === 0 && group.pct === null)).toBe(true)
  })

  it("구성비는 Status 스코프 값 기준 — 채널 공란은 (미구분) 세그먼트로 계상된다", () => {
    expect(deriveDshComposition([], NOW, "Y")).toBeNull()
    const yearly = deriveDshComposition(bandFixture(), NOW, "Y")!
    expect(yearly.swHw).toEqual([
      { label: "SW", value: 480_000 },
      { label: "HW", value: 120_000 },
    ])
    expect(yearly.newRenew).toEqual([
      { label: "New", value: 480_000 },
      { label: "Renew", value: 120_000 },
    ])
    expect(yearly.channel).toEqual([
      { label: "Direct", value: 480_000 },
      { label: "Channel", value: 0 },
      { label: "(미구분)", value: 120_000 },
    ])
    // Q2에는 HW 실적이 없다.
    expect(deriveDshComposition(bandFixture(), NOW, "Q")!.swHw).toEqual([
      { label: "SW", value: 280_000 },
      { label: "HW", value: 0 },
    ])
  })
})

describe("deriveDshMonthlyPace", () => {
  it("빈 breakdown은 null", () => {
    expect(deriveDshMonthlyPace([], NOW)).toBeNull()
  })

  it("월별 목표/실적/Gap/달성률과 누적 러닝 섬을 회계월 순서로 계산한다", () => {
    const pace = deriveDshMonthlyPaceStrict()
    expect(pace.months.map((m) => m.ym)).toEqual(FY_MONTHS)

    const april = pace.months[0]
    expect(april).toMatchObject({ goal: 150_000, status: 200_000, gap: 50_000 })
    expect(april.pct).toBeCloseTo((200_000 / 150_000) * 100, 6)
    expect(april.cumGoal).toBe(150_000)
    expect(april.cumStatus).toBe(200_000)

    // 2026-07(4번째): 누적 목표 600k, 누적 실적 200+60+60+280=600k → 누적 달성률 100%.
    const july = pace.months[3]
    expect(july).toMatchObject({ ym: "2026-07", cumGoal: 600_000, cumStatus: 600_000 })
    expect(july.cumPct).toBeCloseTo(100, 6)
    expect(july.gap).toBe(280_000 - 150_000)

    // 연간 합계는 채택 행 기준(중복 미합산).
    expect(pace.annual).toMatchObject({ goal: 1_800_000, status: 600_000, gap: -1_200_000 })
    expect(pace.annual.pct).toBeCloseTo((600_000 / 1_800_000) * 100, 6)
  })

  it("현재/미래 플래그 — 당월은 isCurrent, 다음 달부터 isFuture(실적 회색 처리 근거)", () => {
    const pace = deriveDshMonthlyPaceStrict()
    const byYm = Object.fromEntries(pace.months.map((m) => [m.ym, m]))
    expect(byYm["2026-07"].isCurrent).toBe(true)
    expect(byYm["2026-07"].isFuture).toBe(false)
    expect(byYm["2026-06"].isFuture).toBe(false)
    expect(byYm["2026-08"].isFuture).toBe(true)
    expect(byYm["2027-03"].isFuture).toBe(true)
  })

  it("목표 0인 달의 달성률은 null(–)이고 누적에는 그대로 이월된다", () => {
    const pace = deriveDshMonthlyPace(
      [
        row("goal", 100_000, { "2026-04": 100_000, "2026-05": 0 }),
        row("status", 30_000, { "2026-04": 20_000, "2026-05": 10_000 }),
      ],
      NOW,
    )!
    const may = pace.months.find((m) => m.ym === "2026-05")!
    expect(may.pct).toBeNull()
    expect(may.cumGoal).toBe(100_000)
    expect(may.cumStatus).toBe(30_000)
    expect(may.cumPct).toBeCloseTo(30, 6)
  })

  function deriveDshMonthlyPaceStrict() {
    const pace = deriveDshMonthlyPace(bandFixture(), NOW)
    if (!pace) throw new Error("fixture pace must not be null")
    return pace
  }
})

describe("deriveDshWeeklyFromDealMix", () => {
  function slice(name: string, week: number | null, prevWeek: number | null) {
    return { name, goal: 0, actual: 0, pct: 0, week_actual: week, prev_week_actual: prevWeek }
  }
  function mix(): BranchDealMix {
    return {
      by_category: [slice("Software", 30_000, 10_000), slice("Hardware", 70_000, 40_000)],
      by_status_type: [slice("New", 60_000, 20_000), slice("Renew", 40_000, 30_000)],
      by_channel: [slice("Direct", 55_000, 25_000), slice("Channel", 20_000, 0)],
    }
  }

  it("주간 총액은 category 축 합(전 딜 귀속) — 구성비·전주도 함께 파생한다", () => {
    const weekly = deriveDshWeeklyFromDealMix(mix())
    if (!weekly) throw new Error("fixture weekly must not be null")
    expect(weekly.total.actual).toBe(100_000)
    expect(weekly.total.prevActual).toBe(50_000)
    expect(weekly.software.share).toBeCloseTo(30, 6)
    expect(weekly.hardware.share).toBeCloseTo(70, 6)
    // 채널 축은 미매핑 딜이 빠져 총액(100k)보다 작을 수 있다 — 있는 그대로 노출.
    expect(weekly.direct.actual).toBe(55_000)
    expect(weekly.channel.actual).toBe(20_000)
    expect(weekly.composition.newRenew.map((s) => s.value)).toEqual([60_000, 40_000])
  })

  it("weekly_available=false(메타)면 null — 주간 뷰를 접는다", () => {
    const meta = { prev_period_label: "전월", prev_period_available: false, weekly_available: false }
    const unavailable: BranchDealMix = {
      ...mix(),
      meta: { by_category: meta, by_status_type: meta, by_channel: meta, by_segment: meta },
    }
    expect(deriveDshWeeklyFromDealMix(unavailable)).toBeNull()
  })

  it("deal_mix 자체가 없거나 주간 금액이 전부 0/null이면 null", () => {
    expect(deriveDshWeeklyFromDealMix(null)).toBeNull()
    const empty: BranchDealMix = {
      by_category: [slice("Software", null, null), slice("Hardware", null, null)],
      by_status_type: [],
      by_channel: [],
    }
    expect(deriveDshWeeklyFromDealMix(empty)).toBeNull()
  })
})
