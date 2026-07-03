import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260701_sales_ledger_db_native_import.sql",
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("sales ledger DB-native import migration", () => {
  it("creates import run, source file, snapshot, and active source tables", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_ledger_import_runs")
    expect(sql).toContain("CHECK (source_kind IN ('xlsx', 'csv', 'google-sheet', 'manual'))")
    expect(sql).toContain("CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled'))")
    expect(sql).toContain("WHERE source_checksum IS NOT NULL AND status = 'succeeded'")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_ledger_source_files")
    expect(sql).toContain("CHECK (tab_key IN ('dsh', 'rev', 'kpi'))")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_ledger_import_snapshots")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_ledger_active_sources")
    expect(sql).toContain("ON DELETE RESTRICT")
    expect(sql).toContain("ensure_sales_ledger_active_source_succeeded")
    expect(sql).toContain("sales_ledger_active_sources_succeeded_only")
    expect(sql).toContain("Active sales ledger source must point to a succeeded import run")
  })

  it("creates typed DB-native tables for DSH, KPI, and REV period entries", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_dsh_rows")
    expect(sql).toContain("CHECK (row_level IN ('total', 'team', 'member', 'breakdown', 'summary'))")
    expect(sql).toContain("CHECK (row_kind IN ('goal', 'status', 'rate', 'gap'))")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_kpi_rows")
    expect(sql).toContain("CHECK (row_kind IN ('goal', 'status', 'gap', 'achievement'))")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_rev_lines")
    expect(sql).toContain("source_record_key TEXT NOT NULL")
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.branch_rev_period_entries")
    expect(sql).toContain("CHECK (period_month ~ '^[0-9]{4}-[0-9]{2}$')")
    expect(sql).toContain("CHECK (confidence IN ('confirmed', 'high_confidence', 'expected', 'format_unavailable'))")
  })

  it("tracks validations and protects snapshots as append-only audit data", () => {
    const sql = readMigration()

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.sales_ledger_validations")
    expect(sql).toContain("CHECK (severity IN ('info', 'warning', 'error'))")
    expect(sql).toContain("prevent_sales_ledger_import_snapshot_mutation")
    expect(sql).toContain("sales_ledger_import_snapshots_append_only")
    expect(sql).toContain("Sales ledger import snapshots are append-only")
  })

  it("enables admin RLS policies on all import-owned tables", () => {
    const sql = readMigration()

    for (const table of [
      "sales_ledger_import_runs",
      "sales_ledger_source_files",
      "sales_ledger_import_snapshots",
      "sales_ledger_active_sources",
      "branch_dsh_rows",
      "branch_kpi_rows",
      "branch_rev_lines",
      "branch_rev_period_entries",
      "sales_ledger_validations",
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }

    expect(sql).toContain("USING (public.is_active_admin())")
    expect(sql).toContain("WITH CHECK (public.is_active_admin())")
  })
})
