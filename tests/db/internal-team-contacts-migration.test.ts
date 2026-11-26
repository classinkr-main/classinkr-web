import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { SCHEMA_CONTRACT_MIGRATIONS, SCHEMA_PROBES } from "@/lib/db/schema-contract"

const FILE = "supabase/migrations/20261126_internal_team_contacts.sql"
const ROLLBACK = "supabase/rollbacks/20261126_internal_team_contacts.rollback.sql"
const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/--[^\n]*/g, "")
const sql = read(FILE)

describe("internal_team_contacts migration", () => {
  it("keeps the contact table service-role only (RLS on, no policy, anon/authenticated revoked)", () => {
    expect(sql).toMatch(/ALTER TABLE public\.internal_team_contacts ENABLE ROW LEVEL SECURITY/i)
    expect(sql).not.toMatch(/CREATE POLICY|DISABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/REVOKE ALL ON public\.internal_team_contacts FROM anon, authenticated/i)
    expect(sql).not.toMatch(/GRANT[^;]*\bTO\s+(?:anon|authenticated)\b/i)
  })

  it("is idempotent (guarded create, constraints dropped before re-adding, guarded trigger)", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.internal_team_contacts/)
    const added = [...sql.matchAll(/ADD CONSTRAINT (\w+)/g)].map((match) => match[1])
    expect(added.length).toBeGreaterThan(0)
    for (const name of added) expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${name}`)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS internal_team_contacts_active_area_uniq[\s\S]*WHERE active/)
    expect(sql).toMatch(/DROP TRIGGER IF EXISTS internal_team_contacts_updated_at/)
  })

  it("has the agreed columns and no phone/email value column", () => {
    for (const column of ["org", "area", "role", "name", "deputy", "channel", "prep", "admin_link", "note", "confirmed_at", "confirmed_by", "active", "sort_order", "created_at", "updated_at"]) {
      expect(sql, column).toMatch(new RegExp(`\\n\\s+${column}\\s+[A-Z]`))
    }
    expect(sql).not.toMatch(/\b(?:phone|email|tel|mobile)\b/i)
    expect(sql).toMatch(/CHECK \(org IN \('KR', 'HQ'\)\)/)
  })

  it("has a rollback pair and a warning probe", () => {
    expect(existsSync(join(process.cwd(), ROLLBACK))).toBe(true)
    expect(read(ROLLBACK)).toMatch(/drop table if exists public\.internal_team_contacts/i)
    expect(SCHEMA_CONTRACT_MIGRATIONS).toContain(FILE)
    const probes = SCHEMA_PROBES.filter((probe) => probe.migration === FILE)
    expect(probes).toHaveLength(1)
    expect(probes[0].severity).toBe("warning")
  })
})
