import { afterEach, describe, expect, it, vi } from "vitest"

const baseLead = {
  source: "contact_page",
  org: "Codex Test Academy",
  name: "Codex Test",
  phone: "010-1234-5678",
  message: "문의 테스트",
}

async function loadLeadCapture() {
  vi.resetModules()

  const saveLead = vi.fn()
  const emitNotificationEvent = vi.fn().mockResolvedValue(undefined)

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
    getResolvedSettings: vi.fn().mockResolvedValue({
      googleSheetWebhookUrl: "",
      leadWebhookUrl: "",
      channelTalkWebhookUrl: "",
    }),
  }))

  const leadCapture = await import("@/lib/server/lead-capture")
  return { ...leadCapture, saveLead, emitNotificationEvent }
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

  it("drops duplicates only after a lead has been accepted", async () => {
    const { submitLeadCapture, saveLead } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-1" })

    const first = await submitLeadCapture(baseLead)
    const second = await submitLeadCapture(baseLead)

    expect(first.status).toBe(200)
    expect(first.body).toMatchObject({ ok: true, stored: true, leadId: "lead-1" })
    expect(second.status).toBe(200)
    expect(second.body).toMatchObject({ ok: true, stored: false })
    expect(saveLead).toHaveBeenCalledTimes(1)
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
