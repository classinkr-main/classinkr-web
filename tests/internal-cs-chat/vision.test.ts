import { afterEach, describe, expect, it, vi } from "vitest"

import {
  analyzeInternalCsImage,
  parseInternalCsImageAnalysis,
} from "@/lib/internal-cs-chat/vision"

function geminiResponse(text: string, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response
}

const modelJson = JSON.stringify({
  summary: "수업 입장 오류 화면",
  extractedText: ["입장할 수 없습니다"],
  observations: ["오류 대화상자가 보임"],
  sensitiveDataWarnings: ["계정명이 보일 수 있음"],
  suggestedTags: ["입장오류"],
  followUpQuestions: ["오류 발생 시각은 언제인가요?"],
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("internal CS image analysis", () => {
  it("parses structured JSON fences and normalizes arrays", () => {
    expect(parseInternalCsImageAnalysis(`\`\`\`json\n${modelJson}\n\`\`\``)).toEqual({
      summary: "수업 입장 오류 화면",
      extractedText: ["입장할 수 없습니다"],
      observations: ["오류 대화상자가 보임"],
      sensitiveDataWarnings: ["계정명이 보일 수 있음"],
      suggestedTags: ["입장오류"],
      followUpQuestions: ["오류 발생 시각은 언제인가요?"],
    })
  })

  it("sends image bytes to 3.5 Flash and keeps human review required", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi.fn().mockResolvedValue(geminiResponse(modelJson))
    vi.stubGlobal("fetch", fetchMock)

    const result = await analyzeInternalCsImage({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
      fileName: "capture.png",
    })

    expect(result).toMatchObject({
      summary: "수업 입장 오류 화면",
      mode: "fast",
      model: "gemini-3.5-flash",
      origin: "model",
      needsHumanReview: true,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain("/models/gemini-3.5-flash:generateContent")
    const body = JSON.parse(String(init.body))
    expect(body.contents[0].parts[1].inlineData).toEqual({
      mimeType: "image/png",
      data: "iVBORw==",
    })
    expect(body.generationConfig).toMatchObject({ responseMimeType: "application/json" })
  })

  it("uses latest Pro only for deep analysis, then falls back through the safe chain", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key")
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiResponse("", false))
      .mockResolvedValueOnce(geminiResponse(modelJson))
    vi.stubGlobal("fetch", fetchMock)

    const result = await analyzeInternalCsImage({
      bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
      mimeType: "image/jpeg",
      requestedMode: "deep",
    })

    expect(result).toMatchObject({
      mode: "deep",
      model: "gemini-3.5-flash",
      fallbackUsed: true,
      attemptedModels: ["gemini-3.1-pro-preview", "gemini-3.5-flash"],
    })
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-3.1-pro-preview:generateContent")
  })

  it("returns a non-fabricating deterministic result without a model key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const result = await analyzeInternalCsImage({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: "image/png",
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      origin: "deterministic",
      model: null,
      needsHumanReview: true,
    })
    expect(result.summary).toContain("직접 확인")
  })
})
