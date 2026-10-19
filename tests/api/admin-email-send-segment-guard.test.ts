/**
 * POST /api/admin/email/send — 세그먼트 발송 가드 + 직접 입력 해지자 제외(발송 1단계, 2026-09-25).
 *  - segmentId 가 있거나 mode "segment" 면 수신자 해석 전에 400 segment_send_not_enabled(sentCount 0) —
 *    태그 [] 분기(= 전체 활성 구독자)로 떨어지지 않는다. 구독자 조회·캠페인 생성·발송 함수 미호출.
 *  - 직접 입력·AI 개인화(구독자 DB 밖 임의 주소)는 수신거부(해지) 주소를 빼고 건수만 알린다. 전부 해지면 400,
 *    목록 조회 실패면 503(보내지 않음).
 *  - 테스트 발송(mode:"test", 1건)은 그대로.
 * 실제 발송은 없다 — 이메일 모듈은 목이다.
 */
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getActiveSubscribersByTags: vi.fn(),
  findRecentSentCampaign: vi.fn(),
  sendBatchEmail: vi.fn(),
  loadConsent: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin }))
vi.mock("@/lib/repositories/marketing", () => ({
  createCampaign: mocks.createCampaign,
  updateCampaign: mocks.updateCampaign,
  getActiveSubscribersByTags: mocks.getActiveSubscribersByTags,
  findRecentSentCampaign: mocks.findRecentSentCampaign,
}))
vi.mock("@/lib/email", () => ({
  sendBatchEmail: mocks.sendBatchEmail,
  wrapCampaignHtml: vi.fn((html: string) => html),
  rewriteCampaignLinksForTracking: vi.fn((html: string) => html),
}))
vi.mock("@/lib/server/security-tokens", () => ({
  createEmailClickUrl: vi.fn((_base: string, _id: string, url: string) => url),
  createUnsubscribeUrl: vi.fn(() => "https://classin.kr/unsubscribe"),
}))
// 실제 동의 판정 함수(isEmailUnsubscribed)를 쓰고 로더만 목으로 바꾼다.
vi.mock("@/lib/messaging/marketing-consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/messaging/marketing-consent")>()
  return { ...actual, loadLeadMarketingConsentIndex: mocks.loadConsent }
})

import { POST } from "@/app/api/admin/email/send/route"

function sendRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const DRAFT = { subject: "9월 안내", body: "<p>{name}님 안녕하세요</p>", targetTags: [] as string[] }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.findRecentSentCampaign.mockResolvedValue(null)
  mocks.getActiveSubscribersByTags.mockResolvedValue([
    { email: "everyone@example.com", name: "전체", org: "", role: "" },
  ])
  mocks.createCampaign.mockResolvedValue({ id: "campaign-1", subject: DRAFT.subject, body: DRAFT.body, targetTags: [], status: "draft", recipientCount: 0 })
  mocks.updateCampaign.mockResolvedValue(undefined)
  mocks.sendBatchEmail.mockImplementation(async (emails: unknown[]) => ({
    provider: "resend",
    sent: emails.length,
    failed: 0,
    errors: [],
  }))
  mocks.loadConsent.mockResolvedValue({
    subscriberStatusByEmail: new Map<string, "active" | "blocked">([
      ["active@example.com", "active"],
      ["gone@example.com", "blocked"],
    ]),
    profileConsentEmails: new Set<string>(),
  })
})

function expectNothingSent() {
  expect(mocks.getActiveSubscribersByTags).not.toHaveBeenCalled()
  expect(mocks.createCampaign).not.toHaveBeenCalled()
  expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
}

