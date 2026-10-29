import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const capture = vi.hoisted(() => vi.fn())
vi.mock("@/lib/server/lead-capture", () => ({ submitLeadCapture: capture }))
vi.mock("@/lib/server/same-origin", () => ({ isCrossOriginRequest: () => false }))
vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimitDistributed: async () => ({ allowed: true }), getClientIp: () => "127.0.0.1",
}))
import { POST } from "@/app/api/lead/route"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

const lead = { source: "contact_page", org: "학원", name: "홍길동", phone: "01012345678", message: "상담 신청",
  utmSource: "source", utm_medium: "medium", gclid: "click", fbclid: "fb", msclkid: "ms", ttclid: "tt",
  landing_page: "https://example.org/?gclid=secret", currentPage: "https://example.org/?utm_source=secret",
  referrer: "https://example.org/?id=secret", anonymous_id: "anon", naver_ad: { n_media: "m" },
}
function request(analytics: boolean, marketing: boolean, observe = true, marker = "a") {
  const record = { v: CONSENT_POLICY_VERSION, s: 1, ts: 1, analytics, marketing, ackAnalytics: "a", ackMarketing: "m" }
  return new NextRequest("https://classin.co.kr/api/lead", { method: "POST", headers: {
    "content-type": "application/json", cookie: `cln_consent=${encodeURIComponent(JSON.stringify(record))}; cln_revoke_a=${marker}; cln_revoke_m=m`,
    ...(observe ? { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION } : {}),
  }, body: JSON.stringify(lead) })
}
beforeEach(() => { capture.mockReset(); capture.mockResolvedValue({ status: 200, body: { ok: true, stored: true } }) })
describe("공개 문의의 서버 귀속 동의", () => {
  it.each([
    [false, false, true, "a"],
    [true, true, false, "a"],
  ])("동의 또는 관찰이 없으면 임의 귀속을 제거하고 신청을 접수한다", async (analytics, marketing, observe, marker) => {
    expect((await POST(request(analytics, marketing, observe, marker))).status).toBe(200)
    const payload = capture.mock.calls[0][0]
    expect(payload).toMatchObject({ source: "contact_page", name: lead.name, phone: lead.phone, message: lead.message })
    for (const field of ["utmSource", "utm_medium", "gclid", "fbclid", "msclkid", "ttclid", "landing_page", "currentPage", "referrer", "anonymous_id", "naver_ad"]) expect(payload).not.toHaveProperty(field)
  })
  it("유효한 양쪽 동의가 있으면 정상 귀속을 보존한다", async () => {
    expect((await POST(request(true, true))).status).toBe(200)
    expect(capture.mock.calls[0][0]).toEqual(lead)
  })
  it("마케팅만 허용하면 광고 귀속은 보존하고 분석 ID는 제거한다", async () => {
    await POST(request(false, true))
    expect(capture.mock.calls[0][0]).toMatchObject({ gclid: "click", utmSource: "source" })
    expect(capture.mock.calls[0][0]).not.toHaveProperty("anonymous_id")
  })
  it("분석만 허용하면 익명 ID는 보존하고 광고 귀속과 URL은 제거한다", async () => {
    await POST(request(true, false))
    expect(capture.mock.calls[0][0]).toMatchObject({ anonymous_id: "anon" })
    expect(capture.mock.calls[0][0]).not.toHaveProperty("gclid")
    expect(capture.mock.calls[0][0]).not.toHaveProperty("currentPage")
  })
  it("이전 분석 허용이 최신 철회와 다르면 익명 ID를 제거한다", async () => {
    await POST(request(true, true, true, "new"))
    expect(capture.mock.calls[0][0]).not.toHaveProperty("anonymous_id")
    expect(capture.mock.calls[0][0]).toHaveProperty("gclid", "click")
  })
})
