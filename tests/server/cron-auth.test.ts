import { describe, expect, it } from "vitest"

import { checkCronAuth } from "@/lib/server/cron-auth"

// headers.get()만 필요한 최소 형태 — 실제 NextRequest도 이 인터페이스를 만족한다.
function reqWithAuth(value: string | null) {
  return {
    headers: {
      get: (name: string) => (name.toLowerCase() === "authorization" ? value : null),
    },
  }
}

describe("checkCronAuth", () => {
  it("Bearer 뒤 값이 시크릿과 정확히 일치하면 ok", () => {
    expect(checkCronAuth(reqWithAuth("Bearer cron-secret-123"), "cron-secret-123")).toBe("ok")
  })

  it("대소문자가 다르면 unauthorized", () => {
    expect(checkCronAuth(reqWithAuth("Bearer CRON-SECRET-123"), "cron-secret-123")).toBe(
      "unauthorized"
    )
  })

  it("공백이 섞이면 unauthorized", () => {
    expect(checkCronAuth(reqWithAuth("Bearer cron-secret-123 "), "cron-secret-123")).toBe(
      "unauthorized"
    )
    expect(checkCronAuth(reqWithAuth("Bearer  cron-secret-123"), "cron-secret-123")).toBe(
      "unauthorized"
    )
  })

  it("길이가 다르면 예외 없이 unauthorized", () => {
    expect(checkCronAuth(reqWithAuth("Bearer cron-secret-1"), "cron-secret-123")).toBe(
      "unauthorized"
    )
    expect(
      checkCronAuth(reqWithAuth("Bearer cron-secret-123-and-more"), "cron-secret-123")
    ).toBe("unauthorized")
  })

  it("CRON_SECRET이 설정되지 않았으면 missing_secret — 헤더 값과 무관", () => {
    expect(checkCronAuth(reqWithAuth("Bearer cron-secret-123"), undefined)).toBe(
      "missing_secret"
    )
    expect(checkCronAuth(reqWithAuth(null), undefined)).toBe("missing_secret")
    expect(checkCronAuth(reqWithAuth(null), "")).toBe("missing_secret")
  })

  it("Authorization 헤더가 없으면 unauthorized", () => {
    expect(checkCronAuth(reqWithAuth(null), "cron-secret-123")).toBe("unauthorized")
  })

  it("소문자 bearer 접두는 기존 동작과 같게 unauthorized 처리한다", () => {
    expect(checkCronAuth(reqWithAuth("bearer cron-secret-123"), "cron-secret-123")).toBe(
      "unauthorized"
    )
  })

  it("Bearer 접두 없이 시크릿 값만 온 경우도 unauthorized", () => {
    expect(checkCronAuth(reqWithAuth("cron-secret-123"), "cron-secret-123")).toBe("unauthorized")
  })

  it("어떤 입력에도 throw 하지 않는다", () => {
    const long = "x".repeat(10_000)
    expect(() => checkCronAuth(reqWithAuth(`Bearer ${long}`), "cron-secret-123")).not.toThrow()
    expect(checkCronAuth(reqWithAuth(`Bearer ${long}`), "cron-secret-123")).toBe("unauthorized")
  })

  it("secret 인자를 생략하면 process.env.CRON_SECRET을 기본값으로 사용한다", () => {
    const original = process.env.CRON_SECRET
    process.env.CRON_SECRET = "env-cron-secret"
    try {
      expect(checkCronAuth(reqWithAuth("Bearer env-cron-secret"))).toBe("ok")
      expect(checkCronAuth(reqWithAuth("Bearer wrong-value"))).toBe("unauthorized")
    } finally {
      if (original === undefined) delete process.env.CRON_SECRET
      else process.env.CRON_SECRET = original
    }
  })
})
