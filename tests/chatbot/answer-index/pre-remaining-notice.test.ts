import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

import { resetRouterAnswerIndex } from "@/lib/chatbot/answer-index"
import { __clearAnswerCacheForTests, evaluateChatbotQuery } from "@/lib/chatbot/service"

/**
 * R2 B5(계획 §2.4): compiled 라우터에서 색인 앞단(즉시 상담·이미 해 봄·시험 정답 거절)이 메시지 전체를 맡았는데 다른 질문을 함께 했으면,
 * 그 질문만 따로 물었을 때 답이 나오는 조각마다 머리 줄 + 알림 한 줄을 정해 둔 답 끝에 붙인다. legacy 라우터 답은 바뀌지 않는다.
 * 저장소 자료(data/answer-index)로 잰다. 시험 글은 새로 썼다.
 */

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

beforeEach(() => {
  __clearAnswerCacheForTests()
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.stubEnv("ANSWER_INDEX_DATA_DIR", undefined)
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("network disabled in pre-notice test")
    })
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

afterAll(() => {
  resetRouterAnswerIndex()
  vi.restoreAllMocks()
})

describe("B5 compiled router: notice for the pieces a front-door answer did not cover", () => {
  it("adds one notice line per piece that would be answered alone, and only on the compiled router", async () => {
    const question = "상담원 연결해 주세요. 그리고 녹화본은 어디서 다시 봐요?"
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const compiled = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(compiled.answerMode).toBe("handoff")
    // 머리 꼴은 복합 답과 같다(R3, CHATBOT_COMPOUND_HEAD): 기본은 질문 순서 번호, bracket 이면 【이름】.
    expect(compiled.answer).toMatch(/\n\n2\. [^\n]+\n이 내용은 따로 한 번 더 물어봐 주세요\.$/)
    expect(compiled.suggestedQuestions[0]).toBe("녹화본은 어디서 다시 봐요?")
    vi.stubEnv("CHATBOT_COMPOUND_HEAD", "bracket")
    __clearAnswerCacheForTests()
    const bracket = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(bracket.answer).toMatch(/\n\n【[^】]+】\n이 내용은 따로 한 번 더 물어봐 주세요\.$/)
    vi.stubEnv("CHATBOT_COMPOUND_HEAD", undefined)
    const single = await evaluateChatbotQuery("상담원 연결해 주세요", { generateAnswer: false })
    expect(single.answer).not.toContain("이 내용은 따로 한 번 더 물어봐 주세요.")
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "legacy")
    __clearAnswerCacheForTests()
    const legacy = await evaluateChatbotQuery(question, { generateAnswer: false })
    expect(legacy.answer).not.toContain("【")
    expect(legacy.answer).not.toContain("이 내용은 따로 한 번 더 물어봐 주세요.")
  }, 120_000)
})

describe("B5 compiled router: no notice when nothing else is asked or the other piece is not found", () => {
  it("keeps the tried-already answer alone when the other question has no card", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const result = await evaluateChatbotQuery("재부팅 다 해 봤는데 계속 튕겨요 짜증나요. 숙제 마감은 어디서 바꿔요?", { generateAnswer: false })
    expect(result.answerMode).toBe("handoff")
    expect(result.answer).not.toContain("이 내용은 따로 한 번 더 물어봐 주세요.")
  }, 120_000)

  it("adds the notice after the tried-already answer when the other question is answered alone", async () => {
    vi.stubEnv("CHATBOT_ANSWER_ROUTER", "compiled")
    const result = await evaluateChatbotQuery("다 해 봤는데 계속 끊겨요 짜증나요. 녹화본은 어디서 봐요?", { generateAnswer: false })
    expect(result.answer).toContain("같은 안내를 또 드리지 않을게요")
    expect(result.answer).toMatch(/\n\n2\. [^\n]+\n이 내용은 따로 한 번 더 물어봐 주세요\.$/)
  }, 120_000)
})
