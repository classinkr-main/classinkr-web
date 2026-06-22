// tests/chatbot/pricing-guardrail.test.ts
import { describe, expect, it } from "vitest"

import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { PRICE_COMPOSITION_ITEMS } from "@/lib/chatbot/pricing-policy"

describe("pricing guardrail", () => {
  it("does not itemize OPS as a price component", () => {
    expect(PRICE_COMPOSITION_ITEMS.some((item) => /OPS/i.test(item))).toBe(false)
  })

  it("price principle drops OPS and routes the final quote to consultation", () => {
    const principles = CLASSIN_POSITIONING.chatbot.answerPrinciples
    const pricePrinciple = principles.find((p) => p.includes("가격"))
    expect(pricePrinciple).toBeDefined()
    expect(pricePrinciple).not.toMatch(/OPS/i)
    expect(pricePrinciple).toContain("상담")
  })

  it("still presents OPS as a built-in strength somewhere", () => {
    const principles = CLASSIN_POSITIONING.chatbot.answerPrinciples
    expect(principles.some((p) => /OPS/i.test(p) && p.includes("내장"))).toBe(true)
  })
})
