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

  // 웨이브 5 — 되돌리기(reverse). id 파라미터는 apply와 동일 계약(draft id)이고, repository가
  // draft_id -> entry_id 매핑을 내부에서 해결한다. draft.status는 절대 건드리지 않는다.
  it("wires action=reverse through the same draft-id-keyed PATCH contract as apply", () => {
    const route = routeSource()

    expect(route).toContain('action === "reverse"')
    expect(route).toContain("reverseBranchSalesLedgerEntryByDraftId(id, actor, reason)")
    expect(route).toContain("해당 초안에 연결된 적용 항목을 찾을 수 없습니다.")
    expect(route).toContain("NextResponse.json({ entry })")
  })

  it("maps the duplicate-active-correction conflict to 409, not 500", () => {
    const route = routeSource()

    expect(route).toContain("duplicateActiveCorrectionResponse")
    expect(route).toContain("isBranchSalesLedgerDuplicateActiveCorrectionError")
    expect(route).toContain("status: 409")
  })

  it("resolves draft_id -> entry_id and calls the idempotent reversal RPC without mutating draft status", () => {
    const repository = repositorySource()

    expect(repository).toContain("export async function reverseBranchSalesLedgerEntryByDraftId")
    expect(repository).toContain('.eq("draft_id", draftId)')
    expect(repository).toContain('rpc("reverse_branch_sales_ledger_entry"')
    expect(repository).toContain("p_entry_id: entryRow.id")
    // The audit-trail invariant: this function must never touch branch_sales_ledger_drafts.
    const fnStart = repository.indexOf("export async function reverseBranchSalesLedgerEntryByDraftId")
    const fnBody = repository.slice(fnStart, repository.indexOf("\n}\n", fnStart))
    expect(fnBody).not.toContain('from("branch_sales_ledger_drafts")')
  })

  it("surfaces the active-manual-edit unique-index violation as a friendly, recognizable error", () => {
    const repository = repositorySource()

    expect(repository).toContain("branch_sales_ledger_entries_active_manual_edit_unique")
    expect(repository).toContain("isBranchSalesLedgerDuplicateActiveCorrectionError")
    expect(repository).toContain("이미 이 딜·월에 적용된 정정 항목이 있습니다")
  })
})
