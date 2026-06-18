import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery, handleChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

function enableMockGemini() {
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
}

describe("chatbot public answer policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("serves curated direct answers from the vetted template without calling Gemini", async () => {
    disableExternalChatbotServices()
    enableMockGemini()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "GEMINI가 재작성하면 안 됨" }] } }],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("전자칠판 스펙 알려줘")

    // 큐레이션 직답은 손으로 다듬은 템플릿 그대로 — Gemini 재작성(0.8~4.5s)을 건너뛴다.
    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("S75")
    expect(result.answer).not.toContain("GEMINI가 재작성하면 안 됨")
    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":generateContent")
    )
    expect(generationCalls).toHaveLength(0)
  })

  it("caches sessionless answers so an identical repeat skips Gemini", async () => {
    disableExternalChatbotServices()
    enableMockGemini()

    let generationCount = 0
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes(":generateContent")) generationCount += 1
      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: "클래스인은 수업 준비·진행·녹화·복습을 한 흐름으로 묶는 수업 운영 솔루션이에요." },
                ],
              },
            },
          ],
        }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const question = "클래스인으로 플립러닝 수업도 잘 되나 궁금해요"
    const first = await evaluateChatbotQuery(question)
    const second = await evaluateChatbotQuery(question)

    expect(first.answer).toBe(second.answer)
    expect(generationCount).toBe(1) // 두 번째는 답변 캐시 적중 → Gemini 재호출 없음
  })

  it("answers casual board lineup questions without update-doc or image-link leakage", async () => {
    disableExternalChatbotServices()
    enableMockGemini()

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    "Classin 칠판은 보통 Classin Board 전자칠판 라인업을 말합니다. S75, S86, S98 Pro, S110을 교실 크기와 시야 기준으로 고르면 됩니다.\n![image_1](https://example.com/board.png)\nhttps://example.com/board.png",
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await handleChatbotQuery({
      message: "클래스인 칠판 어떤거 있지",
      context: { channel: "web" },
    })

    expect(result.answerMode).toBe("direct_answer")
    expect(result.sources).toHaveLength(0)
    expect(result.answer).toContain("Classin Board")
    expect(result.answer).toContain("S75")
    expect(result.answer).not.toMatch(/6\.0\.[78]|AI\s*칠판|업데이트|릴리즈/i)
    expect(result.answer).not.toMatch(/https?:\/\/|!\[|\.png|\.webp|출처|문서/i)
    expect(result.suggestedQuestions.join(" ")).not.toMatch(/6\.0\.[78]|AI\s*칠판|업데이트|릴리즈|문서/i)
  })
})
