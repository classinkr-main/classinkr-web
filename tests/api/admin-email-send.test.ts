import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  createCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  getActiveSubscribersByTags: vi.fn(),
  findRecentSentCampaign: vi.fn(),
  sendBatchEmail: vi.fn(),
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
// 직접 입력 발송은 수신거부 목록을 읽는다(2026-09-25 해지자 제외) — 여기서는 해지자가 없는 빈 목록.
// 해지자 제외·조회 실패 동작은 tests/api/admin-email-send-segment-guard.test.ts 가 고정한다.
vi.mock("@/lib/messaging/marketing-consent", () => ({
  loadLeadMarketingConsentIndex: vi.fn(async () => ({
    subscriberStatusByEmail: new Map<string, "active" | "blocked">(),
    profileConsentEmails: new Set<string>(),
  })),
  isEmailUnsubscribed: vi.fn(() => false),
}))

import { POST } from "@/app/api/admin/email/send/route"

function sendRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/email/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const unavailableResult = {
  provider: "simulation" as const,
  sent: 0,
  failed: 1,
  errors: ["이메일 발송 공급자가 설정되지 않았습니다."],
}

describe("admin email send route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyAdmin.mockResolvedValue(null)
    mocks.findRecentSentCampaign.mockResolvedValue(null)
    mocks.getActiveSubscribersByTags.mockResolvedValue([])
    mocks.createCampaign.mockResolvedValue({
      id: "campaign-1",
      subject: "공지",
      body: "<p>본문</p>",
      targetTags: [],
      status: "draft",
      recipientCount: 0,
    })
    mocks.updateCampaign.mockResolvedValue(undefined)
    mocks.sendBatchEmail.mockResolvedValue(unavailableResult)
  })

  it("returns 503 for a test send when no real provider is configured", async () => {
    const response = await POST(
      sendRequest({
        mode: "test",
        testEmail: "admin@example.com",
        subject: "공지",
        body: "<p>본문</p>",
      })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      test: true,
      provider: "simulation",
      recipientCount: 0,
      failedCount: 1,
      status: "failed",
    })
    expect(mocks.createCampaign).not.toHaveBeenCalled()
  })

  it("stores a campaign provider outage as failed, never sent", async () => {
    const response = await POST(
      sendRequest({
        mode: "campaign",
        directEmails: ["customer@example.com"],
        subject: "공지",
        body: "<p>본문</p>",
      })
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      ok: false,
      provider: "simulation",
      recipientCount: 0,
      failedCount: 1,
      status: "failed",
    })
    expect(mocks.updateCampaign).toHaveBeenNthCalledWith(
      1,
      "campaign-1",
      expect.objectContaining({
        status: "failed",
        recipientCount: 0,
      })
    )
    expect(mocks.updateCampaign).toHaveBeenNthCalledWith(2, "campaign-1", {
      failedCount: 1,
      sendErrors: ["이메일 발송 공급자가 설정되지 않았습니다."],
    })
  })
})
