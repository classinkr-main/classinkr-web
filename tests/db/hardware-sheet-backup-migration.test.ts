import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260627_hardware_sheet_import_snapshots.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware sheet import snapshot migration", () => {
  it("adds an append-only snapshot table for hardware sheet imports", () => {
    const sql = readMigration()

    expect(sql).toContain("create table if not exists public.hardware_sheet_import_snapshots")
    expect(sql).toContain("previous_sheet_movements jsonb not null")
    expect(sql).toContain("candidate_movements jsonb not null")
    expect(sql).toContain("source_payload jsonb not null")
    expect(sql).toContain("checksum text not null")
    expect(sql).toContain("hardware_sheet_import_snapshots_immutable")
  })

  it("backs up current sheet_import movements before replacing them", () => {
    const sql = readMigration()
    const snapshotInsert = sql.indexOf("insert into public.hardware_sheet_import_snapshots")
    const deleteSheetImport = sql.indexOf("delete from public.hardware_movements")

    expect(snapshotInsert).toBeGreaterThanOrEqual(0)
    expect(deleteSheetImport).toBeGreaterThanOrEqual(0)
    expect(snapshotInsert).toBeLessThan(deleteSheetImport)
    expect(sql).toContain("replace_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)")
  })
})
