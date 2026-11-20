import { afterEach, describe, expect, it, vi } from "vitest"

import {
  __resetModelCircuitForTests,
  asksAboutThirdPartyAdoption,
  buildFinalAnswerPrompt,
  buildGenerationConfig,
  formatDraftForPrompt,
  generateGeminiFinalAnswer,
  getFinalAnswerAllowList,
  isIncompleteFinishReason,
  resolveModelChain,
  streamGeminiFinalAnswer,
  type GeminiAnswerCompletion,
} from "@/lib/chatbot/llm"
import { evaluateChatbotQuery } from "@/lib/chatbot/service"

import { enableGenerateMode, isEvidenceSelectionCall, stubFetchWithEvidenceSelection } from "./helpers/final-answer-llm"

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
    enableGenerateMode()
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
    stubFetchWithEvidenceSelection(fetchMock)

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

  it("falls back to the next model for evidence selection too", async () => {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    clearModelEnv()

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url)
      if (!target.includes(":generateContent")) return { ok: true, json: async () => ({}) }
      if (isEvidenceSelectionCall(init) && target.includes("/models/gemini-3.1-flash-lite:")) {
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"ids":[1]}' }] } }] }) }
      }
      return {
        ok: false,
        status: 404,
        text: async () => '{"error":{"code":404,"message":"This model is no longer available."}}',
        json: async () => ({}),
      }
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await evaluateChatbotQuery("OMR 카드는 어떤 문제 유형을 추가할 수 있나요?")
    const calls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes(":generateContent"))

    expect(calls).toHaveLength(2)
    expect(calls[0]).toContain("/models/gemini-3.5-flash:generateContent")
    expect(calls[1]).toContain("/models/gemini-3.1-flash-lite:generateContent")
    expect(result.answerMode).toBe("direct_answer")
    expect(result.unresolved).toBe(false)
  })
})

// 근거가 약할 때(검색 점수가 낮은 문서뿐이거나 문서가 없을 때) 모델이 배경 종류·단축키 같은 세부를
// 지어내는 것을 실측으로 확인했다. 약한 문서 조각을 '검증 정보'로 넘기지 않고, 지어내지 말라는 요구를 붙인다.
describe("chatbot final answer prompt with weak grounding", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  // 모델이 답을 다시 쓰는 generate 모드의 프롬프트를 본다. 근거 선별 호출은 따로 답하고 생성 프롬프트만 모은다.
  async function capturePrompt(question: string) {
    disableExternalChatbotServices()
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    enableGenerateMode()
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
    stubFetchWithEvidenceSelection(fetchMock)

    const result = await evaluateChatbotQuery(question)
    return { prompt: prompts[0] ?? "", result }
  }

  it("tells the model not to invent details when no document matches", async () => {
    // 문서가 하나도 안 걸리는 질문은 선별할 문장이 없어 바로 생성으로 간다(fallback).
    const { prompt, result } = await capturePrompt("클래스인 투자자가 누구예요?")

    expect(prompt).toContain("현재 응답 모드: fallback")
    expect(prompt).toContain("내부 검증 정보: 없음")
    expect(prompt).toContain("근거 없음 주의")
    expect(prompt).toContain("새로 지어내지 마")
    expect(result.answer).toContain("확인되지 않았어요")
  })

  it("uses the model by mode: off never, select only to pick sentences, generate to rewrite as well", async () => {
    const question = "온스테이지랑 학생 자동 온스테이지가 뭔가요?"

    // 답변 캐시가 모듈에 남으므로, 스위치를 바꿀 때마다 모듈을 새로 불러 같은 질문으로 비교한다.
    async function runWithMode(switchValue: string) {
      vi.resetModules()
      disableExternalChatbotServices()
      vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
      vi.stubEnv("CHATBOT_FINAL_ANSWER_LLM", switchValue)
      clearModelEnv()

      const kinds: ("select" | "generate")[] = []
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
          if (!String(url).includes(":generateContent")) return { ok: true, json: async () => ({}) }
          const selection = isEvidenceSelectionCall(init)
          kinds.push(selection ? "select" : "generate")
          const text = selection
            ? '{"ids":[1]}'
            : "온스테이지는 수업 옵션이에요. Classin 수업 운영에서 궁금한 점을 알려 주세요."
          return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }
        })
      )

      const { evaluateChatbotQuery: evaluate } = await import("@/lib/chatbot/service")
      return { kinds, result: await evaluate(question) }
    }

    const off = await runWithMode("off")
    expect(off.kinds).toEqual([])
    expect(off.result.answer.length).toBeGreaterThan(20)

    // 기본값은 select: 문장을 고르는 호출만 하고 답을 다시 쓰지 않는다.
    const byDefault = await runWithMode("")
    expect(byDefault.kinds).toEqual(["select"])
    expect(byDefault.result.answer).not.toContain("온스테이지는 수업 옵션이에요")

    const generate = await runWithMode("generate")
    expect(generate.kinds).toEqual(["select", "generate"])
    expect(generate.result.answer).toContain("온스테이지는 수업 옵션이에요")
  })

  it("keeps passing sources when the grounding is strong", async () => {
    const { prompt } = await capturePrompt("EDB 교안은 어떻게 재사용해요?")

    expect(prompt).toContain("현재 응답 모드: direct_answer")
    expect(prompt).toContain("내부 검증 정보(사용자에게 직접 언급 금지)")
    expect(prompt).not.toContain("근거 없음 주의")
  })
})

