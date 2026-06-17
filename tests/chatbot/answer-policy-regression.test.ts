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

  it("uses Gemini as the final answer writer for structured direct answers", async () => {
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
                    "Classin Board 전자칠판은 4K 화면, OPS, 터치, 수업 녹화 흐름을 함께 보는 장비입니다. 교실 크기에 따라 S75, S86, S98 Pro, S110 중에서 먼저 좁히면 됩니다.",
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("전자칠판 스펙 알려줘")

    expect(result.answer).toContain("Classin Board 전자칠판")
    expect(result.answer).toContain("S110")
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/models/gemini-3.5-flash:generateContent?key=test-gemini-key"),
      expect.objectContaining({ method: "POST" })
    )
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
