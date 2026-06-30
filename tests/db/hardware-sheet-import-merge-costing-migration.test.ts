import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260630_hardware_sheet_import_merge_costing.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware additive sheet-import merge inbound-costing parity migration", () => {
  it("recreates the additive merge RPC with the same signature/guard", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "create or replace function public.merge_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)"
    )
    // fail-closed snapshot equality guard preserved
    expect(sql).toContain("snapshot.candidate_movements <> coalesce(rows, '[]'::jsonb)")
    // still non-destructive
    expect(sql).not.toContain("delete from public.hardware_movements")
    // >40% safety valve preserved
    expect(sql).toContain("absent_count::numeric / active_count > 0.40")
  })

  it("threads unit_price and amount_usd through the PASS 1 insert", () => {
    const sql = readMigration()
    const insertStart = sql.indexOf("insert into public.hardware_movements (")
    const insertEnd = sql.indexOf("get diagnostics inserted = row_count;")
    expect(insertStart).toBeGreaterThanOrEqual(0)
    expect(insertEnd).toBeGreaterThan(insertStart)
    const insertBlock = sql.slice(insertStart, insertEnd)
    // column list learns the costing columns
    expect(insertBlock).toContain("unit_price")
    expect(insertBlock).toContain("amount_usd")
    // values cast from the candidate jsonb (same form as replace_hardware_sheet_import)
    expect(insertBlock).toContain("nullif(c.row->>'unit_price', '')::numeric")
    expect(insertBlock).toContain("nullif(c.row->>'amount_usd', '')::numeric")
  })

  it("threads unit_price and amount_usd through the PASS 2b update", () => {
    const sql = readMigration()
    const updateStart = sql.indexOf("-- PASS 2b")
    const updateEnd = sql.indexOf("get diagnostics updated = row_count;")
    expect(updateStart).toBeGreaterThanOrEqual(0)
    expect(updateEnd).toBeGreaterThan(updateStart)
    const updateBlock = sql.slice(updateStart, updateEnd)
    expect(updateBlock).toContain("unit_price = nullif(c.row->>'unit_price', '')::numeric")
    expect(updateBlock).toContain("amount_usd = nullif(c.row->>'amount_usd', '')::numeric")
  })

  it("keeps the service_role grant / anon revoke footer", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "revoke execute on function public.merge_hardware_sheet_import(jsonb, uuid, uuid)"
    )
    expect(sql).toContain(
      "grant execute on function public.merge_hardware_sheet_import(jsonb, uuid, uuid)"
    )
  })
})
