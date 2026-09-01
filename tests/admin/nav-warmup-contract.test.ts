import { describe, expect, it } from "vitest"

import { NAV_WARMUP_REQUESTS } from "@/components/admin/AdminSidebar"
import {
  buildAdminCalendarUrl,
  getAdminCalendarWeekStripRange,
  getDefaultAdminCalendarRange,
} from "@/lib/admin/calendar-range"

function warmupEntries(href: string) {
  const entry = NAV_WARMUP_REQUESTS[href]
  return typeof entry === "function" ? entry() : (entry ?? [])
}

/** 항목은 문자열이거나 {url, cacheKey}다 — URL만 비교할 때 쓴다. */
function warmupUrls(href: string) {
  return warmupEntries(href).map((entry) => (typeof entry === "string" ? entry : entry.url))
}

/** 캐시 키까지 맞아야 적중하는 항목의 대조용. */
function warmupCacheKeys(href: string) {
  return warmupEntries(href).flatMap((entry) => (typeof entry === "string" ? [] : [entry.cacheKey]))
}

describe("admin nav warm-up cache-key parity", () => {
  it("warms the compact Overview lead contract used by the page", () => {
    expect(warmupUrls("/admin/overview")).toContain("/api/admin/leads?scope=overview")
    expect(warmupUrls("/admin/overview")).not.toContain("/api/admin/leads?scope=dashboard")
  })

  it("warms the compact Overview blog contract without replacing the Blog page cache key", () => {
    expect(warmupUrls("/admin/overview")).toContain("/api/admin/blog?scope=overview")
    expect(warmupUrls("/admin/overview")).not.toContain("/api/admin/blog")
    expect(warmupUrls("/admin/blog")).toContain("/api/admin/blog")
  })

  it("warms the exact default matching page query", () => {
    expect(warmupUrls("/admin/crm/matching")).toContain(
      "/api/admin/crm/matching?source=all&status=review&limit=25&offset=0"
    )
    expect(warmupUrls("/admin/crm/matching")).not.toContain("/api/admin/crm/matching")
  })

  it("warms the exact first unified-customer page instead of a different page size", () => {
    expect(warmupUrls("/admin/crm/customers/unified")).toContain(
      "/api/admin/crm/customers/unified?limit=50&offset=0"
    )
    expect(warmupUrls("/admin/crm/customers/unified")).not.toContain(
      "/api/admin/crm/customers/unified?limit=100&offset=0"
    )
  })

  it("warms the KR Team overview projection the dashboard actually requests", () => {
    // &view=overview 가 빠지면 미스일 뿐 아니라 서버가 전체 타임라인을 다시 조립한다.
    expect(warmupUrls("/admin/branch")).toContain(
      "/api/admin/branch/summary?team=ALL&period=Q&view=overview"
    )
    expect(warmupUrls("/admin/branch")).not.toContain("/api/admin/branch/summary?team=ALL&period=Q")
  })

  it("warms the activity feed with the default work scope", () => {
    expect(warmupUrls("/admin/crm/activity")).toContain(
      "/api/admin/crm/events?limit=50&offset=0&scope=work"
    )
    expect(warmupUrls("/admin/crm/activity")).not.toContain("/api/admin/crm/events?limit=50&offset=0")
  })

  it("warms the campaigns default (summary) tab with matching cache keys, not other tabs' data", () => {
    expect(warmupCacheKeys("/admin/campaigns")).toEqual(
      expect.arrayContaining([
        "marketing-perf:30d",
        "marketing-insights",
        "marketing-intake-today",
        "compass-ads:30d",
      ])
    )
    // 광고·메시지·행사 탭 전용 — 기본 진입에서는 호출되지 않는다.
    for (const dead of [
      "/api/admin/email",
      "/api/admin/subscribers",
      "/api/admin/leads?scope=campaigns",
      "/api/admin/events",
      "/api/admin/event-metrics",
      "/api/admin/messaging/status",
    ]) {
      expect(warmupUrls("/admin/campaigns")).not.toContain(dead)
    }
  })

  it("warms the calendar first screen including the week strip and source health", () => {
    // 페이지와 같은 SSOT 함수로 만든 URL과 **문자 그대로** 같아야 적중한다 — 이 화면의
    // 실패 모드는 오직 문자열 불일치다(월 격자와 주간 스트립은 범위가 달라 별도 키).
    const monthUrl = buildAdminCalendarUrl(getDefaultAdminCalendarRange())
    const weekUrl = buildAdminCalendarUrl(getAdminCalendarWeekStripRange())
    expect(monthUrl).not.toEqual(weekUrl)
    expect(warmupUrls("/admin/calendar")).toEqual(
      expect.arrayContaining([monthUrl, weekUrl, "/api/admin/crm/action-kpis"])
    )
    expect(warmupCacheKeys("/admin/calendar")).toContain("calendar:source-health")
  })

  it("warms the CRM home panels the server prefetch does not cover", () => {
    expect(warmupUrls("/admin/crm")).toContain(
      "/api/admin/crm/home/priority-queue?limit=50&source=customer&v=3"
    )
    // NEO 집계는 기본 접힌 아코디언의 비활성 탭 전용 — 비싼 축이라 데우지 않는다.
    expect(warmupUrls("/admin/crm").some((url) => url.startsWith("/api/admin/crm/neo"))).toBe(false)
  })

  it("keys internal CS by the tab hrefs the console nav actually links to", () => {
    // 콘솔 메뉴 href 는 전부 ?tab= 을 달고 있다 — bare 키만 있으면 어느 링크도 조회하지 못한다.
    for (const href of [
      "/admin/cs-chatbot?tab=chat",
      "/admin/cs-chatbot?tab=queue",
      "/admin/cs-chatbot?tab=hq",
      "/admin/cs-chatbot?tab=tools",
    ]) {
      expect(warmupUrls(href)).toContain("/api/admin/cs-chat/conversations?status=all&limit=100")
    }
  })
})
