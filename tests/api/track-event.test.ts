import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ from })),
}))

import { CONSENT_POLICY_VERSION } from "@/lib/consent/consent"
import { POST } from "@/app/api/track/event/route"

/** 라우트가 서버측에서 분석 동의를 검증하므로 동의 쿠키를 실어 보낸다. */
const CONSENT_COOKIE_HEADER = `cln_consent=${encodeURIComponent(
  JSON.stringify({
    v: CONSENT_POLICY_VERSION,
    analytics: true,
    marketing: true,
    ts: 1,
    s: 1,
  })
)}; cln_aid=anon-track-test`

function trackRequest(body: unknown, cookie: string | null = CONSENT_COOKIE_HEADER) {
  return new NextRequest("https://classin.kr/api/track/event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://classin.kr",
      "x-forwarded-for": "track-event-test",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe("track event route", () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it("keeps blog and event CTA attribution while dropping unknown params", async () => {
    const response = await POST(
      trackRequest({
        event: "click_cta",
        page: "/events/sample-event",
        params: {
          button: "event_detail_hero_cta",
          destination: "/contact?source=event&event=sample-event",
          slug: "blog-post-slug",
          event_slug: "sample-event",
          event_id: "event-123",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(from).toHaveBeenCalledWith("client_events")
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "click_cta",
        params: {
          button: "event_detail_hero_cta",
          destination: "/contact?source=event&event=sample-event",
          slug: "blog-post-slug",
          event_slug: "sample-event",
          event_id: "event-123",
        },
      })
    )
  })

  it("accepts chatbot events emitted by the floating assistant", async () => {
    const response = await POST(
      trackRequest({
        event: "chatbot_teaser_shown",
        page: "/contact",
        params: {
          path: "/contact",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "chatbot_teaser_shown",
        params: {
          path: "/contact",
        },
      })
    )
  })

  it("accepts purchase events emitted by checkout success", async () => {
    const response = await POST(
      trackRequest({
        event: "purchase",
        page: "/checkout/success",
        params: {
          transaction_id: "sw_sub_123",
          event_id: "purchase:sw_sub_123",
          value: 550000,
          currency: "KRW",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "purchase",
        params: {
          transaction_id: "sw_sub_123",
          event_id: "purchase:sw_sub_123",
          value: 550000,
          currency: "KRW",
        },
      })
    )
  })

  it("accepts internal page exit engagement events", async () => {
    const response = await POST(
      trackRequest({
        event: "page_exit",
        page: "/product/sw",
        params: {
          path: "/product/sw?utm_source=meta",
          title: "Classin SW",
          duration_ms: 12345,
          exit_type: "pagehide",
          ignored: "drop-me",
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: true })
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_name: "page_exit",
        params: {
          path: "/product/sw?utm_source=meta",
          title: "Classin SW",
          duration_ms: 12345,
          exit_type: "pagehide",
        },
      })
    )
  })
})

describe("track event route — 서버측 동의 게이트", () => {
  beforeEach(() => {
    from.mockClear()
    insert.mockReset()
    insert.mockResolvedValue({ error: null })
  })

  it("동의 쿠키가 없으면 적재하지 않는다", async () => {
    const response = await POST(trackRequest({ event: "page_view", page: "/" }, null))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, stored: false, reason: "no_consent" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("분석을 거부한 사용자는 적재하지 않는다", async () => {
    const denied = `cln_consent=${encodeURIComponent(
      JSON.stringify({ v: CONSENT_POLICY_VERSION, analytics: false, marketing: true, ts: 1, s: 1 })
    )}`

    const response = await POST(trackRequest({ event: "page_view", page: "/" }, denied))

    expect(await response.json()).toMatchObject({ stored: false, reason: "no_consent" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("정책 버전이 지난 동의 쿠키는 무효로 본다", async () => {
    const stale = `cln_consent=${encodeURIComponent(
      JSON.stringify({ v: "2000-01-01", analytics: true, marketing: true, ts: 1, s: 1 })
    )}`

    const response = await POST(trackRequest({ event: "page_view", page: "/" }, stale))

    expect(await response.json()).toMatchObject({ stored: false, reason: "no_consent" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("익명 식별자는 본문이 아니라 cln_aid 쿠키에서만 읽는다", async () => {
    // 회귀 방지: 본문 값을 신뢰하면 남의 cln_aid 로 타인 리드에 이벤트를 귀속시킬 수 있다.
    const response = await POST(
      trackRequest({ event: "page_view", page: "/", anonymousId: "victim-anonymous-id" })
    )

    expect(response.status).toBe(200)
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ anonymous_id: "anon-track-test" })
    )
  })
})
