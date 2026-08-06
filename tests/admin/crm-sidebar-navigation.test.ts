import { describe, expect, it } from "vitest"

import {
  CRM_SAVED_VIEWS,
  isCrmSavedViewActive,
  isCrmSavedViewsPath,
} from "@/components/admin/crm/crm-sidebar-navigation"

describe("CRM sidebar saved-view rules", () => {
  it("shows saved views only on the unified customer list", () => {
    expect(isCrmSavedViewsPath("/admin/crm/customers")).toBe(true)
    expect(isCrmSavedViewsPath("/admin/crm/customers/unified")).toBe(true)
    expect(isCrmSavedViewsPath("/admin/crm/customers/unified/detail")).toBe(true)

    expect(isCrmSavedViewsPath("/admin/crm")).toBe(false)
    expect(isCrmSavedViewsPath("/admin/crm/customers/leads")).toBe(false)
    expect(isCrmSavedViewsPath("/admin/crm/activity")).toBe(false)
    expect(isCrmSavedViewsPath("/admin/crm/capture")).toBe(false)
    expect(isCrmSavedViewsPath("/admin/crm/matching")).toBe(false)
  })

  it("marks exactly the matching query-backed saved view as active", () => {
    const active = CRM_SAVED_VIEWS.filter(({ view }) =>
      isCrmSavedViewActive("/admin/crm/customers/unified", "expiring", view)
    )

    expect(active.map(({ view }) => view)).toEqual(["expiring"])
    expect(isCrmSavedViewActive("/admin/crm/activity", "expiring", "expiring")).toBe(false)
    expect(isCrmSavedViewActive("/admin/crm/customers/unified", null, "expiring")).toBe(false)
  })
})
