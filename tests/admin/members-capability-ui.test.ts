import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "components/admin/settings/MembersPanel.tsx"),
  "utf8"
)

describe("Settings member capability controls", () => {
  it("shows management controls only for the server-verified SUPER_ADMIN viewer", () => {
    expect(source).toContain("data.viewer?.role.toUpperCase()")
    expect(source).toContain('=== "SUPER_ADMIN"')
    expect(source).toContain("canManageCapabilities ?")
  })

  it("persists capability arrays through the admin users PATCH contract", () => {
    expect(source).toContain('adminFetchJson<')
    expect(source).toContain('>("/api/admin/users", {')
    expect(source).toContain('method: "PATCH"')
    expect(source).toContain("JSON.stringify({ userId, capabilities })")
  })

  it("renders explicit saving, saved, and error states", () => {
    expect(source).toContain('{ status: "saving" }')
    expect(source).toContain('{ status: "saved" }')
    expect(source).toContain('status: "error"')
    expect(source).toContain('role="alert"')
  })
})
