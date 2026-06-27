import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260628_hardware_movements_lot.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware movements lot migration", () => {
  it("adds a nullable lot_no column with a partial index", () => {
    const sql = readMigration()

    expect(sql).toContain("add column if not exists lot_no text")
    expect(sql).toContain("hardware_movements_item_lot_idx")
    expect(sql).toContain("on public.hardware_movements(item_id, lot_no)")
    expect(sql).toContain("where lot_no is not null")
  })

  it("carries the lot through the planned -> outbound conversion", () => {
    const sql = readMigration()
    const confirmFn = sql.indexOf("create or replace function public.confirm_hardware_planned_movement")

    expect(confirmFn).toBeGreaterThanOrEqual(0)
    // lot_no must be in both the insert column list and the values copied from the planned row.
    expect(sql).toContain("planned.lot_no")
    expect(sql.indexOf("add column if not exists lot_no text")).toBeLessThan(confirmFn)
  })
})
