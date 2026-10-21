import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261021_quote_team_templates.sql"
const sql = readFileSync(join(process.cwd(), FILE), "utf8").replace(/--[^\n]*/g, "")

describe("quote team templates migration", () => {
  it("keeps saved quote configurations inaccessible to direct client sessions", () => {
    expect(sql).toMatch(/ALTER TABLE public\.quote_team_templates ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY/i)
  })

  it("guards supplier type, visibility and configuration shape at the database boundary", () => {
    expect(sql).toContain("product_line IN ('hardware', 'software')")
    expect(sql).toContain("scope IN ('mine', 'team')")
    expect(sql).toContain("jsonb_typeof(items) = 'array'")
    expect(sql).toContain("jsonb_array_length(items) BETWEEN 1 AND 30")
    expect(sql).toContain("jsonb_typeof(defaults) = 'object'")
  })

  it("checks table readiness without blocking the existing base quote workflow", () => {
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probe = SCHEMA_PROBES.find((entry) => entry.migration === FILE)
    expect(probe).toMatchObject({ kind: "table", table: "quote_team_templates", severity: "warning" })
    if (probe?.kind !== "table") throw new Error("Missing table readiness probe")
    expect(probe.columns).toEqual(expect.arrayContaining([
      "items", "defaults", "scope", "owner_user_id", "archived_at", "updated_at",
    ]))
  })
})
