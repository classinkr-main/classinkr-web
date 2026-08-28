import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(resolve(process.cwd(), "lib/admin-crm-duplicate-preflight.ts"), "utf8")

describe("CRM duplicate preflight pagination order", () => {
  it("external snapshot scan selects and orders by a deterministic row id tie-breaker", () => {
    expect(source).toContain('.select("id, source_system, object_api_key, external_id")')
    expect(source).toContain('.order("synced_at", { ascending: false })')
  })

  it("source-link scans break updated_at ties with the row id", () => {
    expect(source.match(/\.order\("updated_at", \{ ascending: false \}\)/g)).toHaveLength(2)
    expect(source.match(/\.order\("id", \{ ascending: false \}\)/g)).toHaveLength(3)
  })
})
