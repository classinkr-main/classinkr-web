import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260629_hardware_partial_confirm.sql"
)

function readMigration() {
  return readFileSync(migrationPath, "utf8")
}

describe("hardware partial confirm migration", () => {
  it("replaces the confirm RPC with a confirm_qty overload", () => {
    const sql = readMigration()

    expect(sql).toContain("drop function if exists public.confirm_hardware_planned_movement(uuid, text, date)")
    expect(sql).toContain("confirm_qty int default null")
    expect(sql).toContain("grant execute on function public.confirm_hardware_planned_movement(uuid, text, date, int)")
  })

  it("creates an outbound for the confirmed amount and reduces the remainder", () => {
    const sql = readMigration()

    expect(sql).toContain("effective_qty := least(coalesce(confirm_qty, planned.quantity), planned.quantity)")
    // full -> void + converted_to; partial -> reduce planned quantity
    expect(sql).toContain("converted_to_movement_id = created.id")
    expect(sql).toContain("set quantity = planned.quantity - effective_qty")
    expect(sql).toContain("planned.lot_no")
  })
})
