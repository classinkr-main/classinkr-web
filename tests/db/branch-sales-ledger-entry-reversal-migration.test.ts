import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260717_branch_sales_ledger_entry_reversal.sql",
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("branch sales ledger entry reversal migration (wave 5)", () => {
  it("adds audit columns for the reversal (상쇄) trail", () => {
    const sql = readMigration()

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS reversed_by TEXT")
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS reversal_reason TEXT")
  })

  it("reasserts the active->reversed transition guard regardless of prior 20260702 application", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.prevent_branch_sales_ledger_entry_update()")
    expect(sql).toContain("OLD.entry_status = 'active'")
    expect(sql).toContain("NEW.entry_status = 'reversed'")
    expect(sql).toContain("only active -> reversed status transitions")
  })

  it("creates a FOR UPDATE-locked, idempotent reversal RPC that never mutates the draft", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reverse_branch_sales_ledger_entry")
    expect(sql).toContain("p_entry_id UUID")
    expect(sql).toContain("p_actor TEXT")
    expect(sql).toContain("p_reason TEXT DEFAULT NULL")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("IF NOT FOUND THEN")
    expect(sql).toContain("RETURN NULL")
    expect(sql).toContain("IF v_entry.entry_status = 'reversed' THEN")
    expect(sql).toContain("RETURN v_entry")
    expect(sql).toContain("SET entry_status = 'reversed'")
    expect(sql).toContain("reversed_at = v_now")
    expect(sql).toContain("reversed_by = p_actor")
    // draft.status must never be touched by this RPC — the audit trail invariant.
    expect(sql).not.toMatch(/UPDATE\s+public\.branch_sales_ledger_drafts/)
  })

  it("locks execute grants down to service_role, matching apply_branch_sales_ledger_draft convention", () => {
    const sql = readMigration()

    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.reverse_branch_sales_ledger_entry(UUID, TEXT, TEXT)")
    expect(sql).toContain("FROM PUBLIC, anon, authenticated")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reverse_branch_sales_ledger_entry(UUID, TEXT, TEXT)")
    expect(sql).toContain("TO service_role")
  })

  it("scopes the (source_deal_id, ledger_month) active-uniqueness index to manual-edit corrections only", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS branch_sales_ledger_entries_active_manual_edit_unique")
    expect(sql).toContain("ON public.branch_sales_ledger_entries (source_deal_id, ledger_month)")
    expect(sql).toContain("WHERE entry_status = 'active'")
    expect(sql).toContain("AND entry_type = 'manual-edit'")
    expect(sql).toContain("AND source_deal_id IS NOT NULL")
    // manual-new (additive forecast rows) must stay outside this index's scope.
    expect(sql).toContain("manual-new")
  })

  it("adds a reversed_at audit index for future reversal listing", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE INDEX IF NOT EXISTS branch_sales_ledger_entries_reversed_at_idx")
    expect(sql).toContain("WHERE entry_status = 'reversed'")
  })
})
