import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const workbench = readFileSync(
  join(process.cwd(), "components/admin/branch/SalesLedgerWorkbench.tsx"),
  "utf8"
)
const hardwareRoute = readFileSync(join(process.cwd(), "app/api/admin/hardware/route.ts"), "utf8")
const crmSubnav = readFileSync(join(process.cwd(), "components/admin/crm/CrmSubnav.tsx"), "utf8")
const sidebarSource = readFileSync(
  join(process.cwd(), "components/admin/AdminSidebar.tsx"),
  "utf8"
)

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
    // 예열 표는 NAV_WARMUP_REQUESTS(AdminSidebar) 하나로 합쳐졌다 — CrmSubnav가 들고 있던
    // 사본은 같은 URL을 두 파일에 복제해 두 표가 갈릴 수 있었다. 키는 그 SSOT에서 검사한다.
    expect(sidebarSource).toContain('"/api/admin/crm/customers/unified?limit=50&offset=0"')
    expect(sidebarSource).not.toContain('"/api/admin/crm/customers/unified?limit=100&offset=0"')
    // CrmSubnav는 자체 표 없이 SSOT를 조회하기만 한다.
    expect(crmSubnav).toContain("NAV_WARMUP_REQUESTS")
    expect(crmSubnav).not.toContain("SUBTAB_WARMUP_REQUESTS")
  })
})
