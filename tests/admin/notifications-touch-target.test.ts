import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "components/admin/AdminNotificationsBell.tsx"),
  "utf8"
)

describe("admin notification controls", () => {
  it("keeps the shell bell and panel actions touch-safe and keyboard-visible", () => {
    expect(source).not.toContain("relative flex h-8 w-8 items-center justify-center rounded-md")
    expect(source.match(/relative flex h-11 w-11 items-center justify-center rounded-md/g)?.length).toBe(2)
    expect(source).toContain("inline-flex min-h-11 items-center")
    expect(source).toContain("flex h-11 w-11 items-center justify-center rounded-full")
    expect(source).toContain("focus-visible:ring-2")
  })
})
