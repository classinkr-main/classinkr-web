import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repository = readFileSync(join(process.cwd(), "lib/admin-crm-matching.ts"), "utf8")
const route = readFileSync(join(process.cwd(), "app/api/admin/crm/matching/route.ts"), "utf8")

describe("CRM matching backend scalability contract", () => {
  it("paginates every primary Supabase source with stable ordering instead of silent fixed limits", () => {
    expect(repository.match(/fetchSupabasePages</g)?.length).toBeGreaterThanOrEqual(5)
    expect(repository).not.toContain(".limit(5000)")
    expect(repository).not.toContain(".limit(2000)")
    expect(repository).not.toContain(".limit(1000)")
    expect(repository).toContain('.order("updated_at", { ascending: false })')
    expect(repository).toContain('.order("id", { ascending: false })')
  })

  it("shares one bounded snapshot and treats critical truncation as failure rather than zero", () => {
    expect(repository).toContain("const MATCHING_SNAPSHOT_TTL_MS = 30_000")
    expect(repository).toContain("matchingSnapshotMemo")
    expect(repository).toContain("if (sheetResult.truncated) throw new Error")
    expect(repository).toContain("if (linksResult.truncated) throw new Error")
  })

  it("does not scan global owner and target directories on every cold inbox load", () => {
    expect(repository).not.toContain("getXiaoshouyiOwnerNameMap(sb)")
    expect(repository).toContain("getCrmMatchingLookupPlan(links)")
    expect(repository).toContain('.in("external_id", ids)')
    expect(repository).toContain('missingTargetTypeSet.has("partner_account")')
    expect(repository).toContain('missingTargetTypeSet.has("customer")')
    expect(repository).toContain('missingTargetTypeSet.has("deal")')
  })

  it("returns before the 15 second client timeout when the server snapshot stalls", () => {
    expect(route).toContain("const MATCHING_ROUTE_TIMEOUT_MS = 12_000")
    expect(route).toContain("withRouteBudget")
    expect(route).toContain("status: 504")
  })
})
