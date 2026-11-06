import { describe, expect, it } from "vitest"

import { buildOverviewLeadSummary } from "@/lib/admin/overview/lead-summary"
import { aggregateLeads, resolveUnrespondedSignal } from "@/lib/admin/overview/insights"
import type { LeadRecord } from "@/lib/site-settings-types"

const NOW = new Date(2026, 7, 27, 12, 0, 0)

function localIso(daysAgo: number, hour = 10) {
  const date = new Date(NOW)
  date.setDate(date.getDate() - daysAgo)
  date.setHours(hour, 0, 0, 0)
  return date.toISOString()
}

function lead(index: number, overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: `lead-${index}`,
    source: "contact_page",
    name: `리드 ${index}`,
    org: `학원 ${index}`,
    email: `lead-${index}@example.com`,
    timestamp: localIso(index),
    status: "new",
    confirmed_at: localIso(index),
    ...overrides,
  }
}

describe("buildOverviewLeadSummary", () => {
  it("uses aggregateLeads as the exact KPI/source/recent SSOT", () => {
    const leads = [
      lead(0, { branch: "서울", source: "contact_page" }),
      lead(1, { branch: "서울", source: "demo_modal", status: "contacted" }),
      lead(2, { branch: "부산", source: "demo_modal", status: "converted" }),
      lead(3, { status: "closed", confirmed_at: undefined }),
      lead(8, { source: "newsletter" }),
      lead(15, { source: "kakao_ch" }),
      lead(35, { source: "contact_page" }),
    ]
    const expected = aggregateLeads(leads, NOW)
    const expectedUnresponded = resolveUnrespondedSignal(null, leads, NOW)!
    const summary = buildOverviewLeadSummary(leads, NOW)

    expect(summary.metrics).toEqual({
      total: expected.total,
      newLeads: expected.newLeads,
      contactedLeads: expected.contactedLeads,
      converted: expected.converted,
      closedLeads: expected.closedLeads,
      activePipelineLeads: expected.activePipelineLeads,
      convRate: expected.convRate,
      todayLeads: expected.todayLeads,
      thisWeekLeads: expected.thisWeekLeads,
      weekTrend: expected.weekTrend,
      thisMonthLeads: expected.thisMonthLeads,
      monthTrend: expected.monthTrend,
      convertedThisMonth: expected.convertedThisMonth,
      convertedTrend: expected.convertedTrend,
      homepageToday: expected.homepageToday,
      homepageThisWeek: expected.homepageThisWeek,
      homepageTotal: expected.homepageTotal,
      homepageUnconfirmed: expected.homepageUnconfirmed,
      unrespondedCount: expectedUnresponded.unrespondedCount,
      unresponded24hCount: expectedUnresponded.unresponded24hCount,
      // lead(0)·lead(1)은 확인됨, lead(3)은 종료라 응대 전이 아니다 — 응대 전이면서 미확인인 리드는 없다.
      unrespondedUnconfirmedCount: 0,
      topBranch: expected.topBranch,
    })
    // 담당 범위를 주지 않으면 전사 묶음이 같은 값이다.
    expect(summary.company.metrics).toEqual(summary.metrics)
    expect(summary.sources).toEqual(expected.pieData)
    expect(summary.recentLeads.map((item) => item.id)).toEqual(
      expected.recentLeads.map((item) => item.id)
    )
    expect(summary.recentLeads).toHaveLength(6)
  })

  it("preserves the action-kpis outage fallback without sending full leads", () => {
    const leads = [
      lead(0, { source: "contact_page", status: "new" }),
      lead(2, { source: "demo_modal", status: "new" }),
      lead(2, { id: "newsletter-new", source: "newsletter", status: "new" }),
      lead(2, { id: "already-contacted", source: "contact_page", status: "contacted" }),
    ]
    const summary = buildOverviewLeadSummary(leads, NOW)

    expect(summary.metrics.unrespondedCount).toBe(2)
    expect(summary.metrics.unresponded24hCount).toBe(1)
  })

  it("scopes the owner view and keeps an all-owner company block from the same snapshot", () => {
    const leads = [
      lead(0, { id: "mine", assigned_to: "Somang", status: "contacted" }),
      lead(0, { id: "unseen-1", confirmed_at: undefined }),
      lead(2, { id: "unseen-2", source: "demo_modal", confirmed_at: undefined }),
      lead(1, { id: "seen-new" }),
      lead(1, { id: "newsletter", source: "newsletter", confirmed_at: undefined }),
    ]
    const summary = buildOverviewLeadSummary(leads, NOW, ["Somang"])

    expect(summary.metrics.total).toBe(1)
    expect(summary.metrics.unrespondedCount).toBe(0)
    expect(summary.company.metrics.total).toBe(5)
    // 응대 전 = 신규 · 응대 대상 소스(뉴스레터 제외) — 확인 여부와 무관
    expect(summary.company.metrics.unrespondedCount).toBe(3)
    // 그중 아직 아무도 확인하지 않은 건
    expect(summary.company.metrics.unrespondedUnconfirmedCount).toBe(2)
    expect(summary.company.recentLeads.map((item) => item.id)).toContain("unseen-1")
  })

  it("returns chart-compatible 7/30 day buckets with the same dayCount keys", () => {
    const leads = [lead(0), lead(0, { id: "today-2" }), lead(6), lead(7), lead(29), lead(30)]
    const expected = aggregateLeads(leads, NOW)
    const summary = buildOverviewLeadSummary(leads, NOW)

    expect(summary.trends.days30).toHaveLength(30)
    expect(summary.trends.days7).toEqual(summary.trends.days30.slice(-7))
    expect(summary.trends.days30[0]).toMatchObject({ count: 1 })
    expect(summary.trends.days30.at(-1)).toMatchObject({ count: 2 })

    for (const point of summary.trends.days30) {
      const [year, month, day] = point.date.split("-").map(Number)
      const localDate = new Date(year, month - 1, day)
      expect(point.count).toBe(expected.dayCount[localDate.toDateString()] ?? 0)
      expect(point.label).toBe(`${month}/${day}`)
    }
  })

  it("shrinks a large dashboard response to fixed-size browser data", () => {
    const leads = Array.from({ length: 5_000 }, (_, index) =>
      lead(index % 40, {
        id: `lead-${index}`,
        name: `리드 ${index}`,
        org: `아주 긴 학원 이름 ${index}`,
        email: `lead-${index}@example.com`,
        branch: index % 2 === 0 ? "서울" : "부산",
      })
    )
    const legacyBytes = JSON.stringify({ leads }).length
    const overviewBytes = JSON.stringify({ overview: buildOverviewLeadSummary(leads, NOW) }).length

    expect(overviewBytes).toBeLessThan(legacyBytes * 0.05)
    expect(buildOverviewLeadSummary(leads, NOW).recentLeads).toHaveLength(6)
  })
})
