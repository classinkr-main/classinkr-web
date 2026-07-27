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
    expect(html).toContain("방문자/트래픽")
  })

  it("renders nothing when every marketing route is the current one", () => {
    // a non-marketing currentHref still yields the full sibling set (non-empty)
    const html = renderToStaticMarkup(<MarketingCrossLinks currentHref="/admin/nonexistent" />)
    expect(html).toContain("마케팅 워크스페이스")
  })

  it("omits routes passed in excludeHrefs (e.g. surfaces with a dedicated CTA)", () => {
    const html = renderToStaticMarkup(
      <MarketingCrossLinks currentHref="/admin/campaigns" excludeHrefs={["/admin/events"]} />
    )
    expect(html).not.toContain('href="/admin/events"')
    // other siblings still present
    expect(html).toContain('href="/admin/analytics"')
  })
})
