import { describe, expect, it } from "vitest"

import { resolveProviderAvailability } from "@/lib/auth/providers"

describe("resolveProviderAvailability", () => {
  it("always enables google", () => {
    expect(resolveProviderAvailability({}).google).toBe(true)
  })

  it("enables naver only when both client id and secret are set", () => {
    expect(resolveProviderAvailability({}).naver).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "id" }).naver
    ).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(true)
  })

  it("treats whitespace-only naver env as unset", () => {
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "  ", NAVER_CLIENT_SECRET: "secret" }).naver
    ).toBe(false)
    expect(
      resolveProviderAvailability({ NAVER_CLIENT_ID: "id", NAVER_CLIENT_SECRET: "   " }).naver
    ).toBe(false)
  })

  it("enables kakao only when the rest api key is set", () => {
    expect(resolveProviderAvailability({}).kakao).toBe(false)
    expect(
      resolveProviderAvailability({ KAKAO_REST_API_KEY: "key" }).kakao
    ).toBe(true)
    expect(
      resolveProviderAvailability({ KAKAO_REST_API_KEY: "   " }).kakao
    ).toBe(false)
  })

  it("enables apple only when APPLE_LOGIN_ENABLED is truthy", () => {
    expect(resolveProviderAvailability({}).apple).toBe(false)
    expect(resolveProviderAvailability({ APPLE_LOGIN_ENABLED: "true" }).apple).toBe(true)
    expect(resolveProviderAvailability({ APPLE_LOGIN_ENABLED: "1" }).apple).toBe(true)
    expect(resolveProviderAvailability({ APPLE_LOGIN_ENABLED: "false" }).apple).toBe(false)
    expect(resolveProviderAvailability({ APPLE_LOGIN_ENABLED: "  " }).apple).toBe(false)
  })
})