describe("세그먼트 발송 가드", () => {
  it("segmentId 가 있으면 400 segment_send_not_enabled · sentCount 0 · 아무것도 조회·생성·발송하지 않는다", async () => {
    const response = await POST(sendRequest({ ...DRAFT, segmentId: "11111111-1111-4111-8111-111111111111" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: "고객 세그먼트 발송은 아직 열리지 않았습니다(미리보기만).",
      code: "segment_send_not_enabled",
      sentCount: 0,
    })
    expectNothingSent()
  })

  it("mode 'segment' 도 400 — 태그 [] 전체 발송으로 떨어지지 않는다", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "segment" }))
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe("segment_send_not_enabled")
    expectNothingSent()
  })

  it("segmentId 가 null 이어도(필드만 있어도) 막는다 — 테스트 모드여도 마찬가지", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "test", testEmail: "admin@example.com", segmentId: null }))
    expect(response.status).toBe(400)
    expectNothingSent()
  })

  it("테스트 발송(1건)은 그대로 나간다(세그먼트 필드 없음)", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "test", testEmail: "admin@example.com" }))
    expect(response.status).toBe(200)
    expect(mocks.sendBatchEmail).toHaveBeenCalledTimes(1)
    expect(mocks.sendBatchEmail.mock.calls[0][0]).toHaveLength(1)
    expect(mocks.createCampaign).not.toHaveBeenCalled()
  })
})

describe("직접 입력 — 해지자 제외", () => {
  it("수신거부 주소(대소문자 무시)를 빼고 보내고 건수만 알린다", async () => {
    const response = await POST(
      sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["Gone@Example.com", "new@example.com", "active@example.com"] })
    )
    expect(response.status).toBe(200)
    const sent = mocks.sendBatchEmail.mock.calls[0][0] as Array<{ to: string }>
    expect(sent.map((email) => email.to)).toEqual(["new@example.com", "active@example.com"])
    const body = await response.json()
    expect(body.excludedUnsubscribed).toBe(1)
    expect(JSON.stringify(body)).not.toContain("gone@example.com")
    expect(JSON.stringify(body)).not.toContain("Gone@Example.com")
  })

  it("해지자가 없으면 excludedUnsubscribed 를 싣지 않는다", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["new@example.com"] }))
    expect(response.status).toBe(200)
    expect(await response.json()).not.toHaveProperty("excludedUnsubscribed")
  })

  it("입력 주소가 모두 해지면 400 all_unsubscribed · 캠페인을 만들지 않는다", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["gone@example.com"] }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "all_unsubscribed", excludedUnsubscribed: 1, sentCount: 0 })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
    expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
  })

  it("수신거부 목록을 못 읽으면 503 consent_unavailable — 보내지 않는다(미확인 = 거부)", async () => {
    mocks.loadConsent.mockRejectedValue(new Error("db down"))
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["new@example.com"] }))
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: "consent_unavailable", sentCount: 0 })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
    expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
  })

  // 2026-09-26 검증 P3 — 입력 오류는 동의 조회보다 먼저(AI 개인화 분기와 같은 순서). 거꾸로면 매 요청 전체 스캔이
  // 돌고, 조회가 실패하면 입력 오류가 503 "잠시 후 다시 시도"로 바뀌어 일시 장애로 오인된다.
  it("형식이 틀린 주소만 있으면 동의 목록을 읽기 전에 400(기존 문구 그대로)", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["not-an-email", "  "] }))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("유효한 이메일 주소가 없습니다.")
    expect(mocks.loadConsent).not.toHaveBeenCalled()
    expectNothingSent()
  })

  it("형식이 틀린 주소만 있으면 동의 조회가 끊겨 있어도 503 이 아니라 400 입력 오류", async () => {
    mocks.loadConsent.mockRejectedValue(new Error("db down"))
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["not-an-email"] }))
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toBe("유효한 이메일 주소가 없습니다.")
    expect(body.code).toBeUndefined()
    expect(mocks.loadConsent).not.toHaveBeenCalled()
    expectNothingSent()
  })

  it("유효한 주소가 하나라도 있으면 형식 오류 주소는 버리고 동의 조회를 거친다", async () => {
    const response = await POST(
      sendRequest({ ...DRAFT, mode: "campaign", directEmails: ["not-an-email", "new@example.com"] })
    )
    expect(response.status).toBe(200)
    expect(mocks.loadConsent).toHaveBeenCalledTimes(1)
    const sent = mocks.sendBatchEmail.mock.calls[0][0] as Array<{ to: string }>
    expect(sent.map((email) => email.to)).toEqual(["new@example.com"])
  })

  it("태그 발송은 동의 목록을 따로 읽지 않는다(구독 active 만 조회하는 기존 경로 그대로)", async () => {
    const response = await POST(sendRequest({ ...DRAFT, mode: "campaign", targetTags: ["원장"] }))
    expect(response.status).toBe(200)
    expect(mocks.getActiveSubscribersByTags).toHaveBeenCalledWith(["원장"])
    expect(mocks.loadConsent).not.toHaveBeenCalled()
  })
})

