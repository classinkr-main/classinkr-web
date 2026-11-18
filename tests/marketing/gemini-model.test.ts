import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  DEFAULT_GEMINI_FAST_MODEL,
  DEFAULT_GEMINI_MODEL,
  isGeminiModelNotFoundError,
  resolveGeminiModel,
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
