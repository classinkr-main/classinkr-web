import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

interface GoldenCase {
  id: string
  question: string
  expectCategory: string
  expectHeadingIncludes?: string
}

describe("chatbot golden set coverage", () => {
  const cases = JSON.parse(
    readFileSync(join(process.cwd(), "data/chatbot-golden-set.json"), "utf8")
  ).cases as GoldenCase[]

  it("keeps stable ids for every eval case", () => {
    const ids = cases.map((testCase) => testCase.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("covers admin operations that previously collapsed into classroom questions", () => {
    const adminCases = cases.filter((testCase) => testCase.expectCategory === "admin")

    expect(adminCases.length).toBeGreaterThanOrEqual(2)
    expect(adminCases.some((testCase) => testCase.question.includes("녹화 저장"))).toBe(true)
    expect(adminCases.some((testCase) => testCase.question.includes("스토리지"))).toBe(true)
  })

  it("locks the Zoom comparison case to the core positioning source heading", () => {
    const zoomCase = cases.find((testCase) => testCase.id === "identity-zoom-difference")

    expect(zoomCase?.expectCategory).toBe("onboarding")
    expect(zoomCase?.expectHeadingIncludes).toBe("핵심 포지셔닝")
  })
})
