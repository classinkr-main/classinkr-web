import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"
import {
  attachGroundingText,
  getGroundingText,
  MAX_GROUNDING_TEXT_LENGTH,
  trimToCompleteSentences,
} from "@/lib/chatbot/source-grounding"

import { stubEvidenceSelection } from "./helpers/final-answer-llm"

// 2026-11-13: 최종 답변 모델에게 220자로 잘린 요약 조각만 넘어가, 끊긴 뒷부분과 빠진 단계를 모델이 지어냈다.
// 문서 본문을 문장이 온전한 채로 모델에 넘기되, 공개 응답에는 실리지 않게 한다.
describe("chatbot source grounding text", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("keeps short text as is and drops a dangling tail after an ellipsis", () => {
    expect(trimToCompleteSentences("숙제는 [숙제 제출]까지 눌러야 제출됩니다.")).toBe("숙제는 [숙제 제출]까지 눌러야 제출됩니다.")
    expect(
      trimToCompleteSentences("[초안 저장]은 저장만 될 뿐 제출이 아닙니다. 제출하면 '나의 숙제'에 보이고, 초록색 [제출...")
    ).toBe("[초안 저장]은 저장만 될 뿐 제출이 아닙니다.")
  })

  it("cuts long text at the last complete sentence without adding an ellipsis", () => {
    const sentence = "교사와 학생 모두 6.0.7 이상으로 업데이트합니다. "
    const trimmed = trimToCompleteSentences(sentence.repeat(60))

    expect(trimmed.length).toBeLessThanOrEqual(MAX_GROUNDING_TEXT_LENGTH)
    expect(trimmed.endsWith("업데이트합니다.")).toBe(true)
    expect(trimmed).not.toMatch(/\.\.\.|…/)
  })

  it("does not treat version numbers or list numbers as sentence ends", () => {
    expect(trimToCompleteSentences("앱을 6.0.7 이상으로 올립니다. 그다음 1. 설정을 열고 알림을 켜는...", 60)).toBe(
      "앱을 6.0.7 이상으로 올립니다."
    )
  })

  it("travels with object spread but stays out of JSON", () => {
    const source = attachGroundingText({ title: "문서", excerpt: "요약..." }, "본문 첫 문장입니다.   본문 둘째 문장입니다.")
    const copy = { ...source, score: 10 }

    expect(getGroundingText(copy)).toBe("본문 첫 문장입니다. 본문 둘째 문장입니다.")
    expect(JSON.stringify(copy)).toBe('{"title":"문서","excerpt":"요약...","score":10}')
    expect(getGroundingText(attachGroundingText({ title: "문서" }, "**녹화 수업**은 이미 있는 영상을 올리는 활동입니다."))).toBe(
      "녹화 수업은 이미 있는 영상을 올리는 활동입니다."
    )
    expect(getGroundingText({ title: "문서" })).toBeNull()
    expect(getGroundingText(attachGroundingText({ title: "문서" }, "   "))).toBeNull()
  })

  it("gives the model whole sentences from the document and keeps them out of the public sources", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
    vi.stubEnv("SUPABASE_SECRET_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")

    const { requests } = stubEvidenceSelection((text) => text.includes("[숙제 제출]까지 눌러야"))

    const result = await evaluateChatbotQuery("숙제를 사진으로 찍어서 내라는데 어떻게 올리는 거예요? 아이가 공책에 풀었어요.")
    const sentences = requests[0]?.sentences ?? []

    expect(sentences.length).toBeGreaterThan(5)
    // 요약(220자)에서 잘려 나가던 뒷문장이 모델에게는 온전한 문장으로 간다.
    expect(sentences.map((sentence) => sentence.text)).toContain(
      "제출하면 숙제 화면 '나의 숙제'에 내 제출 내용과 [숙제 역사]가 보이고, 초록색 [제출하기] 버튼이 그대로 있으면 아직 제출되지 않은 것입니다."
    )
    for (const sentence of sentences) {
      expect(sentence.text).not.toMatch(/(?:\.\.\.|…)$/)
    }

    // 공개 응답의 출처에는 220자 요약만 남는다(본문은 JSON 으로 나가지 않는다).
    const publicSources = JSON.stringify(result.sources)
    expect(publicSources).not.toContain("그대로 있으면 아직 제출되지 않은 것입니다")
    expect(result.sources.every((source) => source.excerpt.length <= 223)).toBe(true)
  })
})
