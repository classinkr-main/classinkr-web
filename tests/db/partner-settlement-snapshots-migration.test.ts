import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261123_partner_settlement_snapshots.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8").replace(/--[^\n]*/g, "")

describe("partner settlement snapshots migration", () => {
  it("keeps the money snapshot service-role only", () => {
    expect(sql).toMatch(/ALTER TABLE public\.partner_settlement_snapshots ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/partner TEXT PRIMARY KEY/)
  })

  it("is probed as a warning so a missing table never blocks the quote workflow", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probes = SCHEMA_PROBES.filter((probe) => probe.migration === FILE)
    expect(probes).toHaveLength(1)
    expect(probes[0].severity).toBe("warning")
  })
})
