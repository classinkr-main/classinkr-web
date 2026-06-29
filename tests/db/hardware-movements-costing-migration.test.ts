import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260628_hardware_movements_costing.sql"
)

describe("hardware movements costing migration", () => {
  it("adds the sheet inbound costing columns to hardware_movements", () => {
    const sql = readFileSync(migrationPath, "utf8")

    expect(sql).toContain("alter table public.hardware_movements")
    expect(sql).toContain("add column if not exists unit_price numeric")
    expect(sql).toContain("add column if not exists amount_usd numeric")
    expect(sql).toContain("add column if not exists amount_cny numeric")
    expect(sql).toContain("add column if not exists storage_location text")
    expect(sql).toContain("add column if not exists importer text")
  })
})
