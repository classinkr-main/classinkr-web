import { describe, expect, it } from "vitest"

import { isDocCategoryId } from "@/lib/docs"

describe("docs category support", () => {
  it("accepts legacy docs-center categories used by live Supabase articles", () => {
    expect(isDocCategoryId("updates")).toBe(true)
    expect(isDocCategoryId("guides")).toBe(true)
    expect(isDocCategoryId("troubleshooting")).toBe(true)
  })

  it("keeps current role-based categories valid", () => {
    expect(isDocCategoryId("start")).toBe(true)
    expect(isDocCategoryId("teacher")).toBe(true)
    expect(isDocCategoryId("board")).toBe(true)
  })
})
