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

// 2026-11-20 조사 G12: 숫자 뒤 마침표("1.5배"의 "1.", "6.0.7", 목록 번호 "8.")를 문장 끝으로 보고 잘라
// "…보다 1.", "6.0.", "\n8." 로 끝나는 답이 나왔다. 문장 끝은 숫자 뒤가 아니고, 뒤가 공백이거나 글의 끝인 자리다.
describe("clampAnswerToLength around numbers, versions, lists and URLs", () => {
  const filler = "클래스인은 수업 전후 흐름을 한곳에서 관리하도록 돕습니다. "

  it("does not cut inside a decimal such as 1.5배", () => {
    const text = `${filler.repeat(9)}녹화 화질을 올리면 저장 용량이 기본 설정보다 1.5배 정도 늘어납니다. ${filler.repeat(3)}`
    const cut = text.indexOf("1.5배") + 2 // "…보다 1." 바로 뒤
    const result = clampAnswerToLength(text, cut)
    expect(result.endsWith("1.")).toBe(false)
    expect(result.endsWith("돕습니다.")).toBe(true)
    expect(USABLE_ENDING.test(result)).toBe(true)
  })

  it("does not cut inside a version number", () => {
    const text = `${filler.repeat(9)}앱 버전 6.0.7 이상에서는 판서 저장이 자동으로 켜집니다. ${filler.repeat(3)}`
    for (const cutAfter of ["버전 6.", "버전 6.0."]) {
      const result = clampAnswerToLength(text, text.indexOf(cutAfter) + cutAfter.length)
      expect(result, cutAfter).not.toMatch(/\d\.$/)
      expect(result.endsWith("돕습니다.")).toBe(true)
    }
  })

  it("does not end on a bare list number line", () => {
    const steps = Array.from({ length: 9 }, (_, index) => `${index + 1}. 설정 화면에서 ${index + 1}번째 항목을 확인하고 저장합니다.`)
    const text = `순서는 이렇습니다.\n${steps.join("\n")}`
    const cut = text.indexOf("\n8.") + 3 // "\n8." 까지만 창에 들어온다
    const result = clampAnswerToLength(text, cut)
    expect(result).not.toMatch(/\n\s*\d+\.\s*$/)
    expect(result.endsWith("7번째 항목을 확인하고 저장합니다.")).toBe(true)
  })

  it("keeps a URL whole instead of cutting at its dots", () => {
    const text = `${filler.repeat(9)}설치 파일은 www.classin.com/download 에서 받을 수 있습니다. ${filler.repeat(3)}`
    const result = clampAnswerToLength(text, text.indexOf("classin.com") + "classin.".length)
    expect(result).not.toContain("www.classin.")
    expect(result.endsWith("돕습니다.")).toBe(true)
  })

  it("drops a dangling numbered line left by the whitespace fallback", () => {
    // 문장 끝이 없어 마지막 공백에서 자르면 "…\n8." 이 남는 글.
    const text = `${"가나다 ".repeat(127)}\n8. ${"라마바".repeat(40)}`
    const result = clampAnswerToLength(text, 520)
    expect(result).not.toMatch(/\d\.?$/)
    expect(result.endsWith("가나다")).toBe(true)
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
