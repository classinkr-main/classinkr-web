import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260630_branch_sales_ledger_drafts.sql",
)
const forecastOpsMigrationPath = join(
  process.cwd(),
  "supabase/migrations/20260701_branch_sales_ledger_draft_forecast_ops.sql",
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

function readForecastOpsMigration() {
  return readFileSync(forecastOpsMigrationPath, "utf8")
}

describe("branch sales ledger drafts migration", () => {
  it("creates the persistent draft queue table with guarded workflow states", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_sales_ledger_drafts")
    expect(sql).toContain("CHECK (kind IN ('new-row', 'edit-row'))")
    expect(sql).toContain("CHECK (status IN ('draft', 'checked', 'applied', 'cancelled'))")
    expect(sql).toContain("CHECK (ledger_month ~ '^[0-9]{4}-[0-9]{2}$')")
    expect(sql).toContain("source_sheet_row INTEGER")
    expect(sql).toContain("source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb")
    expect(sql).toContain("metadata JSONB NOT NULL DEFAULT '{}'::jsonb")
  })

  it("adds lookup/search indexes for the ledger workbench", () => {
    const sql = readMigration()

    expect(sql).toContain("branch_sales_ledger_drafts_status_updated_idx")
    expect(sql).toContain("branch_sales_ledger_drafts_month_team_manager_idx")
    expect(sql).toContain("branch_sales_ledger_drafts_source_deal_idx")
    expect(sql).toContain("branch_sales_ledger_drafts_source_sheet_row_idx")
    expect(sql).toContain("branch_sales_ledger_drafts_search_idx")
    expect(sql).toContain("to_tsvector(")
  })

  it("keeps admin row-level security and updated_at maintenance", () => {
    const sql = readMigration()

    expect(sql).toContain("branch_sales_ledger_drafts_updated_at")
    expect(sql).toContain("EXECUTE FUNCTION public.update_updated_at()")
    expect(sql).toContain("ALTER TABLE public.branch_sales_ledger_drafts ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Admins manage branch sales ledger drafts"')
    expect(sql).toContain("USING (is_active_admin())")
    expect(sql).toContain("WITH CHECK (is_active_admin())")
  })

  it("creates an internal applied-entry ledger for checked drafts", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_sales_ledger_entries")
    expect(sql).toContain("draft_id UUID UNIQUE")
    expect(sql).toContain("ON DELETE RESTRICT")
    expect(sql).toContain("CHECK (entry_type IN ('manual-new', 'manual-edit'))")
    expect(sql).toContain("CHECK (entry_status IN ('active', 'reversed'))")
    expect(sql).toContain("branch_sales_ledger_entries_status_month_idx")
    expect(sql).toContain("branch_sales_ledger_entries_month_team_manager_idx")
    expect(sql).toContain("branch_sales_ledger_entries_source_deal_idx")
    expect(sql).toContain("branch_sales_ledger_entries_draft_idx")
    expect(sql).toContain("ALTER TABLE public.branch_sales_ledger_entries ENABLE ROW LEVEL SECURITY")
    expect(sql).toContain('CREATE POLICY "Admins manage branch sales ledger entries"')
  })

  it("applies checked drafts atomically into the internal ledger", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.apply_branch_sales_ledger_draft")
    expect(sql).toContain("AND status = 'checked'")
    expect(sql).toContain("FOR UPDATE")
    expect(sql).toContain("status = 'applied'")
    expect(sql).toContain("INSERT INTO public.branch_sales_ledger_entries")
    expect(sql).toContain("ON CONFLICT (draft_id) DO NOTHING")
    expect(sql).toContain("'sales-ledger-workbench'")
  })

  it("hardens applied drafts and security-definer RPC execution", () => {
    const sql = readMigration()

    expect(sql).toContain("prevent_branch_sales_ledger_applied_draft_mutation")
    expect(sql).toContain("branch_sales_ledger_drafts_immutable_applied")
    expect(sql).toContain("Applied sales ledger drafts are immutable")
    expect(sql).toContain("Checked sales ledger drafts must be returned to draft before editing")
    expect(sql).toContain("prevent_branch_sales_ledger_entry_delete")
    expect(sql).toContain("branch_sales_ledger_entries_no_delete")
    expect(sql).toContain("prevent_branch_sales_ledger_entry_update")
    expect(sql).toContain("branch_sales_ledger_entries_no_update")
    expect(sql).toContain("Applied sales ledger entries are append-only")
    expect(sql).toContain("REVOKE EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft(UUID, TEXT)")
    expect(sql).toContain("FROM PUBLIC, anon, authenticated")
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.apply_branch_sales_ledger_draft(UUID, TEXT)")
    expect(sql).toContain("TO service_role")
  })

  it("adds nullable generated columns for forecast operation metadata", () => {
    const sql = readForecastOpsMigration()

    for (const table of ["branch_sales_ledger_drafts", "branch_sales_ledger_entries"]) {
      expect(sql).toContain(`ALTER TABLE public.${table}`)
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS operation TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS confidence TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS product_category TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_month TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS target_month TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS source_week TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS target_week TEXT GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS quantity NUMERIC GENERATED ALWAYS AS")
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS unit_price NUMERIC GENERATED ALWAYS AS")
    }

    expect(sql).toContain("metadata->>'operation'")
    expect(sql).toContain("metadata->>'productCategory'")
    expect(sql).toContain("metadata->>'fromMonth'")
    expect(sql).toContain("metadata->>'week'")
    expect(sql).toContain("metadata->>'unitPrice'")
  })

  it("checks forecast operation, confidence, category, period, and numeric contracts", () => {
    const sql = readForecastOpsMigration()

    expect(sql).toContain("operation IN ('forecast-add', 'period-shift', 'quantity-change', 'amount-change')")
    expect(sql).toContain("confidence IN ('confirmed', 'high_confidence', 'expected', 'format_unavailable')")
    expect(sql).toContain("product_category IN ('software', 'hardware', 'unknown')")
    expect(sql).toContain("source_month ~ '^[0-9]{4}-[0-9]{2}$'")
    expect(sql).toContain("target_month ~ '^[0-9]{4}-[0-9]{2}$'")
    expect(sql).toContain("source_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5')")
    expect(sql).toContain("target_week IN ('month', 'w1', 'w2', 'w3', 'w4', 'w5')")
    expect(sql).toContain("quantity IS NULL OR quantity >= 0")
    expect(sql).toContain("unit_price IS NULL OR unit_price >= 0")
    expect(sql).toContain("btrim(metadata->>'quantity') ~ '^[0-9]+(\\.[0-9]+)?$'")
    expect(sql).toContain("btrim(metadata->>'unitPrice') ~ '^[0-9]+(\\.[0-9]+)?$'")
  })

  it("keeps existing beta rows migratable and indexes forecast lookups", () => {
    const sql = readForecastOpsMigration()

    expect(sql).toContain("NOT VALID")
    expect(sql).toContain("branch_sales_ledger_drafts_operation_month_idx")
    expect(sql).toContain("branch_sales_ledger_drafts_product_confidence_idx")
    expect(sql).toContain("branch_sales_ledger_entries_operation_month_idx")
    expect(sql).toContain("WHERE operation IS NOT NULL")
  })
})
