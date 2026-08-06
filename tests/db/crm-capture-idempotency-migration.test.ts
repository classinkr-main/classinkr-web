import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260806_crm_capture_idempotency.sql"),
  "utf8"
)

describe("CRM capture idempotency migration", () => {
  it("uniquely identifies one capture event per source row", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS crm_customer_events_capture_source_uidx/i)
    expect(migration).toContain("(source_type, source_id)")
    expect(migration).toContain("source_type = 'sheet'")
    expect(migration).toContain("source_id LIKE 'capture:%'")
  })
})
