// 장부 속도 2배(2026-09-14) — 구글 API 오류 중 "다시 해도 똑같은" 것은 재시도하지 않는다.
// 실측: 시트 공유가 끊긴 뒤(403) summary 가 Drive 신선도 조회를 0+200+800+2000ms 백오프로
// 매 요청 재시도해 p50 4.1초, data-quality 는 Sheets 3콜 재시도로 5초 뒤 500 이었다.
import { describe, expect, it } from "vitest"

import { isRetryableGoogleError } from "@/lib/branch/google-retry"

describe("isRetryableGoogleError", () => {
  it("does not retry client errors that will fail the same way again", () => {
    expect(isRetryableGoogleError({ status: 403 })).toBe(false) // 공유 끊김·API 미사용 설정
    expect(isRetryableGoogleError({ code: 404 })).toBe(false) // 시트 ID 오류
    expect(isRetryableGoogleError({ response: { status: 400 } })).toBe(false) // 범위 문법 오류
    expect(isRetryableGoogleError({ code: "401" })).toBe(false) // 자격증명 오류
  })

  it("retries rate limits, server errors, and network failures", () => {
    expect(isRetryableGoogleError({ status: 429 })).toBe(true)
    expect(isRetryableGoogleError({ response: { status: 503 } })).toBe(true)
    expect(isRetryableGoogleError({ code: "ECONNRESET" })).toBe(true)
    expect(isRetryableGoogleError(new Error("socket hang up"))).toBe(true)
  })

  it("treats unknown shapes as retryable (keep the old safety net)", () => {
    expect(isRetryableGoogleError(null)).toBe(true)
    expect(isRetryableGoogleError("boom")).toBe(true)
    expect(isRetryableGoogleError({ status: "nope" })).toBe(true)
  })
})
