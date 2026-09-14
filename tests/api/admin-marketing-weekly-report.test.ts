import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { WeeklyAdLeadReport } from "@/lib/marketing/weekly-report"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  getLatestInsight: vi.fn(),
  assembleWeeklyAdLeadReport: vi.fn(),
  kstToday: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/marketing-insights", () => ({
  getLatestInsight: mocks.getLatestInsight,
}))
vi.mock("@/lib/marketing/weekly-report-builder", () => ({
  assembleWeeklyAdLeadReport: mocks.assembleWeeklyAdLeadReport,
}))
vi.mock("@/lib/marketing/perf-assemble", () => ({ kstToday: mocks.kstToday }))
// admin-performance-round3-2026-09-10.md §3.2 — "live" 경로가 route-local Map 대신
// unstable_cache를 쓰므로, 다른 unstable_cache 배선 회귀 가드(compass-ads 등)와 동일하게
// next/cache를 통과 함수로 목킹한다(실제 Data Cache는 Next 서버 런타임 밖인 vitest에서
// 동작을 보장하지 않는다).
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: mocks.revalidateTag,
}))

import { GET } from "@/app/api/admin/marketing/weekly-report/route"

function report(until = "2026-08-23"): WeeklyAdLeadReport {
  return {
    version: 3,
    title: "마케팅 광고 리드 주간 보고서",
    generatedAt: "2026-08-24T00:00:00.000Z",
    snapshotAt: "2026-08-23T21:00:00.000Z",
    metaDataThrough: until,
    dataStatus: "confirmed",
    summary: "광고 리드 10건입니다.",
    period: {
      since: "2026-08-17",
      until,
      prevSince: "2026-08-10",
      prevUntil: "2026-08-16",
    },
    kpis: {
      spendUsd: { value: 100, previous: 90, deltaPct: 11, currency: "USD" },
      adLeads: { value: 10, previous: 8, deltaPct: 25 },
      cplUsd: { value: 10, previous: 11.25, deltaPct: -11, currency: "USD" },
      conversionRate: { value: 20, previous: 12.5, deltaPct: 60 },
    },
    funnel: {
      impressions: 1000,
      clicks: 50,
      ctrPct: 5,
      adLeads: 10,
      contacted: 9,
      contactRatePct: 90,
      convertedLeads: 2,
    },
    dailyLeads: [],
    weekendLeads: 0,
    weekendSharePct: 0,
    uncontactedLeads: 1,
    recentIntake: null,
    campaigns: [],
    actions: ["다음 주 실행"],
    dataCaveats: ["USD 네이티브"],
    markdown: "# 보고서",
  }
}

const request = (query = "") =>
  new NextRequest(`http://localhost/api/admin/marketing/weekly-report${query}`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyAdmin.mockResolvedValue(undefined)
  mocks.kstToday.mockReturnValue("2026-08-24")
  mocks.assembleWeeklyAdLeadReport.mockResolvedValue(report())
  mocks.getLatestInsight.mockResolvedValue(null)
})

describe("GET /api/admin/marketing/weekly-report", () => {
  it("이번 완료 주간의 자동 저장본이 있으면 원천 재집계 없이 반환한다", async () => {
    mocks.getLatestInsight.mockResolvedValue({
      payload: { weekly_report: report() },
    })

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.source).toBe("stored")
    expect(body.report.period.until).toBe("2026-08-23")
    expect(mocks.getLatestInsight).toHaveBeenCalledWith("weekly_report")
    expect(mocks.assembleWeeklyAdLeadReport).not.toHaveBeenCalled()
  })

  it("저장본이 지난 주 것이면 최신 완료 주간을 원천 데이터에서 만든다", async () => {
    mocks.getLatestInsight.mockResolvedValue({
      payload: { weekly_report: report("2026-08-16") },
    })

    const body = await (await GET(request())).json()

    expect(body.source).toBe("live")
    expect(mocks.assembleWeeklyAdLeadReport).toHaveBeenCalledOnce()
    // fresh=1이 아니므로 캐시 태그를 건드리지 않는다(자연 미스로 재계산했을 뿐).
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })

  it("fresh=1은 저장본을 건너뛰고 즉시 재생성한다", async () => {
    mocks.getLatestInsight.mockResolvedValue({
      payload: { weekly_report: report() },
    })

    const body = await (await GET(request("?fresh=1"))).json()

    expect(body.source).toBe("live")
    expect(mocks.getLatestInsight).not.toHaveBeenCalled()
    expect(mocks.assembleWeeklyAdLeadReport).toHaveBeenCalledOnce()
    // admin-performance-round3-2026-09-10.md §3.2 — live 캐시 태그를 {expire:0}으로
    // 하드 만료시킨 뒤 재계산한다(perf 라우트와 동일 패턴).
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    const [tag, profile] = mocks.revalidateTag.mock.calls[0]
    expect(typeof tag).toBe("string")
    expect(profile).toEqual({ expire: 0 })
  })

  it("관리자 인증 실패 응답을 그대로 반환한다", async () => {
    mocks.verifyAdmin.mockResolvedValue(NextResponse.json({ error: "forbidden" }, { status: 403 }))

    const response = await GET(request())

    expect(response.status).toBe(403)
    expect(mocks.getLatestInsight).not.toHaveBeenCalled()
  })
})
