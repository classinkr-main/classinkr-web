import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260630_hardware_sheet_import_merge.sql"
)
const sql = () => readFileSync(migrationPath, "utf8")

describe("hardware additive sheet-import merge migration", () => {
  it("adds digest/provenance columns and an active-rows index", () => {
    const s = sql()
    expect(s).toContain("add column if not exists source_digest text")
    expect(s).toContain("add column if not exists sheet_absent_run uuid")
    expect(s).toContain("hardware_movements_sheet_active_idx")
    expect(s).toContain("where source = 'sheet_import' and voided_at is null")
  })

  it("creates a non-destructive merge RPC that keeps the snapshot guard", () => {
    const s = sql()
    expect(s).toContain("create or replace function public.merge_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)")
    // fail-closed snapshot equality guard preserved from replace_hardware_sheet_import
    expect(s).toContain("snapshot.candidate_movements <> coalesce(rows, '[]'::jsonb)")
    // does NOT hard-delete the ledger
    expect(s).not.toContain("delete from public.hardware_movements")
  })

  it("has provenance-scoped passes + a >40% fail-closed safety valve", () => {
    const s = sql()
    expect(s).toContain("absent_count::numeric / active_count > 0.40")
    expect(s).toContain("시트에서 제거됨") // tombstone reason (PASS 3) + revival guard (PASS 2a)
    expect(s).toContain("converted_to_movement_id is null") // skip confirmed rows
    expect(s).toContain("(m.raw->>'human_locked_at'), '') = ''") // skip partial-confirm remainders
  })

  it("marks partial-confirm remainders human_locked so import never overwrites them", () => {
    const s = sql()
    expect(s).toContain("confirm_hardware_planned_movement")
    expect(s).toContain("human_locked_at")
  })
})
