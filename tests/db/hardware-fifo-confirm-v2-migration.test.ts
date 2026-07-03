import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260702_hardware_fifo_confirm_v2.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware FIFO confirm v2 migration", () => {
  it("adds an atomic planned confirmation RPC with row locking", () => {
    const sql = readMigration()

    expect(sql).toContain("create or replace function public.confirm_hardware_planned_movement_v2")
    expect(sql).toContain("where id = planned_id")
    expect(sql).toContain("for update")
    expect(sql).toContain("grant execute on function public.confirm_hardware_planned_movement_v2")
  })

  it("allocates blank-lot planned rows by FIFO lot order", () => {
    const sql = readMigration()

    expect(sql).toContain("when lot_no ilike 'FY%' then 0")
    expect(sql).toContain("when lot_no ~* '^H[0-9]+$'")
    expect(sql).toContain("remaining_qty := remaining_qty - allocation_qty")
    expect(sql).toContain("'autoLot', jsonb_build_object")
  })

  it("preserves explicit planned lots with availability validation", () => {
    const sql = readMigration()

    expect(sql).toContain("planned.lot_no")
    expect(sql).toContain("lot_no = planned.lot_no")
    expect(sql).toContain("lot 재고가 부족합니다")
  })
})
