import { readFileSync } from "fs"
import { resolve } from "path"
import { describe, expect, it } from "vitest"

describe("CRM readiness cache contract", () => {
  it("reuses the expensive duplicate preflight and keeps the admin response private", () => {
    const readiness = readFileSync(resolve(process.cwd(), "lib/admin-crm-readiness.ts"), "utf8")
    const route = readFileSync(resolve(process.cwd(), "app/api/admin/crm/readiness/route.ts"), "utf8")

    expect(readiness).toContain("getCachedCrmDuplicatePreflightReport()")
    expect(readiness).not.toContain("getCrmDuplicatePreflightReport()")
    expect(route).toContain('private, max-age=30, stale-while-revalidate=120')
  })
})
