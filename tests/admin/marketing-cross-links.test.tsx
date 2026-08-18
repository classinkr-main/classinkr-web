import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarketingCrossLinks } from "@/components/admin/MarketingCrossLinks"
import { ADMIN_NAV } from "@/components/admin/admin-nav"
import { visibleMarketingSiblings } from "@/components/admin/MarketingCrossLinks"

const marketingHrefs = ADMIN_NAV.filter((i) => i.section === "marketing").map((i) => i.href)

describe("MarketingCrossLinks", () => {
  it("lists sibling marketing routes and excludes the current one", () => {
    const html = renderToStaticMarkup(<MarketingCrossLinks currentHref="/admin/campaigns" />)
    // current page must not link to itself
    expect(html).not.toContain('href="/admin/campaigns"')
    // every other marketing route is linked
    for (const href of marketingHrefs.filter((h) => h !== "/admin/campaigns")) {
      expect(html).toContain(`href="${href}"`)
    }
    // derives from the SSOT nav labels
    expect(html).toContain("자료 퍼널")
    // 공개 행사와 트래픽은 최상위 nav에서만 내려갔다. 두 독립 라우트는 계속 살아 있지만
    // 이 컴포넌트는 ADMIN_NAV의 marketing 형제만 파생하므로 여기에는 나오지 않는다.
    expect(html).not.toContain('href="/admin/events"')
    expect(html).not.toContain('href="/admin/traffic"')
    // 트래픽 진입은 Analytics 화면 안의 전용 크로스링크가 담당한다.
    expect(html).toContain('href="/admin/analytics"')
  })

  it("renders the full marketing workspace for a non-marketing current route", () => {
    const html = renderToStaticMarkup(<MarketingCrossLinks currentHref="/admin/nonexistent" />)
    expect(html).toContain("마케팅 워크스페이스")
  })

  it("omits routes passed in excludeHrefs (e.g. surfaces with a dedicated CTA)", () => {
    const html = renderToStaticMarkup(
      <MarketingCrossLinks currentHref="/admin/campaigns" excludeHrefs={["/admin/analytics"]} />
    )
    expect(html).not.toContain('href="/admin/analytics"')
    // other siblings still present
    expect(html).toContain('href="/admin/blog"')
  })
})

// (2026-08-18) 접근 SSOT 필터 — deny 탭은 칩 자체를 그리지 않는다(죽은 진입점 방지).
describe("visibleMarketingSiblings — 접근 필터", () => {
  it("hides preset-denied tabs for a non-super marketing member", () => {
    const hrefs = visibleMarketingSiblings(
      { role: "ADMIN", preset: "marketing", overrides: {} },
      "/admin/campaigns"
    ).map((item) => item.href)
    // 캠페인 관리·마케팅 프로젝트는 MOON_ONLY, Analytics는 marketing 프리셋 차단(RESTRICTED).
    expect(hrefs).not.toContain("/admin/campaigns/manage")
    expect(hrefs).not.toContain("/admin/campaigns/projects")
    expect(hrefs).not.toContain("/admin/analytics")
    expect(hrefs).toContain("/admin/blog")
    expect(hrefs).toContain("/admin/lead-magnets")
  })

  it("keeps legacy full visibility without session context (SSR·프리셋 미배정)", () => {
    const hrefs = visibleMarketingSiblings(null, "/admin/campaigns").map((item) => item.href)
    expect(hrefs).toContain("/admin/campaigns/manage")
    expect(hrefs).toContain("/admin/analytics")
  })

  it("keeps every sibling for the super preset", () => {
    const hrefs = visibleMarketingSiblings(
      { role: "SUPER_ADMIN", preset: "super", overrides: {} },
      "/admin/campaigns"
    ).map((item) => item.href)
    expect(hrefs).toContain("/admin/campaigns/manage")
    expect(hrefs).toContain("/admin/campaigns/projects")
    expect(hrefs).toContain("/admin/analytics")
  })
})
