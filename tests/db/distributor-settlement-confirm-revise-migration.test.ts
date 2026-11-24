import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261124_distributor_settlement_confirm_revise.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8").replace(/--[^\n]*/g, "")

describe("distributor settlement confirm/revise migration", () => {
  it("adds the partner-confirmation and revision columns idempotently", () => {
    for (const column of ["distributor_confirmed_at TIMESTAMPTZ", "distributor_confirmed_name TEXT", "revised_at TIMESTAMPTZ"]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`)
    }
    expect(sql).toContain("DROP CONSTRAINT IF EXISTS distributor_settlements_confirmed_name_check")
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY|DROP TABLE/i)
  })

  it("is probed as a non-blocking warning", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probes = SCHEMA_PROBES.filter((entry) => entry.migration === FILE)
    expect(probes).toHaveLength(1)
    expect(probes[0]).toMatchObject({
      kind: "table",
      table: "distributor_settlements",
      columns: ["distributor_confirmed_at", "distributor_confirmed_name", "revised_at"],
      severity: "warning",
    })
  })
})
