import { describe, expect, it } from "vitest"

import { resolveXiaoshouyiOrderBy } from "@/lib/external-crm/sync-query"

describe("resolveXiaoshouyiOrderBy", () => {
  it("adds id as a deterministic tie-breaker for offset pagination", () => {
    expect(resolveXiaoshouyiOrderBy(["id", "updatedAt"], "updatedAt DESC")).toBe(
      "updatedAt DESC, id DESC"
    )
  })

  it("does not duplicate an explicitly configured id order", () => {
    expect(resolveXiaoshouyiOrderBy(["id", "updatedAt"], "updatedAt DESC, id ASC")).toBe(
      "updatedAt DESC, id ASC"
    )
  })

  it("uses id alone when the object has no updatedAt field", () => {
    expect(resolveXiaoshouyiOrderBy(["id", "name"])).toBe("id DESC")
  })
})
