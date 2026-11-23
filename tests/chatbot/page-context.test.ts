import { describe, expect, it } from "vitest"

import { resolvePageContext, mergeStarters } from "@/lib/chatbot/page-context"

describe("resolvePageContext", () => {
  it("prioritizes beginner, support and showroom questions on the home page", () => {
    const ctx = resolvePageContext("/")
    expect(ctx.key).toBe("home")
    expect(ctx.teaserEligible).toBe(true)
    expect(ctx.welcome).toContain("클래스인이 어떤 서비스인지")
    expect(mergeStarters(ctx.starters, ["다른 추천 질문"], 4)).toEqual([
      "클래스인이 뭐예요?",
      "우리 학원에서는 어떻게 써요?",
      "사용 중 문제가 생겼어요",
      "쇼룸 방문이 가능한가요?",
    ])
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

describe("home starters", () => {
  it("shows a plain-language intro chip first (the widget shows the first four)", () => {
    const starters = resolvePageContext("/").starters
    expect(starters[0]).toBe("클래스인이 뭐예요?")
    expect(starters.slice(0, 4).some((starter) => /EDB|LMS/.test(starter))).toBe(false)
  })
})
