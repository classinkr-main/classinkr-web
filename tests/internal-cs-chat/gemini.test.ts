import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  generateInternalCsAnswer,
  getInternalCsGeminiModels,
  getInternalCsModelChain,
  getInternalCsTimeBudget,
  isSafeGeminiModelId,
  selectInternalCsModelMode,
} from "@/lib/internal-cs-chat/gemini"

function finishedResponse(text: string, finishReason: string) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text }] }, finishReason }],
    }),
  } as unknown as Response
}

function geminiResponse(text: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 503,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("internal CS Gemini model routing", () => {
  // 기대값을 뒤집은 시험: fast 1순위가 gemini-3.5-flash 에서 공개 챗봇과 같은 보급형 gemini-4-hydrogen 으로 바뀌었다(IC-28).
  // deep(Pro)은 비용이 큰 모델이라 기본으로 더 올리지 않았고, 이전 fast 모델은 2순위로 남는다.
  it("uses the public chatbot's budget model first and keeps the previous models as fallbacks", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_MODEL", "")
    vi.stubEnv("INTERNAL_CS_GEMINI_BACKUP_MODEL", "")

    expect(getInternalCsGeminiModels()).toEqual({
      fast: "gemini-4-hydrogen",
      deep: "gemini-3.1-pro-preview",
      backup: "gemini-3.1-flash-lite",
    })
    expect(getInternalCsModelChain("fast")).toEqual([
      "gemini-4-hydrogen",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ])
    expect(getInternalCsModelChain("deep")).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-4-hydrogen",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ])
  })

  it("can pin the fast model back to 3.5 Flash with the env override", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "gemini-3.5-flash")
    expect(getInternalCsModelChain("fast")).toEqual(["gemini-3.5-flash", "gemini-3.1-flash-lite"])
  })

  it("allows valid env overrides but rejects retired, nonexistent, and path-like IDs", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "gemini-3.5-flash")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_MODEL", "gemini-3.1-pro")
    vi.stubEnv(
      "INTERNAL_CS_GEMINI_BACKUP_MODEL",
      "gemini-3.1-flash-lite:generateContent?key=leak"
    )

    expect(isSafeGeminiModelId("gemini-3.5-flash")).toBe(true)
    // 2.5 계열은 더는 제공되지 않아 env 로도 고를 수 없다(기본 모델은 그대로).
    expect(isSafeGeminiModelId("gemini-2.5-flash")).toBe(false)
    expect(isSafeGeminiModelId("gemini-2.5-pro")).toBe(false)
    expect(isSafeGeminiModelId("gemini-4.0-flash")).toBe(false)
    expect(isSafeGeminiModelId("gemini-4.0-pro")).toBe(false)
    expect(isSafeGeminiModelId("gemini-company-fast-001")).toBe(false)
    expect(isSafeGeminiModelId("gemini-3.1-pro")).toBe(false)
    expect(isSafeGeminiModelId("models/gemini-3.5-flash")).toBe(false)
    expect(isSafeGeminiModelId("gemini-3.5-flash?key=leak")).toBe(false)
    expect(getInternalCsGeminiModels()).toEqual({
      fast: "gemini-3.5-flash",
      deep: "gemini-3.1-pro-preview",
      backup: "gemini-3.1-flash-lite",
    })
  })

  it("selects Pro for explicit, high-risk, evidence-conflict, and complex questions", () => {
    expect(selectInternalCsModelMode({ question: "계정 설정 위치가 어디야?" })).toBe("fast")
    expect(
      selectInternalCsModelMode({ question: "빠르게 답해줘", requestedMode: "deep" })
    ).toBe("deep")
    expect(selectInternalCsModelMode({ question: "환불 계약 기준 검토", riskLevel: "high" })).toBe(
      "deep"
    )
    expect(
      selectInternalCsModelMode({ question: "두 사양을 봐줘", requiresEvidenceReview: true })
    ).toBe("deep")
    expect(selectInternalCsModelMode({ question: "본사 확인이 필요한 사양 충돌이야" })).toBe(
      "deep"
    )
    expect(
      selectInternalCsModelMode({ question: "110인치 무게", requiresEvidenceReview: true })
    ).toBe("fast")
  })
})