// 2026-11-13: 모델 체인을 되살린 뒤 모델이 쓴 답 69건을 근거와 대조하니 절반에 근거 밖 세부가 있었다
// (없는 단계·아이콘, 기능 뜻풀이, 사례 성과, 근거 없는 "제공하지 않습니다"). 요청마다 근거 범위를 다시 적는다.
describe("chatbot final answer prompt requirements", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  const base = {
    question: "숙제를 사진으로 찍어서 내라는데 어떻게 올리는 거예요?",
    category: "classroom",
    intent: "classroom_consulting",
    draftAnswer: "숙제는 제출 화면 아래 [숙제 제출]까지 눌러야 제출됩니다.",
    sources: [
      {
        title: "숙제 제출이 안 될 때",
        heading: "요약",
        urlPath: "/docs/troubleshooting/homework-submit",
        category: "classroom",
        excerpt: "숙제는 제출 화면 아래 [숙제 제출]까지 눌러야 제출됩니다. [초안 저장]은 저장만 될 뿐 제출이 아닙니다.",
        score: 120,
      },
    ],
  }

  it("restates the grounding scope when sources are strong", () => {
    const prompt = buildFinalAnswerPrompt({ ...base, answerMode: "direct_answer" })

    expect(prompt).toContain("내부 검증 정보(사용자에게 직접 언급 금지)")
    expect(prompt).toContain("근거 범위")
    expect(prompt).toContain("'된다'고도 '안 된다·제공하지 않는다'고도 단정하지 말고")
    expect(prompt).not.toContain("근거 없음 주의")
    expect(prompt).not.toContain("고객사 언급 주의")
  })

  it("keeps the grounding scope on intent-specific requirement branches", () => {
    const onboarding = buildFinalAnswerPrompt({ ...base, category: "onboarding", intent: "onboarding", answerMode: "direct_answer" })
    const handoff = buildFinalAnswerPrompt({ ...base, answerMode: "handoff" })

    expect(onboarding).toContain("요구사항: 온보딩/데모")
    expect(onboarding).toContain("근거 범위")
    expect(handoff).toContain("근거 범위")
  })

  it("switches to the weak-grounding requirement and withholds sources when grounding is weak", () => {
    for (const answerMode of ["doc_suggestion", "fallback", "clarifying_question"]) {
      const prompt = buildFinalAnswerPrompt({ ...base, answerMode })

      expect(prompt).toContain("내부 검증 정보: 없음")
      expect(prompt).toContain("근거 없음 주의")
      expect(prompt).not.toContain("근거 범위")
    }
  })

  it("adds the third-party adoption caution in every mode", () => {
    const question = "요즘 목동 쪽 학원들도 클래스인 많이 쓰는 분위기인가요, 예를 들어 세화학원이나 하이스트 같은 데요?"

    for (const answerMode of ["direct_answer", "doc_suggestion", "fallback", "handoff"]) {
      const prompt = buildFinalAnswerPrompt({ ...base, question, answerMode })

      expect(prompt).toContain("고객사 언급 주의")
      expect(prompt).toContain("확인도 부정도 하지 말고")
    }
  })

  it("detects academy or region adoption questions without catching how-to questions", () => {
    for (const question of [
      "요즘 목동 쪽 학원들도 클래스인 많이 쓰는 분위기인가요, 예를 들어 세화학원이나 하이스트 같은 데요?",
      "대치동에서는 다들 클래스인으로 넘어가는 추세라던데 맞아요?",
      "우리 동네 학원들도 다 이거 쓰나요 요즘 분위기가 어때요",
      "세정학원도 클래스인 도입했다고 들었는데 맞나요",
    ]) {
      expect(asksAboutThirdPartyAdoption(question), question).toBe(true)
    }

    for (const question of [
      "숙제를 사진으로 찍어서 내라는데 어떻게 올리는 거예요?",
      "EDB 교안은 어떻게 재사용해요?",
      "녹화본은 어디서 다운로드해요?",
      "우리 학원은 줌을 쓰는데 바꿔야 하나요",
      "어떤 학원이 쓰나요?",
    ]) {
      expect(asksAboutThirdPartyAdoption(question), question).toBe(false)
    }
  })

  it("sends the same prompt on the streaming and non-streaming paths", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    clearModelEnv()

    const prompts: Record<"plain" | "stream", string[]> = { plain: [], stream: [] }
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { contents: { parts: { text: string }[] }[] }
        const kind = String(url).includes(":streamGenerateContent") ? "stream" : "plain"
        prompts[kind].push(body.contents.at(-1)?.parts[0]?.text ?? "")
        return { ok: false, status: 500, body: null, text: async () => "" }
      })
    )

    const args = { ...base, question: "대치동에서는 다들 클래스인으로 넘어가는 추세라던데 맞아요?", answerMode: "direct_answer" }
    await generateGeminiFinalAnswer(args)
    for await (const chunk of streamGeminiFinalAnswer(args)) void chunk

    expect(prompts.plain.length).toBeGreaterThan(0)
    expect(prompts.stream.length).toBeGreaterThan(0)
    expect(new Set([...prompts.plain, ...prompts.stream]).size).toBe(1)
    expect(prompts.plain[0]).toBe(buildFinalAnswerPrompt(args))
  })
})

