import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * `POST /api/lead` 의 문의 유형 게이트.
 *
 * 이 라우트는 공개 무인증이고 `sourceDetail` 이 `leads.source_detail`(CHECK 제약 없음)에
 * 그대로 실린다. 등록되지 않은 유형이 통과하면 상담 유형 집계가 오염된다.
 *
 * 게이트가 **거부한 요청은 캡처 파이프라인에 닿지 않아야** 하므로, 통과 여부는
 * `submitLeadCapture` 호출 여부로 검증한다.
 */

const submitLeadCapture = vi.fn()

vi.mock("@/lib/server/lead-capture", () => ({
  submitLeadCapture: (...args: unknown[]) => submitLeadCapture(...args),
}))

// 같은 출처 판정과 레이트리밋은 이 테스트의 관심사가 아니다 — 항상 통과시킨다.
vi.mock("@/lib/server/same-origin", () => ({
  isCrossOriginRequest: () => false,
}))

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: async () => ({ allowed: true, resetAt: Date.now() + 60_000 }),
  getClientIp: () => "127.0.0.1",
}))

vi.mock("@/lib/marketing/server-conversions", () => ({
  getMarketingRequestMeta: () => ({}),
}))

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const baseBody = {
  source: "contact_page",
  org: "무궁화 학원",
  name: "홍길동",
  phone: "010-1234-5678",
  message: "도입 검토 중입니다.",
}

let POST: typeof import("@/app/api/lead/route").POST

beforeEach(async () => {
  submitLeadCapture.mockReset()
  submitLeadCapture.mockResolvedValue({ status: 200, body: { ok: true, leadId: "lead-1" } })
  ;({ POST } = await import("@/app/api/lead/route"))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("POST /api/lead — 문의 유형 게이트", () => {
  it("등록된 유형은 통과시킨다", async () => {
    const res = await POST(makeRequest({ ...baseBody, sourceDetail: "도입 상담" }))

    expect(res.status).toBe(200)
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
  })

  it("snake_case 별칭도 같은 기준으로 통과시킨다", async () => {
    const res = await POST(makeRequest({ ...baseBody, source_detail: "하드웨어/설치/AS" }))

    expect(res.status).toBe(200)
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
  })

  it("미등록 유형은 400 으로 막고 캡처까지 가지 않는다", async () => {
    const res = await POST(makeRequest({ ...baseBody, sourceDetail: "<script>alert(1)</script>" }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({ ok: false })
    expect(submitLeadCapture).not.toHaveBeenCalled()
  })

  it("네임스페이스 값이라도 contact_page 에서는 유형이 아니면 막는다", async () => {
    const res = await POST(makeRequest({ ...baseBody, sourceDetail: "checkout_request:hardware" }))

    expect(res.status).toBe(400)
    expect(submitLeadCapture).not.toHaveBeenCalled()
  })

  it("유형이 비어 있으면 통과시킨다 — 메타데이터 때문에 실제 상담 요청을 떨어뜨리지 않는다", async () => {
    const res = await POST(makeRequest({ ...baseBody, sourceDetail: "   " }))

    expect(res.status).toBe(200)
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
  })

  it("유형 키가 아예 없어도 통과시킨다", async () => {
    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(200)
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
  })

  it("다른 소스는 게이트 대상이 아니다 — demo_modal 의 자유 문자열을 막지 않는다", async () => {
    const res = await POST(
      makeRequest({
        source: "demo_modal",
        sourceDetail: "hero_primary_cta",
        org: "무궁화 학원",
        name: "홍길동",
        role: "원장",
        size: "100~300명",
        email: "ops@example.com",
        phone: "010-1234-5678",
      })
    )

    expect(res.status).toBe(200)
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
  })
})
