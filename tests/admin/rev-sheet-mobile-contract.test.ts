import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "app/admin/crm/deals/rev-sheet/page.tsx"),
  "utf8"
)

describe("REV sheet mobile interaction contract", () => {
  it("keeps interactive controls touch-safe with visible keyboard focus", () => {
    expect(source).toContain("[&_button]:min-h-11")
    expect(source).toContain("[&_section_a]:min-h-11")
    expect(source).toContain("[&_input:not([type=checkbox]):not([type=file])]:min-h-11")
    expect(source).toContain("[&_select]:min-h-11")
    expect(source).toContain("focus-visible:ring-2")
  })

  it("limits the mobile DOM without silently hiding the remaining review queue", () => {
    expect(source).toContain("const MOBILE_VISIBLE_ROWS = 25")
    expect(source).toContain("visibleRows.slice(0, MOBILE_VISIBLE_ROWS)")
    expect(source).toContain("나머지")
    expect(source).toContain("검색·필터로 좁혀 확인하세요")
  })

  it("announces operation outcomes", () => {
    expect(source).toContain('role="status"')
    expect(source).toContain('role="alert"')
  })
})
