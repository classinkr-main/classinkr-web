import { describe, expect, it } from "vitest"

import {
  __scoreDocsChunkKeywordsForTests,
  scoreSymptomMatches,
  type ChatbotSource,
} from "@/lib/chatbot/service"

function source(title: string): Omit<ChatbotSource, "score"> {
  return {
    title,
    heading: "요약",
    urlPath: `/docs/start/${title}`,
    category: "troubleshooting",
    excerpt: "수업 중 문제가 생겼을 때 확인할 순서입니다.",
  }
}

const sharedContent = "수업 중 문제가 생겼을 때 확인할 순서입니다."

describe("scoreSymptomMatches", () => {
  it("returns 0 for rows without symptoms", () => {
    expect(scoreSymptomMatches(["소리가", "나요"], null)).toBe(0)
    expect(scoreSymptomMatches(["소리가", "나요"], { keywords: ["소리"] })).toBe(0)
    expect(scoreSymptomMatches(["소리가", "나요"], { symptoms: [] })).toBe(0)
  })

  it("boosts once per distinct matched symptom, tolerating Korean particles", () => {
    const metadata = { symptoms: ["소리 안 남", "소리 안 남", "접속 안 됨"] }
    expect(scoreSymptomMatches(["소리가", "나요"], metadata)).toBe(6)
  })

  it("requires two matching words for multi-word symptoms", () => {
    const metadata = { symptoms: ["화면 공유 안 됨"] }
    expect(scoreSymptomMatches(["화면이", "검게"], metadata)).toBe(0)
    expect(scoreSymptomMatches(["화면", "공유가"], metadata)).toBe(6)
  })

  it("caps the boost", () => {
    const metadata = { symptoms: ["끊김", "잡음", "울림", "지연", "에코"] }
    expect(scoreSymptomMatches(["끊김", "잡음이", "울림", "지연", "에코"], metadata)).toBe(18)
  })
})

describe("docs chunk keyword scoring with symptoms", () => {
  it("ranks the row whose symptoms match above an otherwise identical row", () => {
    const question = "수업 중에 소리가 안 들려요"
    const withSymptoms = __scoreDocsChunkKeywordsForTests(question, source("a"), {
      content: sharedContent,
      metadata: { keywords: ["오디오"], symptoms: ["소리 안 남"] },
    })
    const withoutSymptoms = __scoreDocsChunkKeywordsForTests(question, source("a"), {
      content: sharedContent,
      metadata: { keywords: ["오디오"] },
    })

    expect(withSymptoms).toBeGreaterThan(withoutSymptoms)
    expect(withSymptoms - withoutSymptoms).toBeLessThanOrEqual(18 + 8)
  })

  it("does not change scores for rows whose symptoms do not match the question", () => {
    const question = "수업 중에 소리가 안 들려요"
    const unrelated = __scoreDocsChunkKeywordsForTests(question, source("a"), {
      content: sharedContent,
      metadata: { symptoms: ["결제 실패"] },
    })
    const none = __scoreDocsChunkKeywordsForTests(question, source("a"), {
      content: sharedContent,
      metadata: {},
    })
    expect(unrelated).toBe(none)
  })
})