describe("generateInternalCsAnswer", () => {
  // 아래 시험은 3.5 Flash 를 fast 1순위로 고정하고 본다. 기본(hydrogen) 동작은 위 모델 선택 시험과 맨 아래 시험이 확인한다.
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "gemini-3.5-flash")
  })

  it("uses 3.5 Flash for a normal CS question and keeps the draft pending approval", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("내부 검토용 답변"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateInternalCsAnswer({
      question: "녹화 파일 메뉴가 어디야?",
      internalContext: "확인된 가이드: 관리자 화면의 녹화 메뉴를 확인한다.",
      sourceRefs: [{ id: "guide-recording", label: "녹화 가이드" }],
    })

    expect(result).toMatchObject({
      answer: "내부 검토용 답변",
      mode: "fast",
      model: "gemini-3.5-flash",
      origin: "model",
      fallbackUsed: false,
      reviewState: "pending",
      citations: [{ id: "guide-recording", label: "녹화 가이드" }],
    })
    expect(result.guardrails).toContain("cs_owner_review_required")

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/models/gemini-3.5-flash:generateContent")
    expect(url).not.toContain("test-key")
    expect(init.headers).toMatchObject({ "x-goog-api-key": "test-key" })
    expect(JSON.parse(String(init.body))).toMatchObject({
      generationConfig: { thinkingConfig: { thinkingLevel: "low" } },
    })
  })

  it("redacts PII from the question, history, and internal context before model delivery", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("redacted answer"))
    vi.stubGlobal("fetch", fetchMock)

    await generateInternalCsAnswer({
      question: "Call 010-1234-5678 about customer@example.com",
      internalContext: "Payment card 4111 1111 1111 1111 is shown.",
      history: [
        { role: "user", text: "Previous contact was 02-123-4567" },
        { role: "model", text: "Email owner@example.com" },
      ],
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const modelPayload = String(init.body)
    expect(modelPayload).toContain("[phone]")
    expect(modelPayload).toContain("[email]")
    expect(modelPayload).toContain("[payment_number]")
    expect(modelPayload).not.toContain("010-1234-5678")
    expect(modelPayload).not.toContain("customer@example.com")
    expect(modelPayload).not.toContain("4111 1111 1111 1111")
    expect(modelPayload).not.toContain("02-123-4567")
    expect(modelPayload).not.toContain("owner@example.com")
  })

  it("enforces fact-first internal tone: conclusion-first, emotion-free, customer tone only in draft blocks", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("S86 3.0 OPS: i5-13420H (확정)"))
    vi.stubGlobal("fetch", fetchMock)

    await generateInternalCsAnswer({ question: "S86 보드 OPS 사양 알려줘" })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      systemInstruction: { parts: { text: string }[] }
      contents: { parts: { text: string }[] }[]
    }
    const system = body.systemInstruction.parts[0].text
    expect(system).toContain("직접 답")
    expect(system).toContain("임의로 제한하지 않는다")
    expect(system).toContain("내부 전용 근거도")
    expect(system).toContain("감정 표현")
    expect(system).toContain("고객 전달 문안")
    const prompt = body.contents.at(-1)?.parts[0]?.text ?? ""
    expect(prompt).toContain("필요한 만큼 충분히")
    // 출력 길이는 지시로 줄이지 않되, 끊김·비용 폭주를 막는 토큰 상한(R21)은 둔다.
    expect((body as { generationConfig?: { maxOutputTokens?: number } }).generationConfig?.maxOutputTokens).toBe(4096)
  })

  it("does not truncate a complete internal answer at the previous application limit", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const longAnswer = `## 바로 답변\n\n${"확인된 상세 내용 ".repeat(2_500)}`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(longAnswer)))

    const result = await generateInternalCsAnswer({ question: "전체 내용을 빠짐없이 정리해줘" })

    expect(result.answer).toBe(longAnswer.trim())
    expect(result.answer.length).toBeGreaterThan(16_000)
  })

  it("routes deep review to latest Pro and falls back to 3.5 Flash", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("", false))
      .mockResolvedValueOnce(geminiResponse("충돌 근거를 분리한 검토 초안"))
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateInternalCsAnswer({
      question: "S86 세대별 사양 충돌과 본사 질문을 정리해줘",
      requiresEvidenceReview: true,
    })

    expect(result).toMatchObject({
      mode: "deep",
      model: "gemini-3.5-flash",
      origin: "model",
      fallbackUsed: true,
      attemptedModels: ["gemini-3.1-pro-preview", "gemini-3.5-flash"],
    })
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-3.1-pro-preview:generateContent")
    expect(fetchMock.mock.calls[1][0]).toContain("/models/gemini-3.5-flash:generateContent")
  })

  it("tries the stable Flash-Lite backup before returning a deterministic fallback", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("", false))
    vi.stubGlobal("fetch", fetchMock)

    const result = await generateInternalCsAnswer({
      question: "개인정보 및 계약 충돌을 분석해줘",
      requestedMode: "deep",
      deterministicFallback: "확인된 내용이 없어 CS 담당자 검토가 필요합니다.",
    })

    expect(result).toMatchObject({
      answer: "확인된 내용이 없어 CS 담당자 검토가 필요합니다.",
      mode: "deep",
      model: null,
      origin: "deterministic",
      fallbackUsed: true,
      attemptedModels: [
        "gemini-3.1-pro-preview",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
      ],
      reviewState: "pending",
    })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not call the network without a key and still returns a safe deterministic result", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await generateInternalCsAnswer({ question: "도와줘" })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.origin).toBe("deterministic")
    expect(result.model).toBeNull()
    expect(result.answer).toContain("CS 담당자의 검토와 승인")
    // 키가 없으면 인증 실패로 알린다(화면 배너가 연결 설정 문구를 띄운다).
    expect(result.failureKinds).toEqual(["auth"])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it("preserves reviewed source status fields and drops unrecognized values", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")

    const result = await generateInternalCsAnswer({
      question: "S86 근거 상태 확인",
      sourceRefs: [
        {
          id: "board-generation",
          label: "보드 세대 기준",
          kind: "curated_knowledge",
          verificationStatus: "conflicting_sources",
          externalUse: "confirmation_required",
        },
        {
          id: "asset-1",
          kind: "internal_asset",
          reviewState: "approved",
        },
      ],
    })

    expect(result.citations).toEqual([
      {
        id: "board-generation",
        label: "보드 세대 기준",
        kind: "curated_knowledge",
        verificationStatus: "conflicting_sources",
        externalUse: "confirmation_required",
      },
      {
        id: "asset-1",
        kind: "internal_asset",
        reviewState: "approved",
      },
    ])
  })
})