// 2026-11-20 조사 G13: finishReason 을 로그에만 써서 MAX_TOKENS 로 잘린 글이 길이 자르기를 거쳐 완성된 답처럼 나갔고,
// 스트림은 글을 낸 뒤 끊기면(시간 초과·중단) 조용히 정상 종료로 처리했다. 끝난 모양(complete·finishReason)을 알리고,
// 일반 호출은 끝까지 받은 답만 돌려준다. 다음 모델로 넘기지 않아 질문당 호출 수는 늘지 않는다.
describe("chatbot final answer completion signal", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    __resetModelCircuitForTests()
  })

  const args = {
    question: "녹화본은 어디서 내려받아요?",
    category: "classroom",
    intent: "classroom_consulting",
    answerMode: "direct_answer",
    draftAnswer: "녹화본은 코스의 수업 기록에서 내려받을 수 있습니다.",
  }

  const ANSWER = "녹화본은 코스의 수업 기록에서 다운로드를 누르면 PC에 저장됩니다."

  function plainResponse(finishReason?: string) {
    return {
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: ANSWER }] }, ...(finishReason ? { finishReason } : {}) }] }),
    }
  }

  function sseLine(text: string, finishReason?: string) {
    return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] })}`
  }

  /** SSE 응답. fail 이 true 면 마지막 조각 뒤 읽기에서 오류를 낸다(연결 끊김·시간 초과). */
  function sseResponse(lines: string[], { fail = false, trailingNewline = true } = {}) {
    const encoder = new TextEncoder()
    const chunks = lines.map((line, index) => (index < lines.length - 1 || trailingNewline ? `${line}\n\n` : line))
    let index = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]))
          return
        }
        if (fail) controller.error(Object.assign(new Error("aborted"), { name: "AbortError" }))
        else controller.close()
      },
    })
    return { ok: true, status: 200, body }
  }

  async function readStream(generator: AsyncGenerator<string, GeminiAnswerCompletion>) {
    let text = ""
    for (;;) {
      const next = await generator.next()
      if (next.done) return { text, completion: next.value }
      text += next.value
    }
  }

  function setup() {
    vi.stubEnv("GEMINI_API_KEY", "test-gemini-key")
    clearModelEnv()
  }

  it("treats only explicit non-STOP finish reasons as incomplete", () => {
    expect(isIncompleteFinishReason("STOP")).toBe(false)
    expect(isIncompleteFinishReason(undefined)).toBe(false)
    expect(isIncompleteFinishReason(null)).toBe(false)
    expect(isIncompleteFinishReason("FINISH_REASON_UNSPECIFIED")).toBe(false)
    for (const reason of ["MAX_TOKENS", "SAFETY", "RECITATION", "OTHER"]) expect(isIncompleteFinishReason(reason), reason).toBe(true)
  })

  it("drops a MAX_TOKENS answer without trying the next model and reports why", async () => {
    setup()
    const fetchMock = vi.fn(async () => plainResponse("MAX_TOKENS"))
    vi.stubGlobal("fetch", fetchMock)
    const completions: GeminiAnswerCompletion[] = []

    const answer = await generateGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })

    expect(answer).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(completions).toEqual([{ complete: false, reason: "finish_reason", finishReason: "MAX_TOKENS", model: "gemini-3.5-flash" }])
  })

  it("drops SAFETY and RECITATION answers too", async () => {
    setup()
    for (const reason of ["SAFETY", "RECITATION"]) {
      vi.stubGlobal("fetch", vi.fn(async () => plainResponse(reason)))
      expect(await generateGeminiFinalAnswer(args), reason).toBeNull()
    }
  })

  it("returns a STOP answer (or one without a finish reason) as complete", async () => {
    setup()
    for (const reason of ["STOP", undefined]) {
      vi.stubGlobal("fetch", vi.fn(async () => plainResponse(reason)))
      const completions: GeminiAnswerCompletion[] = []
      expect(await generateGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })).toBe(ANSWER)
      expect(completions).toEqual([{ complete: true, reason: "stop", finishReason: reason ?? null, model: "gemini-3.5-flash" }])
    }
  })

  it("reports an unavailable completion when every model fails", async () => {
    setup()
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "", json: async () => ({}) })))
    const completions: GeminiAnswerCompletion[] = []
    expect(await generateGeminiFinalAnswer({ ...args, onCompletion: (completion) => completions.push(completion) })).toBeNull()
    expect(completions).toEqual([{ complete: false, reason: "unavailable", finishReason: null, model: null }])
  })

  it("marks a stream that breaks after the first chunk as interrupted and does not move to the next model", async () => {
    setup()
    const fetchMock = vi.fn(async () => sseResponse([sseLine("녹화본은 코스의 ")], { fail: true }))
    vi.stubGlobal("fetch", fetchMock)
    const completions: GeminiAnswerCompletion[] = []

    const { text, completion } = await readStream(
      streamGeminiFinalAnswer({ ...args, onCompletion: (value) => completions.push(value) })
    )

    expect(text).toBe("녹화본은 코스의 ")
    expect(completion).toEqual({ complete: false, reason: "interrupted", finishReason: null, model: "gemini-3.5-flash" })
    expect(completions).toEqual([completion])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("marks a stream that ends with MAX_TOKENS as incomplete", async () => {
    setup()
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([sseLine("녹화본은 코스의 "), sseLine("수업 기록에서", "MAX_TOKENS")])))

    const { text, completion } = await readStream(streamGeminiFinalAnswer(args))

    expect(text).toBe("녹화본은 코스의 수업 기록에서")
    expect(completion).toEqual({ complete: false, reason: "finish_reason", finishReason: "MAX_TOKENS", model: "gemini-3.5-flash" })
  })

  it("completes a STOP stream and reads a last line that has no trailing newline", async () => {
    setup()
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sseResponse([sseLine("녹화본은 코스의 "), sseLine("수업 기록에서 내려받습니다.", "STOP")], { trailingNewline: false }))
    )

    const { text, completion } = await readStream(streamGeminiFinalAnswer(args))

    expect(text).toBe("녹화본은 코스의 수업 기록에서 내려받습니다.")
    expect(completion).toEqual({ complete: true, reason: "stop", finishReason: "STOP", model: "gemini-3.5-flash" })
  })

  it("still moves to the next model when the first one fails before any text", async () => {
    setup()
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("/models/gemini-3.5-flash:")
        ? { ok: false, status: 503, body: null, text: async () => "" }
        : sseResponse([sseLine(ANSWER, "STOP")])
    )
    vi.stubGlobal("fetch", fetchMock)

    const { text, completion } = await readStream(streamGeminiFinalAnswer(args))

    expect(text).toBe(ANSWER)
    expect(completion).toEqual({ complete: true, reason: "stop", finishReason: "STOP", model: "gemini-3.1-flash-lite" })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

// 2026-11-20 조사 G13: 안전 초안을 520자에서 그냥 잘라 끝의 제약 문장("…는 확인이 필요해요")이 빠지거나 문장 중간에서 끊겼다.
describe("safety draft in the final answer prompt", () => {
  it("leaves a short draft without constraint sentences as it was", () => {
    const draft = "숙제는 제출 화면 아래 [숙제 제출]까지 눌러야 제출됩니다.\n\n[초안 저장]은 저장만 됩니다."
    expect(formatDraftForPrompt(draft)).toBe("숙제는 제출 화면 아래 [숙제 제출]까지 눌러야 제출됩니다. [초안 저장]은 저장만 됩니다.")
  })

  it("moves constraint sentences to one leading line and cuts the rest at a sentence end", () => {
    const filler = "수업 전에는 코스와 자료를 미리 올려 두고, 수업 중에는 판서와 녹화를 함께 씁니다."
    const draft = `${Array.from({ length: 12 }, () => filler).join(" ")} 학원비 결제·수납 기능은 제공하지 않습니다. 계약 조건은 상담에서 확인이 필요해요.`
    const formatted = formatDraftForPrompt(draft)
    const [first, ...rest] = formatted.split("\n")

    expect(first).toBe("제약: 학원비 결제·수납 기능은 제공하지 않습니다. 계약 조건은 상담에서 확인이 필요해요.")
    const body = rest.join("\n")
    expect(body.length).toBeLessThanOrEqual(520)
    expect(body.endsWith("씁니다.")).toBe(true)
    expect(body).not.toContain("제공하지 않습니다")

    const prompt = buildFinalAnswerPrompt({
      question: "학원비도 클래스인으로 받을 수 있나요?",
      category: "pricing",
      answerMode: "direct_answer",
      draftAnswer: draft,
    })
    expect(prompt).toContain(`안전 초안(제약 조건, 필요하면 표현만 다듬기):\n${formatted}`)
  })

  it("gives the system instruction and the requirement as the allow list for checking the model text", () => {
    const allowList = getFinalAnswerAllowList("onboarding", "onboarding")
    expect(allowList).toHaveLength(2)
    expect(allowList[0]).toContain("[도입 상담 남기기]")
    expect(allowList[1]).toContain("요구사항: 온보딩/데모")
  })
})
