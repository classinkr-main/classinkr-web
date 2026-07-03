import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const routePath = join(
  process.cwd(),
  "app/api/admin/branch/ledger-drafts/[id]/route.ts",
)
const collectionRoutePath = join(
  process.cwd(),
  "app/api/admin/branch/ledger-drafts/route.ts",
)
const repositoryPath = join(
  process.cwd(),
  "lib/repositories/branch-sales-ledger-drafts.ts",
)

function routeSource() {
  return readFileSync(routePath, "utf8")
}

function collectionRouteSource() {
  return readFileSync(collectionRoutePath, "utf8")
}

function repositorySource() {
  return readFileSync(repositoryPath, "utf8")
}

describe("branch ledger draft route", () => {
  it("requires the explicit apply action for applied status transitions", () => {
    const route = routeSource()

    expect(route).toContain('raw.status === "applied"')
    expect(route).toContain("Use action=apply to apply a checked draft")
    expect(route).toContain('action === "apply"')
    expect(route).toContain("applyBranchSalesLedgerDraft(id, actor)")
  })

  it("only applies drafts that are already checked", () => {
    const repository = repositorySource()

    expect(repository).toContain("applyBranchSalesLedgerDraft")
    expect(repository).toContain('rpc("apply_branch_sales_ledger_draft"')
    expect(repository).toContain("p_actor: actor")
    expect(repository).toContain("p_draft_id: id")
    expect(repository).toContain("BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG")
  })

  it("returns internal ledger entries with separate health from the draft queue", () => {
    const route = collectionRouteSource()
    const repository = repositorySource()

    expect(route).toContain("listBranchSalesLedgerEntries")
    expect(route).toContain("entries: entryResult.entries")
    expect(route).toContain("ledgerHealth: entryResult.health")
    expect(repository).toContain('from("branch_sales_ledger_entries")')
    expect(repository).toContain("listBranchSalesLedgerEntries")
  })

  it("does not mutate applied drafts through repository update/delete paths", () => {
    const repository = repositorySource()

    expect(repository).toContain('.neq("status", "applied")')
    expect(repository).toContain('.neq("status", "checked")')
  })
})