// 2026-09-26 교차 리뷰 [11] — aiPersonalized 분기(구독자 DB 밖 임의 주소)에도 직접 입력과 같은 해지자 제외.
// 이 분기는 directEmails 보다 먼저 판정돼, 둘 다 실린 요청은 여기로 온다 — 예전에는 해지자 제외를 통째로 건너뛰었다.
describe("AI 개인화 — 해지자 제외(직접 입력과 같은 규칙)", () => {
  const personalized = (email: string) => ({ email, name: "받는 분", personalizedBody: `<p>${email} 맞춤 본문</p>` })

  it("수신거부 주소(대소문자 무시)를 빼고 보내고 건수만 알린다 — 주소는 응답에 싣지 않는다", async () => {
    const response = await POST(
      sendRequest({
        ...DRAFT,
        mode: "campaign",
        aiPersonalized: [personalized("Gone@Example.com"), personalized("new@example.com"), personalized("active@example.com")],
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.loadConsent).toHaveBeenCalledTimes(1)
    const sent = mocks.sendBatchEmail.mock.calls[0][0] as Array<{ to: string; html: string }>
    expect(sent.map((email) => email.to)).toEqual(["new@example.com", "active@example.com"])
    // 해지자의 개인화 본문은 어떤 메일에도 실리지 않는다.
    expect(sent.map((email) => email.html).join("\n")).not.toMatch(/gone@example\.com/i)
    const body = await response.json()
    expect(body.excludedUnsubscribed).toBe(1)
    expect(body.recipientCount).toBe(2)
    expect(JSON.stringify(body)).not.toMatch(/gone@example\.com/i)
  })

  it("모두 해지면 400 all_unsubscribed · 캠페인을 만들지 않고 보내지 않는다", async () => {
    const response = await POST(
      sendRequest({ ...DRAFT, mode: "campaign", aiPersonalized: [personalized("gone@example.com")] })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: "all_unsubscribed", excludedUnsubscribed: 1, sentCount: 0 })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
    expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
  })

  it("수신거부 목록을 못 읽으면 503 consent_unavailable — 보내지 않는다(미확인 = 거부)", async () => {
    mocks.loadConsent.mockRejectedValue(new Error("db down"))
    const response = await POST(
      sendRequest({ ...DRAFT, mode: "campaign", aiPersonalized: [personalized("new@example.com")] })
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: "consent_unavailable", sentCount: 0 })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
    expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
  })

  it("aiPersonalized 와 directEmails 가 함께 실려도(AI 개인화 분기가 먼저) 해지자 제외를 건너뛰지 않는다", async () => {
    const response = await POST(
      sendRequest({
        ...DRAFT,
        mode: "campaign",
        aiPersonalized: [personalized("gone@example.com"), personalized("new@example.com")],
        directEmails: ["gone@example.com"],
      })
    )
    expect(response.status).toBe(200)
    const sent = mocks.sendBatchEmail.mock.calls[0][0] as Array<{ to: string }>
    expect(sent.map((email) => email.to)).toEqual(["new@example.com"])
    expect((await response.json()).excludedUnsubscribed).toBe(1)
  })

  it("형식이 틀린 대상만 있으면 동의 목록을 읽기 전에 400(기존 문구 그대로)", async () => {
    const response = await POST(
      sendRequest({ ...DRAFT, mode: "campaign", aiPersonalized: [{ email: "not-an-email", personalizedBody: "x" }] })
    )
    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe("AI 개인화 발송 대상이 올바르지 않습니다.")
    expect(mocks.loadConsent).not.toHaveBeenCalled()
    expect(mocks.sendBatchEmail).not.toHaveBeenCalled()
  })
})
