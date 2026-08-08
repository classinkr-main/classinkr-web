import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarketingCrossLinks } from "@/components/admin/MarketingCrossLinks"
import { ADMIN_NAV } from "@/components/admin/admin-nav"

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
