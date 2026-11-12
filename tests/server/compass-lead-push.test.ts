import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LeadPayload } from "@/lib/lead-types"

// 홈페이지 폼 리드 → Compass 밀어 넣기(lib/server/compass-lead-push.ts, Compass ADR-0083).
// 대상(env·HTTPS) · 소스 판정 · 본문 모양 · 헤더 · 실패 throw, 그리고 runLeadCaptureEffects 안에서 폼 소스만 보내고 실패가 warnings 로 가는지.

const BASE: LeadPayload = {
  source: "contact_page",
  name: " 홍원장 ",
  org: "세담학원",
  role: "원장",
  size: "30",
  email: "owner@example.com",
  phone: "010-0000-1001",
  branch: "청주",
  message: "칠판 두 대",
  timestamp: "2026-11-04T01:00:00.000Z",
  sourceDetail: "도입 상담",
  utmSource: "google",
  utmMedium: "cpc",
  landingPage: "https://classin.co.kr/landing",
  currentPage: "https://classin.co.kr/contact",
}

describe("compassLeadPushTarget · env 둘 + HTTPS 일 때만", () => {
  it("둘 다 있고 HTTPS 면 오리진 + /api/webhook/home-lead(경로·쿼리는 버린다)", async () => {
    const { compassLeadPushTarget } = await import("@/lib/server/compass-lead-push")
    expect(compassLeadPushTarget({ COMPASS_BRIDGE_URL: " https://mkt.example.test/some/path?x=1#h ", COMPASS_LEAD_WEBHOOK_TOKEN: " tok " })).toEqual({
      url: "https://mkt.example.test/api/webhook/home-lead",
      token: "tok",
    })
  })

  it.each([
    [{}, "둘 다 없음"],
    [{ COMPASS_BRIDGE_URL: "https://mkt.example.test" }, "토큰 없음"],
    [{ COMPASS_LEAD_WEBHOOK_TOKEN: "tok" }, "URL 없음"],
    [{ COMPASS_BRIDGE_URL: "http://localhost:3001", COMPASS_LEAD_WEBHOOK_TOKEN: "tok" }, "HTTP(로컬)는 운영 Compass 로 밀지 않는다"],
    [{ COMPASS_BRIDGE_URL: "https://user:pw@mkt.example.test", COMPASS_LEAD_WEBHOOK_TOKEN: "tok" }, "자격이 박힌 URL"],
    [{ COMPASS_BRIDGE_URL: "not a url", COMPASS_LEAD_WEBHOOK_TOKEN: "tok" }, "URL 아님"],
  ] as Array<[Record<string, string | undefined>, string]>)("%j → null (%s)", async (env) => {
    const { compassLeadPushTarget } = await import("@/lib/server/compass-lead-push")
    expect(compassLeadPushTarget(env)).toBeNull()
  })
})

describe("isCompassPushSource · 공개 폼 소스만", () => {
  it.each([
    ["demo_modal", true],
    ["contact_page", true],
    ["showroom_booking", true],
    ["checkout_request", true],
    ["chatbot", true],
    ["newsletter", false],
    ["meta_lead_ads", false],
    ["admin_manual", false],
    [null, false],
    [undefined, false],
  ] as Array<[string | null | undefined, boolean]>)("%j → %j", async (source, expected) => {
    const { isCompassPushSource } = await import("@/lib/server/compass-lead-push")
    expect(isCompassPushSource(source)).toBe(expected)
  })

  it("자료 신청(뉴스레터 + leadMagnet)은 보낸다 · 빈 leadMagnet·다른 소스의 leadMagnet 은 소스 규칙 그대로", async () => {
    const { isCompassPushSource } = await import("@/lib/server/compass-lead-push")
    expect(isCompassPushSource("newsletter", "ai-class-guide")).toBe(true)
    expect(isCompassPushSource("newsletter", "  ")).toBe(false)
    expect(isCompassPushSource("newsletter", null)).toBe(false)
    expect(isCompassPushSource("meta_lead_ads", "ai-class-guide")).toBe(false)
  })
})

