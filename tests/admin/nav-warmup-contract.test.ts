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
})
