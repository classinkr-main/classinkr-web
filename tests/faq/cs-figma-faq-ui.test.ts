import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

describe("public FAQ CS Figma UI", () => {
  const source = readFileSync(
    join(process.cwd(), "components/sections/FAQ.tsx"),
    "utf8"
  )

  it("renders related guide links for Figma-derived usage answers", () => {
    expect(source).toContain("guideHref")
    expect(source).toContain("3단계 가이드 보기")
  })
})
