import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  DEFAULT_GEMINI_FAST_MODEL,
  DEFAULT_GEMINI_MODEL,
  isGeminiModelNotFoundError,
  resolveGeminiModel,
  thinkingConfigFor,
  withGeminiModelFallback,
} from "@/lib/marketing/gemini-model"

describe("resolveGeminiModel", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("기본값은 살아 있는 3.x 모델이다", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.1-pro-preview")
    expect(DEFAULT_GEMINI_FAST_MODEL).toBe("gemini-3.5-flash")
  })

  it("종료된 env 값(gemini-2.x, gemini-1.x)은 무시하고 기본값을 쓴다", () => {
    for (const dead of ["gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-1.5-pro"]) {
      vi.stubEnv("GEMINI_MODEL", dead)
      expect(resolveGeminiModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)).toBe(DEFAULT_GEMINI_MODEL)
    }
  })

  it("살아 있는 env 값은 그대로 쓴다", () => {
    vi.stubEnv("GEMINI_FAST_MODEL", "gemini-flash-lite-latest")
    expect(resolveGeminiModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)).toBe("gemini-flash-lite-latest")
  })
})

describe("withGeminiModelFallback", () => {
  it("404 면 gemini-3.5-flash 로 한 번 넘어간다", async () => {
    const run = vi
      .fn<(m: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Gemini 404: no longer available"))
      .mockResolvedValueOnce("ok")
    await expect(withGeminiModelFallback("gemini-3.1-pro-preview", run)).resolves.toBe("ok")
    expect(run.mock.calls.map((c) => c[0])).toEqual(["gemini-3.1-pro-preview", "gemini-3.5-flash"])
  })

  it("404 가 아닌 오류는 폴백 없이 던진다", async () => {
    const run = vi.fn<(m: string) => Promise<string>>().mockRejectedValue(new Error("Gemini 400: bad"))
    await expect(withGeminiModelFallback("gemini-3.5-flash", run)).rejects.toThrow("400")
    expect(run).toHaveBeenCalledTimes(1)
    expect(isGeminiModelNotFoundError(new Error("Gemini 429"))).toBe(false)
  })
})

describe("isGeminiModelNotFoundError — 응답 내용 오류는 모델 없음이 아니다", () => {
  it("JSON 파싱 오류 메시지에 404 가 들어 있어도 폴백하지 않는다", async () => {
    let parseError: unknown
    try {
      JSON.parse(`{"a":"${"x".repeat(398)}`)
    } catch (error) {
      parseError = error
    }
    expect(String((parseError as Error).message)).toMatch(/404/)
    expect(isGeminiModelNotFoundError(parseError)).toBe(false)
    expect(isGeminiModelNotFoundError(new Error('"신규 리드 404건" is not valid JSON'))).toBe(false)

    const run = vi.fn<(m: string) => Promise<string>>().mockRejectedValue(parseError)
    await expect(withGeminiModelFallback("gemini-3.1-pro-preview", run)).rejects.toBe(parseError)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("HTTP 404 와 SDK 404 형식은 그대로 모델 없음으로 본다", () => {
    expect(isGeminiModelNotFoundError(new Error("Gemini 404: models/x is not found"))).toBe(true)
    expect(isGeminiModelNotFoundError(new Error("[GoogleGenerativeAI Error]: Error fetching: [404 Not Found] models/x"))).toBe(true)
  })
})

describe("thinkingConfigFor", () => {
  it("minimal 을 받는다고 확인한 모델만 minimal, 그 밖의 3.x·4.x 는 low 를 쓴다", () => {
    expect(thinkingConfigFor("gemini-3.5-flash")).toEqual({ thinkingLevel: "minimal" })
    expect(thinkingConfigFor("gemini-3.1-flash-lite")).toEqual({ thinkingLevel: "minimal" })
    for (const model of ["gemini-3.7-flash", "gemini-3.8-flash", "gemini-4-flash", "gemini-3.1-pro-preview"]) {
      expect(thinkingConfigFor(model), model).toEqual({ thinkingLevel: "low" })
    }
  })
})
