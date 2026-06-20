import { describe, expect, it } from "vitest"

import { clampAnswerToLength } from "@/lib/chatbot/llm"
import { buildDocSuggestionSummary, lastSafeBoundary } from "@/lib/chatbot/service"

// service.ts isUsableGeneratedAnswer 의 종결 검사와 동일한 정규식 — 잘린 답변이 사용 가능 판정을
// 통과하는지(=폴백으로 버려지지 않는지) 확인하기 위해 그대로 복제한다.
const USABLE_ENDING = /(?:[.!?]|。|요|니다|습니다|합니다|세요)$/

describe("clampAnswerToLength", () => {
  it("returns short answers unchanged", () => {
    const short = "클래스인은 수업 운영을 돕습니다."
    expect(clampAnswerToLength(short, 520)).toBe(short)
  })

  it("trims an over-length answer at a sentence boundary so it stays usable", () => {
    const sentence = "클래스인은 학원 수업 운영을 한 흐름으로 묶어 줍니다. "
    const long = sentence.repeat(40) // ~1000+ chars, well over the cap
    const result = clampAnswerToLength(long, 520)

    expect(result.length).toBeLessThanOrEqual(520)
    expect(result.length).toBeGreaterThanOrEqual(520 * 0.6)
    expect(result.endsWith("다.")).toBe(true)
    // 핵심: 이전 raw slice 와 달리, 잘린 결과가 사용 가능 판정(종결 검사)을 통과한다.
    expect(USABLE_ENDING.test(result.trim())).toBe(true)
  })

  it("falls back to the last whitespace when there is no sentence boundary in range", () => {
    const long = "가나다 ".repeat(300) // 공백은 있으나 문장 종결부호는 없음
    const result = clampAnswerToLength(long, 520)

    expect(result.length).toBeLessThanOrEqual(520)
    expect(result.length).toBeLessThan(long.length)
    expect(result.startsWith(" ")).toBe(false)
    expect(result.endsWith(" ")).toBe(false)
  })

  it("hard-cuts at the cap when there is neither a boundary nor whitespace", () => {
    const long = "가".repeat(700)
    const result = clampAnswerToLength(long, 520)
    expect(result.length).toBe(520)
  })
})

describe("buildDocSuggestionSummary", () => {
  it("adds a warm lead and keeps the heading when it is meaningful", () => {
    const result = buildDocSuggestionSummary(
      "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.",
      "요금 안내",
      { isMetaHeading: false, excerptStartsWithHeading: false }
    )

    expect(result.startsWith("관련 안내를 정리해드리면,")).toBe(true)
    expect(result).toContain("요금 안내: 첫 문장입니다. 둘째 문장입니다.")
    // 최대 2문장만 남기므로 셋째 문장은 빠진다.
    expect(result).not.toContain("셋째")
  })

  it("drops the heading prefix when the excerpt already echoes it", () => {
    const result = buildDocSuggestionSummary(
      "요금 안내 첫 문장입니다.",
      "요금 안내",
      { isMetaHeading: false, excerptStartsWithHeading: true }
    )

    expect(result.startsWith("관련 안내를 정리해드리면,")).toBe(true)
    expect(result).not.toContain("요금 안내:")
  })

  it("drops the heading prefix for meta headings", () => {
    const result = buildDocSuggestionSummary(
      "본문 첫 문장입니다.",
      "이 문서는 지도입니다",
      { isMetaHeading: true, excerptStartsWithHeading: false }
    )

    expect(result).not.toContain("이 문서는 지도입니다:")
    expect(result).toContain("본문 첫 문장입니다.")
  })

  it("keeps the full excerpt when it has no sentence terminator", () => {
    const result = buildDocSuggestionSummary(
      "종결부호 없는 발췌",
      "제목",
      { isMetaHeading: false, excerptStartsWithHeading: false }
    )

    expect(result).toContain("제목: 종결부호 없는 발췌")
  })
})

describe("lastSafeBoundary", () => {
  it("returns the index after the last whitespace so partial words are held back", () => {
    expect(lastSafeBoundary("클래스인은 수업")).toBe("클래스인은 ".length)
    expect(lastSafeBoundary("클래스인은 수업 운영을")).toBe("클래스인은 수업 ".length)
  })

  it("returns 0 when there is no whitespace boundary yet", () => {
    expect(lastSafeBoundary("클래스인")).toBe(0)
    expect(lastSafeBoundary("")).toBe(0)
  })
})
