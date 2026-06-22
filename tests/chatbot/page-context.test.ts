import { describe, expect, it } from "vitest"

import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"

describe("resolvePageContext", () => {
  it("returns the home context for '/'", () => {
    const ctx = resolvePageContext("/")
    expect(ctx.key).toBe("home")
    expect(ctx.teaserEligible).toBe(true)
    expect(ctx.starters.length).toBeGreaterThan(0)
  })

  it("matches product and docs by prefix", () => {
    expect(resolvePageContext("/product/hw").key).toBe("product")
    expect(resolvePageContext("/docs/getting-started/setup").key).toBe("docs")
    expect(resolvePageContext("/contact").key).toBe("contact")
  })

  it("falls back to a non-eligible default for unknown paths", () => {
    const ctx = resolvePageContext("/some/unknown/page")
    expect(ctx.key).toBe("default")
    expect(ctx.teaserEligible).toBe(false)
  })

  it("treats null pathname as default", () => {
    expect(resolvePageContext(null).key).toBe("default")
  })

  it("never itemizes a final price in teaser copy", () => {
    for (const path of ["/", "/product/hw", "/contact", "/docs/x"]) {
      expect(resolvePageContext(path).teaser).not.toMatch(/원\b|₩|\d{3,}/)
    }
  })
})

describe("mergeStarters", () => {
  it("puts page starters first, then fills with dynamic ones, deduped, capped", () => {
    const merged = mergeStarters(["A", "B"], ["B", "C", "D", "E"], 4)
    expect(merged).toEqual(["A", "B", "C", "D"])
  })

  it("drops empties and trims", () => {
    expect(mergeStarters([" A ", ""], ["A", "  "], 4)).toEqual(["A"])
  })
})
