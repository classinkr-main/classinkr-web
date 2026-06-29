import { afterEach, describe, expect, it, vi } from "vitest"

const baseLead = {
  source: "contact_page",
  org: "Codex Test Academy",
  name: "Codex Test",
  phone: "010-1234-5678",
  message: "문의 테스트",
}

async function loadLeadCapture(options?: {
  settings?: {
    googleSheetWebhookUrl?: string
    leadWebhookUrl?: string
    channelTalkWebhookUrl?: string
  }
}) {
  vi.resetModules()

  const saveLead = vi.fn()
  const emitNotificationEvent = vi.fn().mockResolvedValue(undefined)
  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const sendServerConversion = vi.fn().mockResolvedValue({
    meta: { status: "fulfilled", value: { skipped: true } },
    ga4: { status: "fulfilled", value: { skipped: true } },
  })
  const settings = {
    googleSheetWebhookUrl: "",
    leadWebhookUrl: "",
    channelTalkWebhookUrl: "",
    ...options?.settings,
  }

  vi.doMock("@/lib/automation-engine", () => ({
    triggerOnSubmitRules: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/notifications/emit-event", () => ({
    emitNotificationEvent,
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    saveLead,
  }))
  vi.doMock("@/lib/repositories/marketing", () => ({
    upsertSubscriber: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue(settings),
  }))
  vi.doMock("@/lib/marketing/server-conversions", () => ({
    sendServerConversion,
  }))
  vi.doMock("@/lib/server/post-json", () => ({
    postJson,
  }))

  const leadCapture = await import("@/lib/server/lead-capture")
  return { ...leadCapture, saveLead, emitNotificationEvent, postJson, sendServerConversion }
}

describe("submitLeadCapture duplicate handling", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("does not cache a failed submission as a successful duplicate", async () => {
    const { submitLeadCapture, saveLead } = await loadLeadCapture()
    saveLead.mockRejectedValue(new Error("database unavailable"))

    const first = await submitLeadCapture(baseLead)
    const second = await submitLeadCapture(baseLead)

    expect(first.status).toBe(502)
    expect(second.status).toBe(502)
    expect(saveLead).toHaveBeenCalledTimes(2)
  })

  it("does not report success when storage fails even if external delivery succeeds", async () => {
    const { submitLeadCapture, saveLead, postJson } = await loadLeadCapture({
      settings: { leadWebhookUrl: "https://example.com/lead-webhook" },
    })
    saveLead.mockRejectedValue(new Error("database unavailable"))

    const first = await submitLeadCapture(baseLead)
    const second = await submitLeadCapture(baseLead)

    expect(first.status).toBe(502)
    expect(first.body).toMatchObject({
      ok: false,
      error: "상담 요청을 어드민에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    })
    expect(second.status).toBe(502)
    expect(saveLead).toHaveBeenCalledTimes(2)
    expect(postJson).toHaveBeenCalledTimes(2)
  })

  it("drops duplicates only after a lead has been accepted", async () => {
    const { submitLeadCapture, saveLead, sendServerConversion } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-1" })

    const first = await submitLeadCapture(baseLead)
    const second = await submitLeadCapture(baseLead)

    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({
      ok: true,
      stored: true,
      leadId: "lead-1",
      conversionEventId: "lead:lead-1",
    })
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ ok: true, stored: false })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(sendServerConversion).toHaveBeenCalledTimes(1)
    expect(sendServerConversion).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "lead:lead-1",
        metaEventName: "Lead",
        ga4EventName: "generate_lead",
      })
    )
  })

  it("does not collapse different lead-magnet submissions from the same email", async () => {
    const { submitLeadCapture, saveLead } = await loadLeadCapture()
    saveLead
      .mockResolvedValueOnce({ id: "lead-resource-a" })
      .mockResolvedValueOnce({ id: "lead-resource-b" })

    const first = await submitLeadCapture({
      source: "newsletter",
      email: "ops@example.com",
      sourceDetail: "resource_pdf_download:resource-a",
      leadMagnet: "resource-a",
    })
    const second = await submitLeadCapture({
      source: "newsletter",
      email: "ops@example.com",
      sourceDetail: "resource_pdf_download:resource-b",
      leadMagnet: "resource-b",
    })

    expect(first.body).toMatchObject({ ok: true, stored: true, leadId: "lead-resource-a" })
    expect(second.body).toMatchObject({ ok: true, stored: true, leadId: "lead-resource-b" })
    expect(saveLead).toHaveBeenCalledTimes(2)
  })

  it("reports an in-flight duplicate without pretending the lead was accepted", async () => {
    const { submitLeadCapture, saveLead } = await loadLeadCapture()
    let rejectSave: (error: Error) => void = () => {}

    saveLead.mockReturnValue(
      new Promise((_, reject) => {
        rejectSave = reject
      })
    )

    const firstPromise = submitLeadCapture(baseLead)
    const second = await submitLeadCapture(baseLead)

    expect(second.status).toBe(409)
    expect(second.body).toMatchObject({
      ok: false,
      error: "상담 요청을 접수 중입니다. 잠시만 기다려 주세요.",
    })

    rejectSave(new Error("database unavailable"))
    const first = await firstPromise

    expect(first.status).toBe(502)
    expect(saveLead).toHaveBeenCalledTimes(1)
  })
})
