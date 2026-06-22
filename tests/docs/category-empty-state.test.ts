import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("docs category empty state", () => {
  const source = readFileSync(
    join(process.cwd(), "app/docs/[category]/page.tsx"),
    "utf8"
  )

  it("offers recovery paths when a category search has no results", () => {
    expect(source).toContain("전체 가이드에서 다시 검색")
    expect(source).toContain("상담 남기기")
    expect(source).toContain("DOCS_CONTACT_HREF")
    expect(source).toContain("계정/접속/기술 지원")
  })
})
