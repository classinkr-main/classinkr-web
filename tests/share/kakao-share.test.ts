import { readFileSync } from "node:fs"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  KAKAO_SDK_INTEGRITY,
  KAKAO_SDK_URL,
  KAKAO_SDK_VERSION,
  getKakaoJsKey,
  loadKakaoSdk,
} from "@/lib/share/kakao-share"

describe("kakao share SDK", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is off unless NEXT_PUBLIC_KAKAO_JS_KEY is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "  ")
    expect(getKakaoJsKey()).toBeNull()
    await expect(loadKakaoSdk()).rejects.toThrow()

    vi.stubEnv("NEXT_PUBLIC_KAKAO_JS_KEY", "js-key")
    expect(getKakaoJsKey()).toBe("js-key")
  })

  it("pins an exact SDK version with a sha384 SRI hash", () => {
    expect(KAKAO_SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(KAKAO_SDK_URL).toBe(`https://t1.kakaocdn.net/kakao_js_sdk/${KAKAO_SDK_VERSION}/kakao.min.js`)
    expect(KAKAO_SDK_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
  })

  it("is allowed by the CSP: SDK script host and the desktop sharer form POST", () => {
    const config = readFileSync("next.config.ts", "utf8")
    const scriptSrc = config.split("\n").find((line) => line.includes("`script-src ")) ?? ""
    const formAction = config.split("\n").find((line) => line.includes('"form-action')) ?? ""
    expect(scriptSrc).toContain("https://t1.kakaocdn.net")
    expect(formAction).toContain("https://sharer.kakao.com")
  })
})
