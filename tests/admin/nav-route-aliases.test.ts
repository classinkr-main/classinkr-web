import { describe, expect, it } from "vitest"

import { ADMIN_NAV } from "@/components/admin/admin-nav"
import {
  ADMIN_NAV_ROUTE_FAMILIES,
  isAdminNavRouteMatch,
  resolveAdminNavParentHref,
} from "@/components/admin/admin-nav-routes"

const parentHrefs = ADMIN_NAV.map((item) => item.href)

describe("admin nav route families", () => {
  it("references real nav parents and assigns every alias once", () => {
    const aliases = ADMIN_NAV_ROUTE_FAMILIES.flatMap((family) => {
      expect(parentHrefs).toContain(family.parentHref)
      return family.childPathPrefixes
    })

    expect(new Set(aliases).size).toBe(aliases.length)
  })

  it.each([
    ["/admin/events", "/admin/calendar"],
    ["/admin/events/new", "/admin/calendar"],
    ["/admin/events/event-1/edit", "/admin/calendar"],
    ["/admin/partners/partner-1", "/admin/crm"],
    ["/admin/contracts", "/admin/quotes"],
    ["/admin/receipts", "/admin/quotes"],
    ["/admin/software-quote-codes", "/admin/quotes"],
    ["/admin/marketing", "/admin/campaigns"],
    ["/admin/materials", "/admin/lead-magnets"],
    ["/admin/traffic", "/admin/analytics"],
    ["/admin/docs", "/admin/chatbot"],
    ["/admin/docs/new", "/admin/chatbot"],
    ["/admin/docs/doc-1/edit", "/admin/chatbot"],
    ["/admin/channel-talk", "/admin/chatbot"],
    ["/admin/channel-talk/conversation-1", "/admin/chatbot"],
    ["/admin/cs-chatbot", "/admin/chatbot"],
    ["/admin/users", "/admin/settings"],
  ])("maps %s to its nav parent %s", (pathname, parentHref) => {
    expect(resolveAdminNavParentHref(pathname, parentHrefs)).toBe(parentHref)
    expect(isAdminNavRouteMatch(parentHref, pathname)).toBe(true)
  })

  it("prefers the longest direct parent match", () => {
    expect(resolveAdminNavParentHref("/admin/branch/ledger", parentHrefs)).toBe(
      "/admin/branch/ledger"
    )
  })

  it("does not claim unrelated admin routes", () => {
    expect(resolveAdminNavParentHref("/admin/login", parentHrefs)).toBeNull()
    expect(isAdminNavRouteMatch("/admin/chatbot", "/admin/events")).toBe(false)
  })
})