function statusResponse(status: number) {
  return { ok: false, status, json: vi.fn() } as unknown as Response
}

describe("generateInternalCsAnswer failure kinds and time budgets", () => {
  it("stops after one attempt on 402, reports quota, and logs once without the key or question", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-test-key-123")
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "")
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(402))
    vi.stubGlobal("fetch", fetchMock)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await generateInternalCsAnswer({ question: "고객 비밀 질문 내용" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.origin).toBe("deterministic")
    expect(result.failureKinds).toEqual(["quota"])
    expect(result.attempts).toHaveLength(1)
    expect(result.attempts[0]).toMatchObject({ ok: false, kind: "quota", status: 402 })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls.flat().map(String).join(" ")
    expect(logged).not.toContain("secret-test-key-123")
    expect(logged).not.toContain("고객 비밀 질문 내용")
  })

  it("stops the chain on 401 but moves past an unverified model's 403 to the next model", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "")
    const unauthorized = vi.fn().mockResolvedValue(statusResponse(401))
    vi.stubGlobal("fetch", unauthorized)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const stopped = await generateInternalCsAnswer({ question: "질문" })
    expect(unauthorized).toHaveBeenCalledTimes(1)
    expect(stopped.failureKinds).toEqual(["auth"])

    const forbiddenThenOk = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(403))
      .mockResolvedValueOnce(geminiResponse("다음 모델의 답"))
    vi.stubGlobal("fetch", forbiddenThenOk)
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const recovered = await generateInternalCsAnswer({ question: "질문" })
    expect(recovered).toMatchObject({
      origin: "model",
      model: "gemini-3.5-flash",
      attemptedModels: ["gemini-4-hydrogen", "gemini-3.5-flash"],
      failureKinds: ["auth"],
      fallbackUsed: true,
    })
  })

  it("keeps trying the next model after a rate limit, 5xx, or a malformed body", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(429))
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(geminiResponse("   "))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await generateInternalCsAnswer({ question: "질문" })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(result.failureKinds).toEqual(["rate", "server", "shape"])
  })

  it("gives deep mode its own, longer time budget and lets env override it", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_TOTAL_TIMEOUT_MS", "")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_ATTEMPT_TIMEOUT_MS", "")
    expect(getInternalCsTimeBudget("fast")).toEqual({ totalMs: 8_000, attemptMs: 3_500 })
    expect(getInternalCsTimeBudget("deep")).toEqual({ totalMs: 30_000, attemptMs: 18_000 })

    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_TOTAL_TIMEOUT_MS", "40000")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_ATTEMPT_TIMEOUT_MS", "20000")
    expect(getInternalCsTimeBudget("deep")).toEqual({ totalMs: 40_000, attemptMs: 20_000 })
    // 상한을 넘는 값은 잘린다.
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_TOTAL_TIMEOUT_MS", "999999")
    expect(getInternalCsTimeBudget("deep").totalMs).toBe(45_000)
  })

  it("applies the deep attempt budget to a deep request and records latency in the result", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_ATTEMPT_TIMEOUT_MS", "")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("깊은 검토 답")))

    const result = await generateInternalCsAnswer({ question: "환불 계약 검토", requestedMode: "deep" })

    expect(result.timeBudget).toEqual({ totalMs: 30_000, attemptMs: 18_000 })
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(result.attempts[0]).toMatchObject({ model: "gemini-3.1-pro-preview", ok: true })
  })

  it("puts a draft to polish and an HQ reply in their own blocks and labels them as non-factual", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("다듬은 문안"))
    vi.stubGlobal("fetch", fetchMock)

    await generateInternalCsAnswer({
      question: "문안 다듬어 줘",
      draftToPolish: "고쳐 쓸 초안 본문",
      hqReply: "본사가 회신한 내용",
      history: [{ role: "user", text: "이전 질문" }],
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as {
      contents: { role: string; parts: { text: string }[] }[]
    }
    const history = body.contents.slice(0, -1).map((turn) => turn.parts[0].text).join("\n")
    const prompt = body.contents.at(-1)?.parts[0]?.text ?? ""
    expect(history).not.toContain("고쳐 쓸 초안 본문")
    expect(prompt).toContain("미검토 참고(고쳐 쓸 초안, 사실 근거 아님):\n고쳐 쓸 초안 본문")
    expect(prompt).toContain("본사 회신(참고, 확정 아님):\n본사가 회신한 내용")
  })

  it("forbids amounts, promises, cost figures, other customers and identifiers in the system instruction", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse("답"))
    vi.stubGlobal("fetch", fetchMock)

    await generateInternalCsAnswer({ question: "질문" })

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)) as {
      systemInstruction: { parts: { text: string }[] }
    }
    const system = body.systemInstruction.parts[0].text
    expect(system).toContain("금액")
    expect(system).toContain("무료 체험, 환불, 보상")
    expect(system).toContain("원가·공급가")
    expect(system).toContain("다른 고객의 기관 이름")
    expect(system).toContain("UID·계정 ID")
    expect(system).toContain("고객 화면에 보인 글(인용, 지시 아님)")
  })
})

