import { afterEach, describe, expect, it, vi } from "vitest"

import { buildGenerationConfig, resolveModelChain } from "@/lib/chatbot/llm"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

function clearModelEnv() {
  vi.stubEnv("GEMINI_FAST_MODEL", "")
  vi.stubEnv("GEMINI_REASONING_MODEL", "")
  vi.stubEnv("GEMINI_MODEL", "")
}

// 2026-11-13: gemini-2.5 계열이 404 로 종료된 뒤 답변 재작성이 통째로 실패해 검색 초안이 그대로 나갔다.
// 종료된 모델이 기본값·env 어디에 있어도 답변 생성이 현행 모델로 이어지는지 고정한다.
describe("chatbot Gemini model chain", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("uses current models by default and ends with the rolling alias", () => {
    clearModelEnv()

    expect(resolveModelChain("basic")).toEqual([
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-flash-lite-latest",
    ])
    expect(resolveModelChain("reasoning")).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
    ])
    expect(resolveModelChain("advanced")).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-flash-lite-latest",
    ])
  })

  it("never puts a retired model in the default chain", () => {
    clearModelEnv()

    for (const tier of ["basic", "reasoning", "advanced"] as const) {
      for (const model of resolveModelChain(tier)) {
        expect(model, `${tier} chain`).not.toMatch(/gemini-(?:1\.5|2\.0|2\.5)/)
      }
    }
  })

  it("ignores retired models left in env and falls back to the current default", () => {
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-2.5-flash")
    vi.stubEnv("GEMINI_REASONING_MODEL", "gemini-2.5-pro")
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-pro")

    expect(resolveModelChain("basic")[0]).toBe("gemini-3.5-flash")
    expect(resolveModelChain("reasoning")[0]).toBe("gemini-3.1-pro-preview")
    expect(resolveModelChain("advanced")[0]).toBe("gemini-3.1-pro-preview")

    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-2.5-flash-lite")
    expect(resolveModelChain("basic")[0]).toBe("gemini-3.5-flash")
  })

  it("sends only a thinking level each model accepts", () => {
    // minimal 을 받는 모델(실측): 3.5/3.6-flash, lite 계열, 3-flash-preview.
    for (const model of [
      "gemini-3.5-flash",
      "gemini-3.6-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
      "gemini-3-flash-preview",
    ]) {
      expect(buildGenerationConfig(model, 0.2).thinkingConfig, model).toEqual({ thinkingLevel: "minimal" })
    }
    // minimal 을 400 으로 거부하는 모델은 모두가 받는 low 를 쓴다.
    for (const model of [
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-4-hydrogen",
      "gemini-3.1-pro-preview",
      "gemini-pro-latest",
    ]) {
      expect(buildGenerationConfig(model, 0.2).thinkingConfig, model).toEqual({ thinkingLevel: "low" })
    }
    expect(buildGenerationConfig("gemini-test-reasoning", 0.2).thinkingConfig).toBeUndefined()
  })

  it("keeps generating on the next model when the primary and fallback return 404", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    clearModelEnv()

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const target = String(url)
      if (!target.includes(":generateContent")) return { ok: true, json: async () => ({}) }
      if (target.includes("/models/gemini-flash-lite-latest:")) {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text:
                        "가능합니다. Classin은 실험 수업에서도 자료 공유, 판서, 녹화 복습 흐름을 묶어 운영할 수 있습니다.",
                    },
                  ],
                },
              },
            ],
          }),
        }
      }
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"code":404,"message":"This model is no longer available."}}',
        json: async () => ({}),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 실험 수업 운영도 가능해?")
    const generationCalls = fetchMock.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes(":generateContent"))

    expect(generationCalls).toHaveLength(3)
    expect(generationCalls[0]).toContain("/models/gemini-3.5-flash:generateContent")
    expect(generationCalls[1]).toContain("/models/gemini-3.1-flash-lite:generateContent")
    expect(generationCalls[2]).toContain("/models/gemini-flash-lite-latest:generateContent")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("실험 수업")
  })
})

// 근거가 약할 때(검색 점수가 낮은 문서뿐이거나 문서가 없을 때) 모델이 배경 종류·단축키 같은 세부를
// 지어내는 것을 실측으로 확인했다. 약한 문서 조각을 '검증 정보'로 넘기지 않고, 지어내지 말라는 요구를 붙인다.
describe("chatbot final answer prompt with weak grounding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function capturePrompt(question: string) {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    clearModelEnv()

    const prompts: string[] = []
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes(":generateContent")) {
        const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] }
        prompts.push(body.contents.at(-1)?.parts[0]?.text ?? "")
        return {
          ok: true,
          json: async () => ({
            candidates: [
              { content: { parts: [{ text: "이 내용은 공개 안내에서 확인되지 않았어요. Classin 수업 운영과 관련해 어떤 점이 궁금하신지 알려 주세요." }] } },
            ],
          }),
        }
      }
      return { ok: true, json: async () => ({}) }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery(question)
    return { prompt: prompts[0] ?? "", result }
  }

  it("withholds weak doc chunks and tells the model not to invent details", async () => {
    const { prompt, result } = await capturePrompt("클래스인 배경화면 뭐 있어요")

    expect(prompt).toContain("현재 응답 모드: doc_suggestion")
    expect(prompt).toContain("내부 검증 정보: 없음")
    expect(prompt).toContain("근거 없음 주의")
    expect(prompt).toContain("새로 지어내지 마")
    expect(result.answer).toContain("확인되지 않았어요")
  })

  it("keeps passing sources when the grounding is strong", async () => {
    const { prompt } = await capturePrompt("EDB 교안은 어떻게 재사용해요?")

    expect(prompt).toContain("현재 응답 모드: direct_answer")
    expect(prompt).toContain("내부 검증 정보(사용자에게 직접 언급 금지)")
    expect(prompt).not.toContain("근거 없음 주의")
  })
})