describe("buildCompassLeadPushPayload · Compass parseHomeLeadBody 가 읽는 모양", () => {
  it("칸 이름·trim·빈 값 null·page 는 currentPage 우선·utm 은 값이 있을 때만", async () => {
    const { buildCompassLeadPushPayload } = await import("@/lib/server/compass-lead-push")
    expect(buildCompassLeadPushPayload(BASE, { leadId: "L1", kind: "created", eventId: "lead:L1" })).toEqual({
      event_id: "lead:L1",
      kind: "created",
      lead_id: "L1",
      source: "contact_page",
      source_detail: "도입 상담",
      name: "홍원장",
      org: "세담학원",
      phone: "010-0000-1001",
      email: "owner@example.com",
      region: "청주",
      message: "칠판 두 대",
      role: "원장",
      size: "30",
      event_slug: null,
      lead_magnet: null,
      page: "https://classin.co.kr/contact",
      utm: { source: "google", medium: "cpc", campaign: null },
    })
    const ev = buildCompassLeadPushPayload({ ...BASE, eventSlug: " meets-july-seoul ", leadMagnet: "ai-class-guide" }, { leadId: "L3", kind: "created", eventId: "lead:L3" })
    expect([ev.event_slug, ev.lead_magnet]).toEqual(["meets-july-seoul", "ai-class-guide"])
    const bare = buildCompassLeadPushPayload(
      { source: "demo_modal", timestamp: BASE.timestamp, phone: "010-0000-1002", landingPage: "https://classin.co.kr/l/x", name: "  " },
      { leadId: "L2", kind: "reinflow", eventId: "lead:L2:reinflow:2026-11-04T01:00:00.000Z" }
    )
    expect(bare).toMatchObject({ kind: "reinflow", name: null, org: null, email: null, region: null, message: null, page: "https://classin.co.kr/l/x", utm: null })
  })
})

describe("pushLeadToCompass", () => {
  const postJson = vi.fn()
  beforeEach(() => {
    vi.resetModules()
    postJson.mockReset().mockResolvedValue({ ok: true, status: 200 })
    vi.doMock("@/lib/server/post-json", () => ({ postJson }))
    vi.stubEnv("COMPASS_BRIDGE_URL", "https://mkt.example.test")
    vi.stubEnv("COMPASS_LEAD_WEBHOOK_TOKEN", "tok-secret")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock("@/lib/server/post-json")
  })

  it("토큰은 Authorization 헤더로 · 상한 6초 · 본문은 빌더 결과", async () => {
    const { pushLeadToCompass, COMPASS_LEAD_PUSH_TIMEOUT_MS } = await import("@/lib/server/compass-lead-push")
    await pushLeadToCompass(BASE, { leadId: "L1", kind: "created", eventId: "lead:L1" })
    expect(postJson).toHaveBeenCalledTimes(1)
    const [url, body, opts] = postJson.mock.calls[0]
    expect(url).toBe("https://mkt.example.test/api/webhook/home-lead")
    expect(body).toMatchObject({ event_id: "lead:L1", lead_id: "L1", source: "contact_page" })
    expect(opts).toEqual({ timeoutMs: COMPASS_LEAD_PUSH_TIMEOUT_MS, headers: { Authorization: "Bearer tok-secret" } })
    expect(JSON.stringify(body)).not.toContain("tok-secret")
  })

  it("2xx 가 아니면 throw(Compass: status) — 본문·토큰은 메시지에 없다", async () => {
    postJson.mockResolvedValue({ ok: false, status: 503 })
    const { pushLeadToCompass } = await import("@/lib/server/compass-lead-push")
    await expect(pushLeadToCompass(BASE, { leadId: "L1", kind: "created", eventId: "lead:L1" })).rejects.toThrow("Compass: 503")
  })

  it("env 가 없으면 postJson 을 부르지 않는다", async () => {
    vi.stubEnv("COMPASS_LEAD_WEBHOOK_TOKEN", "")
    const { pushLeadToCompass } = await import("@/lib/server/compass-lead-push")
    await pushLeadToCompass(BASE, { leadId: "L1", kind: "created", eventId: "lead:L1" })
    expect(postJson).not.toHaveBeenCalled()
  })
})

