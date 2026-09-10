import { describe, expect, it } from "vitest"

import { resolveCrmRouteLabel } from "@/components/admin/crm-route-labels"

describe("CRM mobile route labels", () => {
  it.each([
    ["/admin/crm/customers/unified", "통합 고객"],
    ["/admin/crm/customers/customer-1", "고객 360"],
    ["/admin/crm/customers/leads", "리드"],
    ["/admin/crm/customers/accounts", "원천 고객"],
    ["/admin/crm/customers/map", "지도"],
    ["/admin/crm/deals", "매출"],
    ["/admin/crm/deals/rev-sheet", "REV 스냅샷"],
    ["/admin/crm/deals/orders", "오더·설치"],
    ["/admin/crm/deals/kpi/partner-1", "워크스페이스"],
    ["/admin/crm/matching", "데이터 매칭"],
    ["/admin/crm/insights", "인사이트"],
  ])("labels %s as %s", (pathname, label) => {
    expect(resolveCrmRouteLabel(pathname)).toBe(label)
  })

  it("leaves the CRM root to the global navigation label", () => {
    expect(resolveCrmRouteLabel("/admin/crm")).toBeNull()
  })

  it("does not match a path with only the same string prefix", () => {
    expect(resolveCrmRouteLabel("/admin/crm/deals-old")).toBeNull()
  })
})
