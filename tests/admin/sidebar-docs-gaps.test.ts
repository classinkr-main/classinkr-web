import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("admin sidebar docs gap discoverability", () => {
  const source = readFileSync(
    join(process.cwd(), "components/admin/AdminSidebar.tsx"),
    "utf8"
  )

  it("exposes the docs gap queue as a first-class growth navigation item", () => {
    expect(source).toContain('/admin/docs/gaps')
    expect(source).toContain('문서 보강 큐')
  })

  it("warms alpha readiness data when the gap queue nav item is hovered", () => {
    expect(source).toContain('"/admin/docs/gaps"')
    expect(source).toContain('/api/admin/docs/alpha-readiness')
    expect(source).toContain('/api/admin/docs/gaps')
  })
})
