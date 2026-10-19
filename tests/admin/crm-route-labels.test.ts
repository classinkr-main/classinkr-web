import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { CRM_CUSTOMERS_CHILD_NAV } from "@/components/admin/admin-nav"
import { resolveCrmRouteLabel } from "@/components/admin/crm-route-labels"

describe("CRM mobile route labels", () => {
  it.each([
    ["/admin/crm/customers/unified", "통합 고객"],
    ["/admin/crm/customers/customer-1", "고객 360"],
    ["/admin/crm/customers/leads", "리드"],
    ["/admin/crm/customers/intake", "접수"],
    ["/admin/crm/customers/accounts", "원천 고객"],
    ["/admin/crm/customers/segments", "세그먼트"],
    ["/admin/crm/customers/segments/seg-1", "세그먼트"],
    ["/admin/crm/customers/map", "지도"],
    ["/admin/crm/customers/tags", "태그"],
    ["/admin/crm/deals", "매출"],
    ["/admin/crm/deals/rev-sheet", "매출시트"],
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

  // 접두어 규칙은 선언 순서대로 검사된다 — 고객 보조 탭 규칙이 "/admin/crm/customers"(고객 360)
  // 아래로 내려가면 그 화면이 "고객 360"으로 뜬다(접수·태그가 실제로 그랬다, 2026-09-25).
  // 고객 보조 탭 정본은 admin-nav.ts(CRM_CUSTOMERS_CHILD_NAV)로 올라갔다(CRM 하위 탭 숨김, 2026-09-25).
  it("never labels a customers sub-tab route as 고객 360", () => {
    const hrefs = CRM_CUSTOMERS_CHILD_NAV.map((sub) => sub.href)

    expect(hrefs.length).toBeGreaterThanOrEqual(7)
    for (const href of hrefs) {
      expect(resolveCrmRouteLabel(href), href).not.toBe("고객 360")
    }
  })

  it("uses the same label as the CRM sub-tab for every customers and deals sub-tab", () => {
    const subnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")
    // 돈흐름 보조 탭은 아직 CrmSubnav 안의 표(DEALS_SUBTABS)다 — 그 구간만 스캔한다.
    const block = subnav.slice(subnav.indexOf("const DEALS_SUBTABS"), subnav.indexOf("const CUSTOMERS_SUBTAB_ICONS"))
    const dealsTabs = [...block.matchAll(/href: "([^"]+)", label: "([^"]+)"/g)].map((match) => ({
      href: match[1],
      label: match[2],
    }))
    expect(dealsTabs.length).toBe(4)
    const tabs = [...CRM_CUSTOMERS_CHILD_NAV.map(({ href, label }) => ({ href, label })), ...dealsTabs]

    // 통합(unified)만 헤더가 "통합 고객"으로 더 구체적이다 — 보조 탭 띠 안에서는 "통합"이면 충분하다.
    const HEADER_ONLY_OVERRIDES: Record<string, string> = {
      "/admin/crm/customers/unified": "통합 고객",
    }

    expect(tabs.length).toBeGreaterThanOrEqual(11)
    for (const tab of tabs) {
      expect(resolveCrmRouteLabel(tab.href), tab.href).toBe(HEADER_ONLY_OVERRIDES[tab.href] ?? tab.label)
    }
  })

  it("CrmSubnav 고객 보조 탭은 정본 표에서 파생한다(사본 금지)", () => {
    const subnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")
    expect(subnav).toContain("const CUSTOMERS_SUBTABS = CRM_CUSTOMERS_CHILD_NAV.map(")
    expect(subnav).not.toMatch(/href: "\/admin\/crm\/customers\/(leads|intake|accounts|segments|map|tags)"/)
  })

  // 같은 경로가 돈흐름·검수 두 보조 탭 띠에 다 있다 — 둘이 다른 이름으로 갈리던 것을 화면 제목
  // (rev-sheet/page.tsx h1)과 같은 "매출시트"로 통일했다(2026-09-25).
  it("labels rev-sheet 매출시트 everywhere it appears: screen title, both sub-tab bars, header", () => {
    const subnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")
    const page = readFileSync(join(process.cwd(), "app/admin/crm/deals/rev-sheet/page.tsx"), "utf8")
    const labels = [...subnav.matchAll(/href: "\/admin\/crm\/deals\/rev-sheet", label: "([^"]+)"/g)].map(
      (match) => match[1]
    )

    expect(labels).toEqual(["매출시트", "매출시트"])
    expect(page).toMatch(/<h1[^>]*>매출시트<\/h1>/)
    expect(resolveCrmRouteLabel("/admin/crm/deals/rev-sheet")).toBe("매출시트")
  })
})
