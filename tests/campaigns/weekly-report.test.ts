import { describe, expect, it } from "vitest"
import type { MarketingPerfResponse, PerfKpi, PerfScoreboardRow } from "@/lib/marketing/perf"
import {
  buildWeeklyAdLeadReport,
  isWeeklyAdLeadReport,
  resolveLastCompletedMarketingWeek,
} from "@/lib/marketing/weekly-report"

const kpi = (
  value: number | null,
  previous: number | null,
  deltaPct: number | null,
  currency?: "USD" | "KRW",
): PerfKpi => ({
  value,
  previous,
  deltaPct,
  ...(currency ? { currency } : {}),
})

const campaign = (
  over: Partial<PerfScoreboardRow> & { campaignId: string; name: string },
): PerfScoreboardRow => ({
  status: "active",
  pacing: { elapsedPct: 100, executionPct: null },
  pacingCurrency: null,
  leads: 0,
  channels: [],
  channelSpend: [],
  spendUsd: null,
  cpl: null,
  sparkline: [],
  latestUpdate: null,
  anomalies: [],
  ...over,
})

function makePerf(overrides: Partial<MarketingPerfResponse> = {}): MarketingPerfResponse {
  return {
    period: {
      key: "7d",
      since: "2026-08-10",
      until: "2026-08-16",
      prevSince: "2026-08-03",
      prevUntil: "2026-08-09",
      // 롤링 창(7d)은 직전 동일 길이 비교 — resolvePerfPeriod 의 기본 기준.
      prevBasis: "trailing",
    },
    snapshotAt: "2026-08-17T00:10:00.000Z",
    metaDataThrough: "2026-08-16",
    kpis: {
      spendUsd: kpi(210, 140, 50, "USD"),
      leads: kpi(18, 14, 29),
      adLeads: kpi(10, 8, 25),
      cplUsd: kpi(21, 17.5, 20, "USD"),
      leadConversionRate: kpi(20, 12.5, 60),
      budgetExecutionPct: kpi(null, null, null, "KRW"),
    },
    daily: [],
    scoreboard: [
      campaign({
        campaignId: "b",
        name: "리타겟팅",
        leads: 4,
        spendUsd: 90,
        cpl: 22.5,
      }),
      campaign({
        campaignId: "a",
        name: "신규 원장 | 리드젠",
        leads: 6,
        spendUsd: 120,
        cpl: 20,
        anomalies: ["cpl_spike"],
      }),
      campaign({ campaignId: "empty", name: "미집행", leads: 0, spendUsd: 0 }),
    ],
    funnel: {
      impressions: 10_000,
      clicks: 200,
      adLeads: 10,
      contacted: 6,
      convertedLeads: 2,
    },
    leadDailyBySource: [
      { date: "2026-08-10", meta: 1 },
      { date: "2026-08-11", meta: 2 },
      { date: "2026-08-15", meta: 3 },
      { date: "2026-08-16", meta: 4 },
    ],
    channelMix: [],
    channelLive: [],
    attributionFunnel: { stages: [], byChannel: [], endToEndPct: null },
    updatesFeed: [],
    ...overrides,
  }
}

describe("resolveLastCompletedMarketingWeek", () => {
  it("월요일에는 바로 전 월~일과 그 직전 주를 반환한다", () => {
    expect(resolveLastCompletedMarketingWeek("2026-08-24")).toEqual({
      since: "2026-08-17",
      until: "2026-08-23",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-16",
    })
  })

  it("일요일 당일은 아직 완료되지 않은 주로 보아 한 주 전 일요일을 끝점으로 삼는다", () => {
    expect(resolveLastCompletedMarketingWeek("2026-08-23")).toEqual({
      since: "2026-08-10",
      until: "2026-08-16",
      prevSince: "2026-08-03",
      prevUntil: "2026-08-09",
    })
  })

  it("연도 경계를 ISO 날짜 산술로 안전하게 넘는다", () => {
    expect(resolveLastCompletedMarketingWeek("2027-01-01")).toEqual({
      since: "2026-12-21",
      until: "2026-12-27",
      prevSince: "2026-12-14",
      prevUntil: "2026-12-20",
    })
  })
})

