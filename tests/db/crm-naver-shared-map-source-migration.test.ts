import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260805_crm_naver_shared_map_source.sql"),
  "utf8"
)

describe("Naver shared-map CRM source migration", () => {
  it("registers the source as supporting and read-only", () => {
    expect(migration).toContain("'naver_shared_map'")
    expect(migration).toContain("'supporting'")
    expect(migration).toContain("'read_snapshot'")
    expect(migration).toContain("'disabled'")
    expect(migration).toMatch(/freshness_window_hours[\s\S]*168/)
  })

  it("keeps automatic confirmation disabled", () => {
    expect(migration).toMatch(/auto_confirm_enabled[\s\S]*false/)
    expect(migration).toContain("ON CONFLICT (source_system) DO UPDATE")
  })
})