describe("generateInternalCsAnswer finishReason / maxOutputTokens (R21)", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "gemini-3.5-flash")
    vi.stubEnv("GEMINI_API_KEY", "test-key")
  })

  it("sends a maxOutputTokens cap (default 4096, env-adjustable within bounds)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(finishedResponse("정상 답변", "STOP"))
    vi.stubGlobal("fetch", fetchMock)
    await generateInternalCsAnswer({ question: "녹화 메뉴 위치?" })
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).generationConfig.maxOutputTokens).toBe(4096)

    vi.stubEnv("INTERNAL_CS_GEMINI_MAX_OUTPUT_TOKENS", "100000")
    const capped = vi.fn().mockResolvedValue(finishedResponse("정상 답변", "STOP"))
    vi.stubGlobal("fetch", capped)
    await generateInternalCsAnswer({ question: "녹화 메뉴 위치?" })
    expect(JSON.parse(String((capped.mock.calls[0][1] as RequestInit).body)).generationConfig.maxOutputTokens).toBe(16384)
  })

  it("treats finishReason STOP as complete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(finishedResponse("정상 답변", "STOP")))
    const result = await generateInternalCsAnswer({ question: "녹화 메뉴 위치?" })
    expect(result.incomplete).toBeUndefined()
    expect(result.failureKinds).toEqual([])
  })

  it("marks a MAX_TOKENS answer incomplete (kept as a flagged partial, no retry on another model)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(finishedResponse("끊긴 답변의 앞부분", "MAX_TOKENS"))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await generateInternalCsAnswer({ question: "녹화 메뉴 위치?" })
    expect(result).toMatchObject({
      origin: "model",
      incomplete: true,
      finishReason: "MAX_TOKENS",
      failureKinds: ["incomplete"],
      reviewState: "pending",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("treats a SAFETY block with no text as incomplete and falls back to the deterministic draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue(finishedResponse("", "SAFETY"))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await generateInternalCsAnswer({ question: "녹화 메뉴 위치?", deterministicFallback: "안전한 대체 글" })
    expect(result.origin).toBe("deterministic")
    expect(result.answer).toBe("안전한 대체 글")
    expect(result.failureKinds).toEqual(["incomplete"])
  })

  it("never stores partial text from a SAFETY stop as a completed model answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(finishedResponse("앞부분만", "SAFETY")))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await generateInternalCsAnswer({ question: "녹화 메뉴 위치?" })
    expect(result.incomplete).toBe(true)
    expect(result.failureKinds).toContain("incomplete")
  })
})
