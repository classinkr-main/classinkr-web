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
