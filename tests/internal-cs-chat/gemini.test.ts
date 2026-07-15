import { afterEach, describe, expect, it, vi } from "vitest"
import {
  generateInternalCsAnswer,
  getInternalCsGeminiModels,
  getInternalCsModelChain,
  isSafeGeminiModelId,
  selectInternalCsModelMode,
} from "@/lib/internal-cs-chat/gemini"

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
  it("uses the verified 2026-07-15 official defaults", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_MODEL", "")
    vi.stubEnv("INTERNAL_CS_GEMINI_BACKUP_MODEL", "")

    expect(getInternalCsGeminiModels()).toEqual({
      fast: "gemini-3.5-flash",
      deep: "gemini-3.1-pro-preview",
      backup: "gemini-3.1-flash-lite",
    })
    expect(getInternalCsModelChain("fast")).toEqual([
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ])
    expect(getInternalCsModelChain("deep")).toEqual([
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-3.1-flash-lite",
    ])
  })

  it("allows valid env overrides but rejects retired, nonexistent, and path-like IDs", () => {
    vi.stubEnv("INTERNAL_CS_GEMINI_FAST_MODEL", "gemini-2.5-flash")
    vi.stubEnv("INTERNAL_CS_GEMINI_DEEP_MODEL", "gemini-3.1-pro")
    vi.stubEnv(
      "INTERNAL_CS_GEMINI_BACKUP_MODEL",
      "gemini-3.1-flash-lite:generateContent?key=leak"
    )

    expect(isSafeGeminiModelId("gemini-2.5-flash")).toBe(true)
    expect(isSafeGeminiModelId("gemini-company-fast-001")).toBe(false)
    expect(isSafeGeminiModelId("gemini-3.1-pro")).toBe(false)
    expect(isSafeGeminiModelId("models/gemini-3.5-flash")).toBe(false)
    expect(isSafeGeminiModelId("gemini-3.5-flash?key=leak")).toBe(false)
    expect(getInternalCsGeminiModels()).toEqual({
      fast: "gemini-2.5-flash",
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
  })
})

describe("generateInternalCsAnswer", () => {
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

    const result = await generateInternalCsAnswer({ question: "도와줘" })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.origin).toBe("deterministic")
    expect(result.model).toBeNull()
    expect(result.answer).toContain("CS 담당자의 검토와 승인")
  })
})
