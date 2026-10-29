import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { CONSENT_OBSERVATION_HEADER, CONSENT_OBSERVATION_VERSION } from "@/lib/consent/observation-contract"

const submitCheckout = vi.hoisted(() => vi.fn())
const submitShowroom = vi.hoisted(() => vi.fn())
vi.mock("@/lib/checkout-requests", () => ({ submitCheckoutRequest: submitCheckout }))
vi.mock("@/lib/showroom/bookings", () => ({ submitShowroomBooking: submitShowroom }))
vi.mock("@/lib/showroom/availability", () => ({ isShowroomSlotAvailable: vi.fn() }))
vi.mock("@/lib/server/rate-limit", () => ({ getClientIp: () => "127.0.0.1", checkRateLimitDistributed: async () => ({ allowed: true }) }))

import { POST as checkout } from "@/app/api/checkout/request/route"
import { POST as showroom } from "@/app/api/showroom/bookings/route"

const body = {
  name: "홍길동", phone: "01012345678", consent: true, sourcePage: "https://classin.co.kr/contact?gclid=secret#fragment",
  anonymousId: "attacker", anonymous_id: "attacker-snake", utm_source: "ad", gclid: "click",
  current_page: "https://classin.co.kr/contact?gclid=secret", referrer: "https://example.com/?id=secret",
  attribution: { fbclid: "nested-click", naver_ad: { n_query: "keyword" } },
}

function request(path: string, analytics: boolean, marketing: boolean, observation = true, pending = false) {
  const consent = { v: CONSENT_POLICY_VERSION, analytics, marketing, ts: 1, s: pending ? 0 : 1, ackAnalytics: "a", ackMarketing: "m" }
  return new NextRequest(`https://classin.co.kr${path}`, {
    method: "POST",
    headers: { origin: "https://classin.co.kr", "content-type": "application/json",
      cookie: `cln_consent=${encodeURIComponent(JSON.stringify(consent))}; cln_revoke_a=a; cln_revoke_m=m; cln_aid=cookie-id`,
      ...(observation ? { [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe.each([
  ["도입 신청", "/api/checkout/request", checkout, submitCheckout],
  ["쇼룸 예약", "/api/showroom/bookings", showroom, submitShowroom],
] as const)("%s 귀속 서버 경계", (_name, path, post, submit) => {
  beforeEach(() => { submit.mockReset(); submit.mockResolvedValue({ status: 200, body: { ok: true } }) })

  it("동의 없이 구버전 본문을 보내도 정상 신청하고 식별자·URL 쿼리를 버린다", async () => {
    const res = await post(request(path, true, true, false))
    expect(res.status).toBe(200)
    expect(submit).toHaveBeenCalledOnce()
    const sanitized = submit.mock.calls[0][0]
    expect(sanitized).toMatchObject({ name: "홍길동", phone: "01012345678", consent: true, sourcePage: "/contact" })
    expect(JSON.stringify(sanitized)).not.toMatch(/secret|attacker|nested-click|keyword|"gclid"|utm_source|referrer|anonymous/)
  })

  it("각 범주에 따라 분리하고 본문의 위조 익명 ID 대신 쿠키를 쓴다", async () => {
    await post(request(path, true, false))
    expect(submit.mock.calls[0][0]).toMatchObject({ anonymousId: "cookie-id", sourcePage: "/contact" })
    expect(submit.mock.calls[0][0]).not.toHaveProperty("gclid")
    await post(request(path, false, true))
    const marketing = submit.mock.calls[1][0]
    expect(marketing).toMatchObject({ gclid: "click", utmSource: "ad", fbclid: "nested-click" })
    expect(marketing).not.toHaveProperty("anonymousId")
  })

  it("미확인 동의는 실패 닫힘이다", async () => {
    const pending = await post(request(path, true, true, true, true))
    expect(pending.status).toBe(200)
    expect(submit.mock.calls[0][0]).not.toHaveProperty("anonymousId")
    expect(submit.mock.calls[0][0]).not.toHaveProperty("gclid")
  })

  it("철회 마커가 어긋난 응답과 외부 URL은 실패 닫힘이다", async () => {
    const consent = { v: CONSENT_POLICY_VERSION, analytics: true, marketing: true, ts: 1, s: 1, ackAnalytics: "old-a", ackMarketing: "old-m" }
    const req = new NextRequest(`https://classin.co.kr${path}`, { method: "POST", headers: {
      origin: "https://classin.co.kr", "content-type": "application/json",
      cookie: `cln_consent=${encodeURIComponent(JSON.stringify(consent))}; cln_revoke_a=new-a; cln_revoke_m=new-m; cln_aid=id`,
      [CONSENT_OBSERVATION_HEADER]: CONSENT_OBSERVATION_VERSION,
    }, body: JSON.stringify({ ...body, sourcePage: "https://evil.example/path?gclid=secret" }) })
    expect((await post(req)).status).toBe(200)
    expect(submit.mock.calls[0][0]).toMatchObject({ sourcePage: null })
    expect(submit.mock.calls[0][0]).not.toHaveProperty("anonymousId")
    expect(submit.mock.calls[0][0]).not.toHaveProperty("gclid")
  })
})
