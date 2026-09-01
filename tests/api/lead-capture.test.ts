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
  const createCrmCustomerEvent = vi.fn().mockResolvedValue(undefined)
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
  vi.doMock("@/lib/repositories/crm-events", () => ({
    createCrmCustomerEvent,
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
  return {
    ...leadCapture,
    saveLead,
    createCrmCustomerEvent,
    emitNotificationEvent,
    postJson,
    sendServerConversion,
  }
}

describe("submitLeadCapture duplicate handling", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("normalizes a region value so Meta city can be stored in leads.branch", async () => {
    const { buildLeadPayload } = await loadLeadCapture()
    expect(buildLeadPayload({ ...baseLead, branch: "  Cheongju  " }).branch).toBe("Cheongju")
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

describe("submitLeadCapture site_inflow auto event", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("records a site_inflow timeline event when a site-origin lead is stored", async () => {
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-site-1" })

    const result = await submitLeadCapture({
      ...baseLead,
      currentPage: "https://classin.co.kr/contact",
    })

    expect(result.status).toBe(200)
    expect(createCrmCustomerEvent).toHaveBeenCalledTimes(1)
    expect(createCrmCustomerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "lead",
        targetId: "lead-site-1",
        targetLabel: "Codex Test Academy",
        sourceType: "site_inflow",
        title: "홈페이지 상담 신청",
        summary: "문의 · https://classin.co.kr/contact",
      })
    )
  })

  // 설계 스펙 §D는 판정 기준을 "lead.source가 site 계열인가" 하나로 못박았다
  // (docs/superpowers/specs/2026-07-16-crm-structure-develop-design.md).
  // 구현이 거기에 광고 클릭 식별자 조건을 얹으면서, 광고를 타고 들어와 홈페이지 폼을 채운
  // 사람의 문의가 CRM 타임라인에 한 줄도 안 남았다 — 유료 트래픽 비중을 생각하면 사실상
  // 홈페이지 문의 대부분이다(2026-09-01 실측: 8/29 메가클럽 건이 gclid 때문에 누락).
  // 클릭 식별자는 "어느 경로로 왔나"이지 "어느 폼을 채웠나"가 아니므로 판정에서 뺀다.
  it("records site_inflow for a homepage form lead that arrived through an ad click (gclid)", async () => {
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-ad-1" })

    const result = await submitLeadCapture({
      ...baseLead,
      gclid: "test-click-id",
    })

    expect(result.status).toBe(200)
    expect(createCrmCustomerEvent).toHaveBeenCalledTimes(1)
    expect(createCrmCustomerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: "lead-ad-1", sourceType: "site_inflow" })
    )
  })

  it("still skips site_inflow for ad-platform leads even without a click id", async () => {
    // 광고 플랫폼이 직접 밀어 넣는 리드(meta_lead_ads 등)는 홈페이지 폼 제출이 아니다 —
    // source 기준 판정이 이 구분을 계속 지킨다.
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-ad-2" })

    const result = await submitLeadCapture({
      source: "meta_lead_ads",
      email: "ad-lead@example.com",
      name: "\uad11\uace0 \ub9ac\ub4dc",
      gclid: "test-click-id",
    })

    expect(result.status).toBe(200)
    expect(createCrmCustomerEvent).not.toHaveBeenCalled()
  })

  it("does not record site_inflow for meta_lead_ads leads", async () => {
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-meta-1" })

    const result = await submitLeadCapture({
      source: "meta_lead_ads",
      email: "meta-lead@example.com",
      name: "메타 리드",
    })

    expect(result.status).toBe(200)
    expect(createCrmCustomerEvent).not.toHaveBeenCalled()
  })

  it("does not record site_inflow when the lead was not stored", async () => {
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockRejectedValue(new Error("database unavailable"))

    const result = await submitLeadCapture(baseLead)

    expect(result.status).toBe(502)
    expect(createCrmCustomerEvent).not.toHaveBeenCalled()
  })
})

describe("submitLeadCapture notification", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("keeps the CONTACT in-app event but defers WeCom delivery to the morning digest", async () => {
    const { submitLeadCapture, saveLead, emitNotificationEvent } = await loadLeadCapture()
    const deferredTasks: Array<() => Promise<void>> = []
    saveLead.mockResolvedValue({ id: "lead-contact-wecom-1" })

    const result = await submitLeadCapture(
      {
        ...baseLead,
        sourceDetail: "도입 상담",
      },
      {
        deferTask: (task) => deferredTasks.push(task),
      }
    )

    expect(result.status).toBe(200)
    expect(deferredTasks).toHaveLength(1)
    expect(emitNotificationEvent).not.toHaveBeenCalled()

    await deferredTasks[0]()

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "lead.created",
        channels: [],
        payload: expect.objectContaining({
          leadId: "lead-contact-wecom-1",
          source: "contact_page",
          sourceDetail: "도입 상담",
          message: "문의 테스트",
        }),
      })
    )
  })
})
