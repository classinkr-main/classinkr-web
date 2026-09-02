import { describe, expect, it } from "vitest"

import { NAV_WARMUP_REQUESTS } from "@/components/admin/AdminSidebar"

function warmupUrls(href: string) {
  const entry = NAV_WARMUP_REQUESTS[href]
  return typeof entry === "function" ? entry() : (entry ?? [])
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

  // 캠페인 기본 진입 탭은 요약(SummaryTab.tsx)이고, 그 탭이 마운트 즉시 부르는 URL은
  // usePerf/useInsights의 perf(기본 기간 30d)·insights 단둘뿐이다(events/meta/email/leads
  // 탭 전용 코어 로드는 activeTab 게이트 뒤에 있어 요약 진입에서는 호출되지 않는다) — 이 값이
  // 바뀌면 예열이 조용히 안 쓰이는 탭만 데우게 된다.
  it("warms exactly the Summary tab's default-entry endpoints, not the other campaign tabs' core load", () => {
    const urls = warmupUrls("/admin/campaigns")
    expect(urls).toContain("/api/admin/marketing/perf?period=30d")
    expect(urls).toContain("/api/admin/marketing/insights")
    // 다른 탭 전용(events/meta/email/leads 코어 로드) 키는 요약 탭에서 안 쓰이므로 없어야 한다.
    expect(urls).not.toContain("/api/admin/events")
    expect(urls).not.toContain("/api/admin/event-metrics")
    expect(urls).not.toContain("/api/admin/messaging/status")
    expect(urls.some((url) => url.startsWith("/api/admin/meta/campaigns"))).toBe(false)
  })

  // BranchDashboardClient의 기본 탭(overview)은 summaryUrl에 &view=overview 프로젝션을 덧붙인다
  // (activeTab === "overview" 게이트) — 그 쿼리 없이 예열하면 캐시 키가 갈라져 첫 진입이 항상
  // 콜드 페치로 떨어진다. /admin/branch/ledger는 SalesLedgerWorkbench가 이 프로젝션을 쓰지
  // 않으므로(다른 화면) view=overview가 없는 쪽이 오히려 맞다 — 그 항목은 건드리지 않는다.
  it("warms the branch dashboard's default overview projection, not the bare summary query", () => {
    const urls = warmupUrls("/admin/branch")
    expect(urls).toContain("/api/admin/branch/summary?team=ALL&period=Q&view=overview")
    expect(urls).not.toContain("/api/admin/branch/summary?team=ALL&period=Q")
  })
})
