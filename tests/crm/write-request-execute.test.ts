import { describe, expect, it } from "vitest"

import { resolveCrmWriteExecuteOutcome } from "@/lib/crm/write-request-execute"

describe("resolveCrmWriteExecuteOutcome", () => {
  it("200 + succeeded request는 성공으로 해석한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(
      { ok: true, request: { status: "succeeded", error: null, last_attempt_error: null } },
      200
    )
    expect(outcome.ok).toBe(true)
    expect(outcome.status).toBe("succeeded")
    expect(outcome.message).toContain("실행")
  })

  it("409 + failed request는 request.error를 사용자 메시지로 노출한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(
      {
        ok: false,
        request: {
          status: "failed",
          error: "Xiaoshouyi write request failed: 500",
          last_attempt_error: "Xiaoshouyi write request failed: 500",
        },
      },
      409
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe("failed")
    expect(outcome.message).toContain("Xiaoshouyi write request failed: 500")
  })

  it("request.error가 없으면 last_attempt_error로 폴백한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(
      { ok: false, request: { status: "failed", error: null, last_attempt_error: "token expired" } },
      409
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain("token expired")
  })

  it("실행 자체가 거부되면(409 { error }) 서버 에러 메시지를 그대로 노출한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(
      { error: "Only approved CRM write requests can be executed" },
      409
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBeNull()
    expect(outcome.message).toBe("Only approved CRM write requests can be executed")
  })

  it("body 파싱 실패 시 HTTP status 기반 메시지로 폴백한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(null, 500)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain("500")
  })

  it("ok=true라도 status가 succeeded가 아니면 실패로 처리한다", () => {
    const outcome = resolveCrmWriteExecuteOutcome(
      { ok: true, request: { status: "sent", error: null, last_attempt_error: null } },
      200
    )
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe("sent")
    expect(outcome.message).toContain("sent")
  })
})
