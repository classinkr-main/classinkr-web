import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

interface GoldenCase {
  id: string
  question: string
  expectCategory: string
  expectHeadingIncludes?: string
  expectSources?: boolean
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

  it("locks policy-critical pre-adoption questions to the checked FAQ source", () => {
    const ids = [
      "pre-adoption-server-location",
      "pre-adoption-privacy-processing",
      "pre-adoption-content-ownership",
      "pre-adoption-storage-quota-price",
      "pre-adoption-admin-rights",
      "pre-adoption-pen-tip",
    ]

    for (const id of ids) {
      const testCase = cases.find((candidate) => candidate.id === id)

      expect(testCase?.expectHeadingIncludes).toBe("확인 필요한 정책·계약 항목")
    }
  })

  it("covers ChannelTalk-derived buyer and support questions", () => {
    const ids = new Set(cases.map((testCase) => testCase.id))

    expect(ids).toContain("channel-google-classroom-scale")
    expect(ids).toContain("channel-site-entry-button")
    expect(ids).toContain("channel-s65-quote")
    expect(ids).toContain("channel-board-only-sale")
    expect(ids).toContain("channel-platform-in-board")
    expect(ids).toContain("channel-camera-one-user")
  })

  it("covers public self-knowledge and conversation-data questions", () => {
    const selfKnowledgeCases = cases.filter((testCase) => testCase.expectCategory === "general")

    expect(selfKnowledgeCases.some((testCase) => testCase.id === "self-identity-role")).toBe(true)
    expect(selfKnowledgeCases.some((testCase) => testCase.id === "self-conversation-data-use")).toBe(true)
  })

  it("marks self-knowledge direct answers as source-optional", () => {
    const ids = ["self-identity-role", "self-conversation-data-use"]

    for (const id of ids) {
      const testCase = cases.find((candidate) => candidate.id === id)

      expect(testCase?.expectSources).toBe(false)
    }
  })

  it("covers new hardware & software packaging FAQ golden cases", () => {
    const hwCase = cases.find((candidate) => candidate.id === "hardware-board-specs")
    const swCase = cases.find((candidate) => candidate.id === "value-cost-included")

    expect(hwCase).toBeDefined()
    expect(swCase).toBeDefined()
    expect(hwCase?.expectCategory).toBe("hardware")
    expect(swCase?.expectCategory).toBe("billing")
  })
})
