import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const launcher = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmCommandPaletteLauncher.tsx"),
  "utf8"
)
const palette = readFileSync(
  join(process.cwd(), "components/admin/crm/CrmCommandPalette.tsx"),
  "utf8"
)

describe("CRM command palette first-open handoff", () => {
  it("mounts the lazy palette already open instead of redispatching a racy event", () => {
    expect(launcher).toContain("<Palette initiallyOpen />")
    expect(launcher).not.toContain('window.dispatchEvent(new Event("admin:open-command-palette"))')
    expect(palette).toContain("useState(initiallyOpen)")
  })
})