describe("buildWeeklyAdLeadReport", () => {
  it("CRM 광고 리드·Meta 성과를 구분해 정렬된 캠페인과 공유용 Markdown을 만든다", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-08-17T00:30:00.000Z",
    })

    expect(report.kpis.adLeads).toMatchObject({
      value: 10,
      previous: 8,
      deltaPct: 25,
    })
    expect(report.version).toBe(3)
    expect(report.dataStatus).toBe("confirmed")
    expect(report.dailyLeads).toHaveLength(7)
    expect(report.dailyLeads.map((point) => point.leads)).toEqual([1, 2, 0, 0, 0, 3, 4])
    expect(report.weekendLeads).toBe(7)
    expect(report.weekendSharePct).toBe(70)
    expect(report.uncontactedLeads).toBe(4)
    expect(report.summary).toContain("주말 리드는 7건")
    expect(report.funnel).toMatchObject({ ctrPct: 2, contactRatePct: 60 })
    expect(report.campaigns.map((row) => row.campaignId)).toEqual(["a", "b"])
    expect(report.actions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("CPL이 직전 주보다 20% 상승"),
        expect.stringContaining("미접촉 광고 리드 4건"),
      ]),
    )
    expect(report.markdown).toContain("# 마케팅 광고 리드 주간 보고서")
    expect(report.markdown).toContain("- 데이터 상태: 확정")
    expect(report.markdown).toContain("## 요일별 광고 리드")
    expect(report.markdown).toContain("| 광고 리드 (CRM) | 10건 | 8건 | 직전 주 대비 +25% |")
    expect(report.markdown).toContain("신규 원장 \\| 리드젠")
    expect(isWeeklyAdLeadReport(report)).toBe(true)
  })

  it("소스 실패를 0으로 포장하지 않고 미측정·데이터 한계로 밝힌다", () => {
    const perf = makePerf({
      snapshotAt: null,
      metaDataThrough: null,
      kpis: {
        ...makePerf().kpis,
        spendUsd: kpi(null, null, null, "USD"),
        adLeads: kpi(null, null, null),
        cplUsd: kpi(null, null, null, "USD"),
        leadConversionRate: kpi(null, null, null),
      },
      scoreboard: [],
      funnel: {
        impressions: 0,
        clicks: 0,
        adLeads: 0,
        contacted: 0,
        convertedLeads: 0,
      },
    })
    const report = buildWeeklyAdLeadReport(perf, {
      generatedAt: "2026-08-17T00:30:00.000Z",
    })

    expect(report.markdown).toContain("| Meta 광고비 (USD) | 미측정 | 미측정 |")
    expect(report.markdown).toContain("| 광고 리드 (CRM) | 미측정 | 미측정 |")
    expect(report.dataStatus).toBe("provisional")
    expect(report.dailyLeads).toEqual([])
    expect(report.dataCaveats).toEqual(
      expect.arrayContaining([
        expect.stringContaining("광고비·CPL 일부가 미측정"),
        expect.stringContaining("CRM 리드 조회에 실패"),
      ]),
    )
    expect(report.actions[0]).toContain("보고서를 확정")
  })

  it("Meta 일별 데이터가 보고 종료일까지 없으면 잠정 보고서로 표시한다", () => {
    const report = buildWeeklyAdLeadReport(makePerf({ metaDataThrough: "2026-08-15" }), {
      generatedAt: "2026-08-17T00:30:00.000Z",
    })

    expect(report.dataStatus).toBe("provisional")
    expect(report.actions).toHaveLength(3)
    expect(report.actions).toEqual(
      expect.arrayContaining([expect.stringContaining("보고서를 확정")]),
    )
    expect(report.dataCaveats).toEqual(
      expect.arrayContaining([expect.stringContaining("잠정 수치")]),
    )
  })
})

describe("마지막 일일 보고 이후 유입", () => {
  const intake = {
    since: "2026-09-04T01:10:00.000Z",
    until: "2026-09-07T00:20:00.000Z",
    label: "09.04 10:10 - 09.07 09:20",
    spansWeekend: true,
    totalLeads: 7,
    metaLeadAdsLeadCount: 5,
    homepageLeadCount: 2,
    unrespondedCount: 6,
  }

  it("주말을 품은 구간은 '주말 유입'으로 제목을 달고 숫자를 편다", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-07T00:20:00.000Z",
      recentIntake: intake,
    })

    expect(report.version).toBe(3)
    expect(report.recentIntake).toEqual(intake)
    expect(report.markdown).toContain("## 주말 유입 (마지막 일일 보고 이후)")
    expect(report.markdown).toContain("- 구간: 09.04 10:10 - 09.07 09:20 (KST)")
    expect(report.markdown).toContain("- 전체 접수: 7건 — Meta 광고 5건 / 홈페이지 2건")
    expect(report.markdown).toContain("- 미응대: 6건")
  })

  it("재문의(재유입)가 섞이면 전체 접수를 신규/재유입으로 가른다 — 없으면 예전 문구 그대로", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-07T00:20:00.000Z",
      recentIntake: { ...intake, newLeadCount: 5, reinflowLeadCount: 2 },
    })
    expect(report.markdown).toContain(
      "- 전체 접수: 7건 (신규 5건 · 재유입 2건) — Meta 광고 5건 / 홈페이지 2건"
    )

    const noReinflow = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-07T00:20:00.000Z",
      recentIntake: { ...intake, newLeadCount: 7, reinflowLeadCount: 0 },
    })
    expect(noReinflow.markdown).toContain("- 전체 접수: 7건 — Meta 광고 5건 / 홈페이지 2건")
  })

  it("평일 구간이면 주말이라고 부르지 않는다", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-09T09:00:00.000Z",
      recentIntake: { ...intake, spansWeekend: false },
    })

    expect(report.markdown).toContain("## 마지막 일일 보고 이후 유입")
    expect(report.markdown).not.toContain("## 주말 유입")
  })

  it("리드 조회가 실패하면 주간 수치는 살리고 이 구간만 미측정으로 남긴다", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-07T00:20:00.000Z",
      recentIntake: null,
    })

    expect(report.recentIntake).toBeNull()
    expect(report.kpis.adLeads.value).not.toBeNull()
    expect(report.markdown).toContain("- 리드 조회에 실패해 이 구간은 미측정입니다.")
    expect(report.dataCaveats).toContain(
      "리드 조회에 실패해 마지막 일일 보고 이후 유입은 미측정입니다."
    )
  })

  it("옛 v2 저장본은 계약 가드를 통과하지 못한다 — 새 구간이 빠져 있으므로", () => {
    const report = buildWeeklyAdLeadReport(makePerf(), {
      generatedAt: "2026-09-07T00:20:00.000Z",
      recentIntake: intake,
    })

    expect(isWeeklyAdLeadReport(report)).toBe(true)
    expect(isWeeklyAdLeadReport({ ...report, version: 2 })).toBe(false)
  })
})
