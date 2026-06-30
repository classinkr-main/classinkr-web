import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260701_hardware_restore_snapshot_guard.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware restore-snapshot fail-closed guard migration", () => {
  it("recreates restore_hardware_sheet_import_snapshot with the same signature", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "create or replace function public.restore_hardware_sheet_import_snapshot(snapshot_id uuid, actor text default null)"
    )
    expect(sql).toContain("security definer")
    // delete + reinsert logic preserved
    expect(sql).toContain("delete from public.hardware_movements")
    expect(sql).toContain("from jsonb_array_elements(snapshot.previous_sheet_movements) as r")
  })

  it("adds the fail-closed array-shape guard before the destructive delete", () => {
    const sql = readMigration()
    // array-shape guard on previous_sheet_movements
    expect(sql).toContain("jsonb_typeof(snapshot.previous_sheet_movements)")
    expect(sql).toContain("snapshot.previous_sheet_movements is null")
    // non-empty guard
    expect(sql).toContain("jsonb_array_length(snapshot.previous_sheet_movements) = 0")

    // the guard must run BEFORE the destructive delete
    const guardIdx = sql.indexOf("jsonb_typeof(snapshot.previous_sheet_movements)")
    const deleteIdx = sql.indexOf("delete from public.hardware_movements")
    expect(guardIdx).toBeGreaterThanOrEqual(0)
    expect(deleteIdx).toBeGreaterThan(guardIdx)
  })

  it("keeps the service_role grant / anon revoke footer on the restore function", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "revoke execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)"
    )
    expect(sql).toContain(
      "grant execute on function public.restore_hardware_sheet_import_snapshot(uuid, text)"
    )
  })

  it("locks down crm_neo_customer_snapshots table privileges (Item 2)", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "revoke all on table public.crm_neo_customer_snapshots"
    )
    expect(sql).toContain("from anon, authenticated")
    expect(sql).toContain(
      "grant all on table public.crm_neo_customer_snapshots"
    )
    expect(sql).toContain("to service_role")
  })
})
