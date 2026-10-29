import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { append, capture } = vi.hoisted(() => ({ append: vi.fn(), capture: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/meets/attendee-sheet", () => ({ appendMeetsAttendee: append }))
vi.mock("@/lib/server/lead-capture", () => ({ submitLeadCapture: capture }))
vi.mock("@/lib/server/rate-limit", () => ({
  getClientIp: () => "test-ip",
  checkRateLimitDistributed: async () => ({ allowed: true, resetAt: Date.now() + 1000 }),
}))

import { POST } from "@/app/api/events/meets-july/register/route"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

const input = {
  city: "jeonju", name: "홍길동", org: "학교", role: "원장", phone: "01012345678", email: "test@example.com",
  marketingConsent: true, utmSource: "search", utmCampaign: "campaign", gclid: "click-secret", fbclid: "fb-secret",
  landingPage: "https://classin.kr/l/meets-july?gclid=click-secret", referrer: "https://search.example/?q=secret",
  anonymousId: "attacker-id", naverAd: { n_media: "123", n_query: "secret" },
}
function request(options: { observation?: boolean; marketing?: boolean; analytics?: boolean; sync?: number; stale?: boolean } = {}) {
  const record = { v: CONSENT_POLICY_VERSION, s: options.sync ?? 1, analytics: options.analytics ?? true,
    marketing: options.marketing ?? true, ackAnalytics: "a", ackMarketing: "m" }
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}; cln_revoke_a=a; cln_revoke_m=${options.stale ? "new-m" : "m"}; cln_aid=anon-secret; _ga=GA1.1.123.456; _fbp=fb-secret`
  return new NextRequest("https://classin.kr/api/events/meets-july/register", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://classin.kr", referer: "https://classin.kr/secret?q=secret", cookie,
      ...(options.observation === false ? {} : { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION }) },
    body: JSON.stringify(input),
  })
}

describe("행사 신청 귀속 동의 경계", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    append.mockResolvedValue({ sheetTabTitle: "test", appendedRange: "A1" })
    capture.mockResolvedValue({ status: 200, body: { ok: true, stored: true } })
  })

  it.each([
    ["구형 탭 또는 직접 요청", { observation: false }],
    ["마케팅 거절", { marketing: false }],
    ["마케팅 철회 후 오래된 허용", { stale: true }],
    ["감사 미확인", { sync: 0 }],
  ])("%s에는 본문 귀속 정보 없이 필수 신청을 보존한다", async (_label, options) => {
    expect((await POST(request(options))).status).toBe(200)
    expect(append).toHaveBeenCalledOnce()
    expect(append.mock.calls[0][0]).toMatchObject({ name: input.name, org: input.org, phone: input.phone, attribution: {
      utmSource: undefined, utmCampaign: undefined, gclid: undefined, fbclid: undefined, landingPage: undefined, referrer: undefined, naverAd: null,
    } })
    expect(capture.mock.calls[0][0]).toMatchObject({ name: input.name, phone: input.phone, utmSource: undefined,
      gclid: undefined, fbclid: undefined, landingPage: undefined, referrer: undefined, naverAd: undefined })
    expect(capture.mock.calls[0][1].requestMeta).toMatchObject({ sourceUrl: "https://classin.kr", fbc: null, fbp: null })
  })

  it("확인된 마케팅 동의가 있으면 기존 캠페인 귀속을 보존한다", async () => {
    expect((await POST(request())).status).toBe(200)
    expect(append.mock.calls[0][0].attribution).toMatchObject({ utmSource: "search", utmCampaign: "campaign", gclid: "click-secret", fbclid: "fb-secret", landingPage: input.landingPage, referrer: input.referrer, naverAd: input.naverAd })
    expect(capture.mock.calls[0][0]).toMatchObject({ utmSource: "search", gclid: "click-secret" })
  })

  it("분석 동의가 없으면 익명 식별자를 전달하지 않는다", async () => {
    expect((await POST(request({ analytics: false }))).status).toBe(200)
    expect(capture.mock.calls[0][1].requestMeta).toMatchObject({ anonymousId: null, gaClientId: null })
  })

  it("시트 오류 시 수기 복구 로그에도 미동의 귀속값을 남기지 않는다", async () => {
    append.mockRejectedValueOnce(new Error("sheet offline"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await POST(request({ observation: false }))).status).toBe(500)
    expect(JSON.stringify(error.mock.calls)).not.toContain("click-secret")
    expect(JSON.stringify(error.mock.calls)).not.toContain("q=secret")
    expect(capture).toHaveBeenCalledOnce()
    error.mockRestore()
  })
})
