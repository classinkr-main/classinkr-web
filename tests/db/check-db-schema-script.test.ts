import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const script = readFileSync(join(process.cwd(), "scripts/check-db-schema.ts"), "utf8")

describe("check-db-schema table probes", () => {
  it("uses a one-row GET so missing-table errors are not discarded by HEAD", () => {
    expect(script).not.toContain('count: "exact", head: true')
    expect(script).toContain('.select(probe.columns.join(","), { count: "exact" })')
    expect(script).toContain(".range(0, 0)")
  })

  it("uses read-only catalog evidence when a deny-all table has no rows", () => {
    expect(script).toContain("inspectDenyAllMetadata")
    expect(script).toContain("c.relrowsecurity as rls_enabled")
    expect(script).toContain("anon_select_policy_count")
    expect(script).toContain("admin_only_policy_count")
    expect(script).toContain("set local role anon")
    expect(script).toContain("metadataProtected: metadata?.protected")
  })

  it("checks locking RPCs through pg_proc instead of executing them", () => {
    expect(script).toContain("inspectRpcMetadata")
    expect(script).toContain("oidvectortypes(p.proargtypes)")
    expect(script).toContain("has_function_privilege('service_role'")
    expect(script).toContain("if (probe.catalogIdentityTypes)")
  })
})
