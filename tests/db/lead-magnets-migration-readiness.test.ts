import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260818_lead_magnets.sql"),
  "utf8"
)

describe("lead_magnets migration readiness", () => {
  it("is replay-safe and establishes the import conflict key", () => {
    expect(migration).toMatch(/create table if not exists public\.lead_magnets/i)
    expect(migration).toMatch(/slug\s+text\s+primary key/i)
    expect(migration).toMatch(/data\s+jsonb\s+not null/i)
    expect(migration).toMatch(/drop trigger if exists trg_lead_magnets_updated_at/i)
  })

  it("enables deny-by-default RLS without public grants", () => {
    expect(migration).toMatch(/alter table public\.lead_magnets enable row level security/i)
    expect(migration).not.toMatch(/grant\s+.*\s+to\s+(?:anon|authenticated|public)/i)
    expect(migration).not.toMatch(/create policy/i)
  })
})