describe("runLeadCaptureEffects 안에서", () => {
  const postJson = vi.fn()
  const settings = { googleSheetWebhookUrl: "", leadWebhookUrl: "", channelTalkWebhookUrl: "", webhookEnabled: {} }

  async function loadEffects() {
    vi.resetModules()
    vi.doMock("@/lib/automation-engine", () => ({ triggerOnSubmitRules: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock("@/lib/repositories/crm-events", () => ({ createCrmCustomerEvent: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock("@/lib/repositories/leads", () => ({
      saveLead: vi.fn(),
      findLeadsByContacts: vi.fn().mockResolvedValue([]),
      touchLeadInflow: vi.fn().mockResolvedValue(null),
      updateLead: vi.fn().mockResolvedValue(null),
    }))
    vi.doMock("@/lib/repositories/marketing", () => ({ upsertSubscriber: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock("@/lib/repositories/settings", () => ({ getResolvedSettings: vi.fn().mockResolvedValue(settings) }))
    vi.doMock("@/lib/marketing/server-conversions", () => ({
      sendServerConversion: vi.fn().mockResolvedValue({ meta: { status: "fulfilled", value: { skipped: true } }, ga4: { status: "fulfilled", value: { skipped: true } } }),
    }))
    vi.doMock("@/lib/server/post-json", () => ({ postJson }))
    const mod = await import("@/lib/server/lead-capture")
    return mod
  }

  beforeEach(() => {
    postJson.mockReset().mockResolvedValue({ ok: true, status: 200 })
    vi.stubEnv("COMPASS_BRIDGE_URL", "https://mkt.example.test")
    vi.stubEnv("COMPASS_LEAD_WEBHOOK_TOKEN", "tok-secret")
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  const run = async (body: LeadPayload, over: Partial<{ stored: boolean; savedLeadId?: string; conversionEventId?: string; merged: boolean }> = {}) => {
    const { runLeadCaptureEffects, ALL_LEAD_CAPTURE_EFFECTS } = await loadEffects()
    return runLeadCaptureEffects(body, {
      settings,
      stored: true,
      savedLeadId: "L1",
      conversionEventId: "lead:L1",
      toggles: ALL_LEAD_CAPTURE_EFFECTS,
      context: {},
      ...over,
    })
  }

  it("홈페이지 폼 리드가 저장되면 Compass 로 한 번 — created · event_id 는 전환 이벤트 id", async () => {
    const { errors } = await run(BASE)
    expect(errors).toEqual([])
    expect(postJson).toHaveBeenCalledTimes(1)
    expect(postJson.mock.calls[0][0]).toBe("https://mkt.example.test/api/webhook/home-lead")
    expect(postJson.mock.calls[0][1]).toMatchObject({ event_id: "lead:L1", kind: "created", lead_id: "L1", source: "contact_page" })
  })

  it("챗봇 상담 연결(source=chatbot)로 들어온 문의도 Compass 로 한 번 — source 는 chatbot 그대로", async () => {
    const { errors } = await run({ ...BASE, source: "chatbot" })
    expect(errors).toEqual([])
    expect(postJson).toHaveBeenCalledTimes(1)
    expect(postJson.mock.calls[0][1]).toMatchObject({ kind: "created", lead_id: "L1", source: "chatbot" })
  })

  it("재문의 병합이면 reinflow · event_id 는 재유입 전환 id 그대로", async () => {
    await run(BASE, { merged: true, conversionEventId: "lead:L1:reinflow:2026-11-04T01:00:00.000Z" })
    expect(postJson.mock.calls[0][1]).toMatchObject({ kind: "reinflow", event_id: "lead:L1:reinflow:2026-11-04T01:00:00.000Z" })
  })

  it.each([["newsletter"], ["meta_lead_ads"]] as Array<[LeadPayload["source"]]>)("%s 는 보내지 않는다", async (source) => {
    await run({ ...BASE, source })
    expect(postJson).not.toHaveBeenCalled()
  })

  it("저장이 안 됐으면(리드 id 없음) 보내지 않는다 · env 가 없으면 보내지 않는다", async () => {
    await run(BASE, { stored: false, savedLeadId: undefined })
    expect(postJson).not.toHaveBeenCalled()
    vi.stubEnv("COMPASS_BRIDGE_URL", "")
    await run(BASE)
    expect(postJson).not.toHaveBeenCalled()
  })

  it("Compass 가 5xx 면 저장은 그대로, errors 에 'Compass: 500' 한 줄(응답 warnings·인시던트로 간다)", async () => {
    postJson.mockResolvedValue({ ok: false, status: 500 })
    const { errors } = await run(BASE)
    expect(errors).toEqual(["Compass: 500"])
  })
})
