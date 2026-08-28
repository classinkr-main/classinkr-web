import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const page = readFileSync(join(process.cwd(), "app/admin/crm/matching/page.tsx"), "utf8")
const loader = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmDataCheckPanelLoader.tsx"),
  "utf8"
)

describe("CRM matching page performance contract", () => {
  it("does not block the matching HTML stream on the full CRM overview aggregation", () => {
    expect(page).toContain("<CrmMatchingWorkspace")
    expect(page).toContain("<CrmDataCheckPanelLoader />")
    expect(page).not.toContain("getAdminCrmOverview")
    expect(page).not.toContain("DataCheckPanelAsync")
  })

  it("loads the secondary data-quality panel after mount with a short reusable cache", () => {
    expect(loader).toContain('adminFetchJsonCached<AdminCrmOverview>("/api/admin/crm/overview"')
    expect(loader).toContain('cacheKey: "/api/admin/crm/overview:data-check"')
    expect(loader).toContain("ttlMs: 30_000")
    expect(loader).toContain("staleWhileRevalidateMs: 2 * 60_000")
  })
})
