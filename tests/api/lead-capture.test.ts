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
  // 기본값은 "일치하는 재유입 후보 없음" — 기존 테스트 대부분이 신규 insert 경로를 그대로
  // 타야 하므로 findLeadsByContacts는 빈 배열, touchLeadInflow는 호출되지 않는 것이 기본
  // 기대치다. 재유입 병합 테스트만 개별적으로 mockResolvedValue/mockRejectedValue를 덮어쓴다.
  const findLeadsByContacts = vi.fn().mockResolvedValue([])
  const touchLeadInflow = vi.fn().mockResolvedValue(null)
  // 재유입 병합 중 행사 토큰을 새길 때만 호출된다(notes 의 [event:slug] 줄).
  const updateLead = vi.fn().mockResolvedValue(null)
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
    findLeadsByContacts,
    touchLeadInflow,
    updateLead,
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
    findLeadsByContacts,
    touchLeadInflow,
    updateLead,
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

  it("does not record site_inflow for ad-click leads (gclid)", async () => {
    const { submitLeadCapture, saveLead, createCrmCustomerEvent } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-ad-1" })

    const result = await submitLeadCapture({
      ...baseLead,
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

describe("submitLeadCapture reinflow merge", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("inserts a new lead when no existing contact matches", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts, touchLeadInflow } =
      await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-fresh" })

    const result = await submitLeadCapture(baseLead)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      stored: true,
      leadId: "lead-fresh",
      merged: false,
    })
    expect(findLeadsByContacts).toHaveBeenCalledWith({ phones: [baseLead.phone], emails: [] })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(touchLeadInflow).not.toHaveBeenCalled()
  })

  it("merges into an existing new-status lead instead of inserting, and stamps the reinflow timeline", async () => {
    const {
      submitLeadCapture,
      saveLead,
      findLeadsByContacts,
      touchLeadInflow,
      createCrmCustomerEvent,
      emitNotificationEvent,
    } = await loadLeadCapture()
    findLeadsByContacts.mockResolvedValue([
      {
        id: "lead-existing-new",
        phone: baseLead.phone,
        status: "new",
        timestamp: "2026-09-01T00:00:00.000Z",
        last_inflow_at: "2026-09-01T00:00:00.000Z",
      },
    ])

    const result = await submitLeadCapture(baseLead)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      stored: true,
      leadId: "lead-existing-new",
      merged: true,
    })
    expect(saveLead).not.toHaveBeenCalled()
    expect(touchLeadInflow).toHaveBeenCalledTimes(1)
    expect(touchLeadInflow).toHaveBeenCalledWith("lead-existing-new", expect.any(String))
    expect(createCrmCustomerEvent).toHaveBeenCalledTimes(1)
    expect(createCrmCustomerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "lead",
        targetId: "lead-existing-new",
        sourceType: "site_inflow",
        title: "재문의(재유입)",
      })
    )
    // 알림 제목에 "재문의 · " 접두어가 붙어 관리자가 제목만 보고 재유입임을 알 수 있어야 한다.
    expect(emitNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "lead.created",
        title: expect.stringContaining("재문의 · "),
      })
    )
  })

  it("does not merge into a closed-status lead — stores a new lead instead", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts, touchLeadInflow } =
      await loadLeadCapture()
    findLeadsByContacts.mockResolvedValue([
      {
        id: "lead-existing-closed",
        phone: baseLead.phone,
        status: "closed",
        timestamp: "2026-09-01T00:00:00.000Z",
        last_inflow_at: "2026-09-01T00:00:00.000Z",
      },
    ])
    saveLead.mockResolvedValue({ id: "lead-new-after-closed" })

    const result = await submitLeadCapture(baseLead)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      stored: true,
      leadId: "lead-new-after-closed",
      merged: false,
    })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(touchLeadInflow).not.toHaveBeenCalled()
  })

  it("falls back to inserting a new lead when the reinflow candidate lookup throws", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts, touchLeadInflow } =
      await loadLeadCapture()
    findLeadsByContacts.mockRejectedValue(new Error("lookup unavailable"))
    saveLead.mockResolvedValue({ id: "lead-after-lookup-error" })

    const result = await submitLeadCapture(baseLead)

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      stored: true,
      leadId: "lead-after-lookup-error",
      merged: false,
    })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(touchLeadInflow).not.toHaveBeenCalled()
  })

  it("stamps the event token on the merged lead when the submission is an event signup", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts, touchLeadInflow, updateLead } =
      await loadLeadCapture()
    findLeadsByContacts.mockResolvedValue([
      {
        id: "lead-existing-new",
        phone: baseLead.phone,
        status: "new",
        timestamp: "2026-09-01T00:00:00.000Z",
        last_inflow_at: "2026-09-01T00:00:00.000Z",
        notes: "기존 메모",
      },
    ])

    const result = await submitLeadCapture({ ...baseLead, eventSlug: "seoul-0920" })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      ok: true,
      merged: true,
      leadId: "lead-existing-new",
      // 재문의는 별개 전환 이벤트 — 병합 전(새 행마다 새 id)과 같은 계산을 유지한다.
      conversionEventId: expect.stringContaining("lead:lead-existing-new:reinflow:"),
    })
    expect(saveLead).not.toHaveBeenCalled()
    expect(touchLeadInflow).toHaveBeenCalledTimes(1)
    // 행사 토큰은 notes 첫 줄에만 새기고 나머지 메모는 그대로 둔다.
    expect(updateLead).toHaveBeenCalledWith("lead-existing-new", { notes: "[event:seoul-0920]\n기존 메모" })
  })

  it("does not merge into a lead that already carries a different event token", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts, touchLeadInflow, updateLead } =
      await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-new-row" })
    findLeadsByContacts.mockResolvedValue([
      {
        id: "lead-existing-new",
        phone: baseLead.phone,
        status: "new",
        timestamp: "2026-09-01T00:00:00.000Z",
        last_inflow_at: "2026-09-01T00:00:00.000Z",
        notes: "[event:busan-0901]\n기존 메모",
      },
    ])

    const result = await submitLeadCapture({ ...baseLead, eventSlug: "seoul-0920" })

    expect(result.status).toBe(200)
    // 토큰은 한 개뿐이라 덮어쓰면 이전 행사의 신청 집계가 사라진다 — 예전처럼 새 행을 만든다.
    expect(result.body).toMatchObject({ ok: true, merged: false, leadId: "lead-new-row" })
    expect(saveLead).toHaveBeenCalledTimes(1)
    expect(touchLeadInflow).not.toHaveBeenCalled()
    expect(updateLead).not.toHaveBeenCalled()
  })

  it("does not look up reinflow candidates for sources outside RESPONSE_TARGET_SOURCES", async () => {
    const { submitLeadCapture, saveLead, findLeadsByContacts } = await loadLeadCapture()
    saveLead.mockResolvedValue({ id: "lead-newsletter" })

    const result = await submitLeadCapture({
      source: "newsletter",
      email: "ops@example.com",
    })

    expect(result.status).toBe(200)
    expect(findLeadsByContacts).not.toHaveBeenCalled()
    expect(saveLead).toHaveBeenCalledTimes(1)
  })
})
