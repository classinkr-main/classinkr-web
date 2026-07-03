import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260630_hardware_sheet_import_inbound_costing.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8").replace(/\r\n/g, "\n")
}

describe("hardware sheet import inbound costing migration", () => {
  it("recreates both replace_hardware_sheet_import variants", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "create or replace function public.replace_hardware_sheet_import(rows jsonb, run_id uuid)"
    )
    expect(sql).toContain(
      "create or replace function public.replace_hardware_sheet_import(rows jsonb, run_id uuid, snapshot_id uuid)"
    )
  })

  it("threads unit_price and amount_usd through the replace RPC insert", () => {
    const sql = readMigration()
    // Column list learns the new costing columns.
    expect(sql).toContain("unit_price,")
    expect(sql).toContain("amount_usd,")
    // Values are cast from the jsonb candidate rows.
    expect(sql).toContain("nullif(r->>'unit_price', '')::numeric")
    expect(sql).toContain("nullif(r->>'amount_usd', '')::numeric")
  })

  it("keeps the snapshot byte-for-byte match guard intact", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "if snapshot.candidate_movements <> coalesce(rows, '[]'::jsonb) then"
    )
  })

  it("round-trips the costing and lot columns through restore", () => {
    const sql = readMigration()
    const restoreFn = sql.indexOf(
      "create or replace function public.restore_hardware_sheet_import_snapshot"
    )
    expect(restoreFn).toBeGreaterThanOrEqual(0)
    expect(sql).toContain("nullif(r->>'amount_cny', '')::numeric")
    expect(sql).toContain("nullif(r->>'storage_location', '')")
    expect(sql).toContain("nullif(r->>'importer', '')")
    expect(sql).toContain("nullif(r->>'lot_no', '')")
  })

  it("keeps the service_role grant / anon revoke footer", () => {
    const sql = readMigration()
    expect(sql).toContain(
      "revoke execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)\nfrom public, anon, authenticated;"
    )
    expect(sql).toContain(
      "grant execute on function public.replace_hardware_sheet_import(jsonb, uuid, uuid)\nto service_role;"
    )
  })
})
