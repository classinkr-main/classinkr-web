import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { capture, stitch } = vi.hoisted(() => ({ capture: vi.fn(), stitch: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/server/lead-capture", () => ({ submitLeadCapture: capture }))
vi.mock("@/lib/identity/stitch", () => ({ stitchIdentity: stitch }))
vi.mock("@/lib/server/rate-limit", () => ({
  getClientIp: () => "test-ip",
  checkRateLimitDistributed: async () => ({ allowed: true }),
}))

import { POST } from "@/app/api/newsletter/subscribe/route"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

const attribution = { utmSource: "search", utmCampaign: "campaign", gclid: "click-secret", fbclid: "fb-secret",
  msclkid: "ms-secret", ttclid: "tt-secret", landingPage: "https://classin.kr/?gclid=click-secret",
  currentPage: "https://classin.kr/news?q=secret", referrer: "https://search.example/?q=secret", naverAd: { n_media: "123", n_query: "secret" } }
function request(options: { observation?: boolean; cookie?: boolean; marketing?: boolean; analytics?: boolean; sync?: number; staleMarketing?: boolean; staleAnalytics?: boolean } = {}) {
  const record = { v: CONSENT_POLICY_VERSION, s: options.sync ?? 1, analytics: options.analytics ?? true,
    marketing: options.marketing ?? true, ackAnalytics: "a", ackMarketing: "m" }
  const cookie = `cln_consent=${encodeURIComponent(JSON.stringify(record))}; cln_revoke_a=${options.staleAnalytics ? "new-a" : "a"}; cln_revoke_m=${options.staleMarketing ? "new-m" : "m"}; cln_aid=anon-secret; _ga=GA1.1.123.456; _fbp=fb-secret`
  return new NextRequest("https://classin.kr/api/newsletter/subscribe", {
    method: "POST", headers: { "content-type": "application/json", origin: "https://classin.kr", referer: "https://classin.kr/secret?q=secret",
      ...(options.cookie === false ? {} : { cookie }),
      ...(options.observation === false ? {} : { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION }) },
    body: JSON.stringify({ email: "USER@example.com", name: "홍길동", source: "newsletter", attribution }),
  })
}

describe("뉴스레터 구독 귀속 동의 경계", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capture.mockResolvedValue({ status: 200, body: { ok: true, stored: true, leadId: "lead-1" } })
    stitch.mockResolvedValue({ ok: true })
  })

  it.each([
    ["구형 탭이나 직접 요청", { observation: false }],
    ["동의 쿠키 없음", { cookie: false }],
    ["마케팅 거절", { marketing: false }],
    ["오래된 마케팅 허용", { staleMarketing: true }],
    ["서버 미확인", { sync: 0 }],
  ])("%s에도 광고 귀속 없이 구독은 처리한다", async (_label, options) => {
    expect((await POST(request(options))).status).toBe(200)
    expect(capture).toHaveBeenCalledOnce()
    expect(capture.mock.calls[0][0]).toMatchObject({ source: "newsletter", email: "user@example.com", marketingConsent: true,
      utmSource: undefined, utmCampaign: undefined, gclid: undefined, fbclid: undefined, msclkid: undefined,
      ttclid: undefined, landingPage: undefined, currentPage: undefined, referrer: undefined, naverAd: undefined })
    expect(capture.mock.calls[0][1].requestMeta).toMatchObject({ sourceUrl: "https://classin.kr", fbc: null, fbp: null })
    if (options.observation === false || options.cookie === false || options.sync === 0) expect(stitch).not.toHaveBeenCalled()
  })

  it("마케팅과 분석 동의 확인 시 귀속 보존 및 익명 리드 결합을 수행한다", async () => {
    expect((await POST(request())).status).toBe(200)
    expect(capture.mock.calls[0][0]).toMatchObject({ utmSource: "search", gclid: "click-secret", naverAd: attribution.naverAd, currentPage: attribution.currentPage })
    expect(stitch).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: "anon-secret", leadId: "lead-1", email: "user@example.com", emailVerified: false }))
  })

  it.each([{ analytics: false }, { staleAnalytics: true }])("분석이 거절 또는 철회되면 익명 결합을 생략한다", async (options) => {
    expect((await POST(request(options))).status).toBe(200)
    expect(capture.mock.calls[0][1].requestMeta).toMatchObject({ anonymousId: null, gaClientId: null })
    expect(stitch).not.toHaveBeenCalled()
    expect(capture.mock.calls[0][0]).toMatchObject({ gclid: "click-secret" })
  })

  it("마케팅 거절과 별개로 분석이 확인되면 익명 결합만 수행한다", async () => {
    expect((await POST(request({ marketing: false }))).status).toBe(200)
    expect(capture.mock.calls[0][0].gclid).toBeUndefined()
    expect(stitch).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: "anon-secret" }))
  })
})
