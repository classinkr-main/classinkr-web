import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin command palette discoverability", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/AdminCommandPalette.tsx"),
    "utf8"
  )

  it("exposes the docs gap queue as an alpha operations route", () => {
    expect(source).toContain("/admin/docs/gaps")
    expect(source).toContain("문서 보강 큐")
  })
})
