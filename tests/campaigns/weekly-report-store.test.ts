import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WeeklyAdLeadReport } from "@/lib/marketing/weekly-report"

const mocks = vi.hoisted(() => ({
  assembleWeeklyAdLeadReport: vi.fn(),
  findInsightByDigest: vi.fn(),
  insertInsight: vi.fn(),
}))

vi.mock("@/lib/marketing/weekly-report-builder", () => ({
  assembleWeeklyAdLeadReport: mocks.assembleWeeklyAdLeadReport,
}))
vi.mock("@/lib/repositories/marketing-insights", () => ({
  findInsightByDigest: mocks.findInsightByDigest,
  insertInsight: mocks.insertInsight,
}))

import { persistWeeklyAdLeadReport } from "@/lib/marketing/weekly-report-store"

function report(): WeeklyAdLeadReport {
  return {
    version: 2,
    title: "마케팅 광고 리드 주간 보고서",
    generatedAt: "2026-08-24T00:00:00.000Z",
    snapshotAt: null,
    metaDataThrough: null,
    dataStatus: "provisional",
    summary: "광고 리드 0건입니다.",
    period: {
      since: "2026-08-17",
      until: "2026-08-23",
      prevSince: "2026-08-10",
      prevUntil: "2026-08-16",
    },
    kpis: {
      spendUsd: {
        value: null,
        previous: null,
        deltaPct: null,
        currency: "USD",
      },
      adLeads: { value: 0, previous: 0, deltaPct: null },
      cplUsd: { value: null, previous: null, deltaPct: null, currency: "USD" },
      conversionRate: { value: null, previous: null, deltaPct: null },
    },
    funnel: {
      impressions: 0,
      clicks: 0,
      ctrPct: null,
      adLeads: 0,
      contacted: 0,
      contactRatePct: null,
      convertedLeads: 0,
    },
    dailyLeads: [],
    weekendLeads: 0,
    weekendSharePct: null,
    uncontactedLeads: 0,
    campaigns: [],
    actions: ["연결 점검"],
    dataCaveats: ["미측정"],
    markdown: "# 보고서",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assembleWeeklyAdLeadReport.mockResolvedValue(report())
  mocks.findInsightByDigest.mockResolvedValue(null)
  mocks.insertInsight.mockResolvedValue({ id: "saved" })
})

describe("persistWeeklyAdLeadReport", () => {
  it("완료 주간을 별도 weekly_report 스코프로 저장한다", async () => {
    const result = await persistWeeklyAdLeadReport()

    expect(result).toMatchObject({ from: "fresh", report: { version: 2 } })
    expect(mocks.findInsightByDigest).toHaveBeenCalledWith(
      "weekly_report",
      "weekly-ad-lead-report:v2:2026-08-17:2026-08-23",
      192,
    )
    expect(mocks.insertInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "weekly_report",
        model: null,
        payload: {
          weekly_report: expect.objectContaining({ markdown: "# 보고서" }),
        },
      }),
    )
  })

  it("같은 완료 주간 저장본이 있으면 중복 insert 없이 재사용한다", async () => {
    mocks.findInsightByDigest.mockResolvedValue({
      payload: { weekly_report: report() },
    })

    const result = await persistWeeklyAdLeadReport()

    expect(result.from).toBe("cache")
    expect(mocks.insertInsight).not.toHaveBeenCalled()
  })

  it("집계 실패는 throw 대신 error 결과로 격리해 AI 크론 응답을 살린다", async () => {
    mocks.assembleWeeklyAdLeadReport.mockRejectedValue(new Error("source failed"))

    await expect(persistWeeklyAdLeadReport()).resolves.toEqual({
      from: "error",
      error: "source failed",
    })
  })
})
