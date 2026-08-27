import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const workbench = readFileSync(
  join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"),
  "utf8"
)
const hardwareRoute = readFileSync(join(process.cwd(), "app/api/admin/hardware/route.ts"), "utf8")
const crmSubnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")

describe("branch and CRM cold-load contracts", () => {
  it("requests branch breakdown only for the DSH lens", () => {
    expect(workbench).toContain('lens === "dsh" ? "&breakdown=1" : ""')
    expect(workbench).not.toContain("${monthQuery}&breakdown=1")
  })

  it("uses the lightweight hardware customer-link projection", () => {
    expect(workbench).toContain('"/api/admin/hardware?scope=customer-links"')
    expect(hardwareRoute).toContain('req.nextUrl.searchParams.get("scope") === "customer-links"')
    expect(workbench).not.toContain("hardware.data?.movements")
  })

  it("keeps CRM subnav warmup on the real 50-row unified key", () => {
    expect(crmSubnav).toContain('"/api/admin/crm/customers/unified?limit=50&offset=0"')
    expect(crmSubnav).not.toContain('"/api/admin/crm/customers/unified?limit=100&offset=0"')
  })
})
