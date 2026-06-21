import { afterEach, describe, expect, it, vi } from "vitest"

import { evaluateChatbotQuery } from "@/lib/chatbot/service"

function disableExternalChatbotServices() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  vi.stubEnv("SUPABASE_SECRET_KEY", "")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
  vi.stubEnv("GEMINI_API_KEY", "")
}

describe("chatbot RAG source relevance", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("answers Zoom comparison from core positioning instead of API guidance", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("Classin은 Zoom이랑 뭐가 달라요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("onboarding")
    expect(result.sources[0]).toMatchObject({
      title: "Classin을 학원 시스템 OS로 이해하기",
      heading: "핵심 포지셔닝",
      urlPath: "/docs/start/academy-system-os-positioning",
    })
    expect(result.sources.some((source) => source.heading?.includes("API"))).toBe(false)
  })

  it("answers casual Classin difference questions from core positioning", async () => {
    disableExternalChatbotServices()
    const questions = [
      "클래스인 뭐가 다른거에요?",
      "클래스인은 뭐가 다른가요?",
      "클래스인이 다른 서비스랑 다른 점은 뭐예요?",
      "클래스인 차별점 알려주세요",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, {
        generateAnswer: false,
      })

      expect(result.detectedCategory).toBe("onboarding")
      expect(result.sources[0]).toMatchObject({
        title: "Classin을 학원 시스템 OS로 이해하기",
        heading: "핵심 포지셔닝",
        urlPath: "/docs/start/academy-system-os-positioning",
      })
      expect(result.sources[0]?.category).toBe("onboarding")
      expect(result.sources).toHaveLength(1)
      expect(result.sources[0]?.title).not.toContain("차감")
      expect(result.answer).toContain("수업 운영 흐름")
    }
  })

  it("answers product identity questions from inferred core positioning", async () => {
    disableExternalChatbotServices()
    const questions = [
      "클래스인이 뭐야?",
      "클래스인 뭐예요?",
      "Classin은 어떤 서비스인가요?",
      "클래스인 소개해줘",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, {
        generateAnswer: false,
      })

      expect(result.detectedCategory).toBe("onboarding")
      expect(result.sources[0]).toMatchObject({
        title: "Classin을 학원 시스템 OS로 이해하기",
        heading: "Classin 한 줄 소개",
        urlPath: "/docs/start/academy-system-os-positioning",
      })
      expect(result.sources).toHaveLength(1)
      expect(result.answer).toContain("수업 운영 솔루션")
      expect(result.answer).not.toContain("문서에서 바로 맞는 답을 찾지 못했습니다")
    }
  })

  it("answers hardware spec questions from the board lineup specs", async () => {
    disableExternalChatbotServices()
    const questions = [
      "클래스인 하드웨어 스펙",
      "전자칠판 스펙 알려줘",
      "Classin Board S86 사양 알려줘",
      "전자칠판 스펙 문의",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, {
        generateAnswer: false,
      })

      expect(result.detectedCategory).toBe("hardware")
      expect(result.answerMode).toBe("direct_answer")
      expect(result.needsHandoff).toBe(false)
      expect(result.sources[0]).toMatchObject({
        title: "모델별 스펙과 선택 가이드",
        heading: "Classin Board 스펙 요약",
        urlPath: "/docs/hardware/board-lineup-specs",
      })
      expect(result.sources).toHaveLength(1)
      expect(result.answer).toContain("4K")
      expect(result.answer).toContain("S86")
      expect(result.answer).not.toContain("S98 Pro")
      expect(result.answer).not.toContain("6.0.7")
      expect(result.answer).not.toContain("교사 온보딩")
    }
  })

  it("does not treat hardware trouble questions as spec lookups", async () => {
    disableExternalChatbotServices()
    const questions = [
      "전자칠판 화면이 안 켜져요",
      "전자칠판 화면 꺼짐",
      "전자칠판 화면 안 나옴",
      "전자칠판 화면이 켜지지 않아요",
    ]

    for (const question of questions) {
      const result = await evaluateChatbotQuery(question, {
        generateAnswer: false,
      })

      expect(result.detectedCategory).toBe("hardware")
      expect(result.sources[0]?.heading).not.toBe("Classin Board 스펙 요약")
      expect(result.sources[0]).toMatchObject({
        title: "전자칠판 기본 사용 설명서 (버튼·제스처·미러링·HDMI)",
        heading: "화면/전원 기본 점검",
        urlPath: "/docs/hardware/board-basic-operation",
      })
      expect(result.answer).toContain("입력 소스")
      expect(result.answer).not.toContain("6.0.7")
      expect(result.answer).not.toContain("교사 온보딩")
    }
  })

  it("uses Gemini inference for Classin questions without matching docs", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "")
    vi.stubEnv("GEMINI_REASONING_MODEL", "")
    vi.stubEnv("GEMINI_MODEL", "")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    "가능합니다. Classin은 플립러닝처럼 수업 전 자료 공유, 실시간 수업, 녹화 복습 흐름을 나눠 운영할 때도 활용하기 좋아요.",
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 플립러닝 설계도 가능해?")

    expect(result.detectedCategory).toBe("general")
    expect(result.sources).toHaveLength(0)
    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(false)
    expect(result.answer).toContain("플립러닝")
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/models/gemini-2.5-flash:generateContent?key=test-gemini-key"),
      expect.objectContaining({
        method: "POST",
      })
    )
    const generationCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes(":generateContent")
    )
    const body = JSON.parse(String(generationCall?.[1]?.body))
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 })
  })

  it("ignores unsupported configured fast Gemini models and uses the stable default", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-2.0-flash")

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    "가능합니다. Classin은 프로젝트형 수업에서도 자료 공유, 수업 진행, 녹화 복습 흐름을 함께 운영할 수 있습니다.",
                },
              ],
            },
          },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 프로젝트형 수업도 가능해?")
    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":generateContent")
    )

    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("프로젝트형 수업")
    expect(generationCalls).toHaveLength(1)
    expect(generationCalls[0][0]).toContain("/models/gemini-2.5-flash:generateContent")
    expect(generationCalls[0][0]).not.toContain("gemini-2.0-flash")
  })

  it("falls back to stable Gemini after a configured primary returns empty output", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-3.5-flash")

    let generationCount = 0
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (!String(url).includes(":generateContent")) {
        return {
          ok: true,
          json: async () => ({}),
        }
      }

      generationCount += 1
      if (generationCount === 1) {
        return {
          ok: true,
          json: async () => ({ candidates: [] }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      "가능합니다. Classin은 세미나형 수업에서도 자료 공유, 판서, 녹화 복습 흐름을 묶어 운영할 수 있습니다.",
                  },
                ],
              },
            },
          ],
        }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 세미나형 수업 운영 가능해?")
    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":generateContent")
    )

    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("세미나형 수업")
    expect(generationCalls).toHaveLength(2)
    expect(generationCalls[0][0]).toContain("/models/gemini-3.5-flash:generateContent")
    expect(generationCalls[1][0]).toContain("/models/gemini-2.5-flash:generateContent")
    const primaryBody = JSON.parse(String(generationCalls[0][1]?.body))
    expect(primaryBody.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" })
  })

  it("falls back to stable Gemini after a configured primary returns malformed JSON", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-3.5-flash")

    let generationCount = 0
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (!String(url).includes(":generateContent")) {
        return {
          ok: true,
          json: async () => ({}),
        }
      }

      generationCount += 1
      if (generationCount === 1) {
        return {
          ok: true,
          json: async () => {
            throw new SyntaxError("bad gemini json")
          },
        }
      }

      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      "가능합니다. Classin은 논술형 수업에서도 자료 공유, 첨삭 흐름, 녹화 복습을 함께 운영할 수 있습니다.",
                  },
                ],
              },
            },
          ],
        }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 논술형 수업 운영 가능해?")
    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":generateContent")
    )

    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("논술형 수업")
    expect(generationCalls).toHaveLength(2)
    expect(generationCalls[0][0]).toContain("/models/gemini-3.5-flash:generateContent")
    expect(generationCalls[1][0]).toContain("/models/gemini-2.5-flash:generateContent")
  })

  it("escalates from fast Gemini to a deeper tier only when the fast answer is unusable", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    vi.stubEnv("GEMINI_FAST_MODEL", "")
    vi.stubEnv("GEMINI_REASONING_MODEL", "gemini-test-reasoning")
    vi.stubEnv("GEMINI_MODEL", "gemini-test-advanced")
    vi.stubEnv("CHATBOT_ENABLE_DEEP_FALLBACK", "1")

    let generationCount = 0
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).includes(":embedContent")) {
        return {
          ok: true,
          json: async () => ({}),
        }
      }

      generationCount += 1
      if (generationCount === 1) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "짧음" }] } }],
          }),
        }
      }

      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text:
                      "가능합니다. Classin은 토론식 수업에서도 자료 공유, 그룹 토론, 판서 저장, 녹화 복습 흐름을 묶어 운영할 수 있습니다.",
                  },
                ],
              },
            },
          ],
        }),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("클래스인으로 토론식 수업 설계도 가능해?")
    const generationCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":generateContent")
    )

    expect(result.answerMode).toBe("direct_answer")
    expect(result.answer).toContain("토론식 수업")
    expect(generationCalls).toHaveLength(2)
    expect(generationCalls[0][0]).toContain("/models/gemini-2.5-flash:generateContent")
    expect(generationCalls[1][0]).toContain("/models/gemini-test-reasoning:generateContent")
  })

  it("keeps API guidance available for explicit API integration questions", async () => {
    disableExternalChatbotServices()

    const result = await evaluateChatbotQuery("수업 정보와 데이터를 API로 연동할 수 있나요?", {
      generateAnswer: false,
    })

    expect(result.detectedCategory).toBe("admin")
    expect(result.sources[0]).toMatchObject({
      title: "Classin을 학원 시스템 OS로 이해하기",
      heading: "API와 정직한 연동 범위",
      urlPath: "/docs/start/academy-system-os-positioning",
    })
  })
})
