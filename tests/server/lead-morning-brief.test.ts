import { afterEach, describe, expect, it, vi } from "vitest"

async function loadMorningBrief() {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)
  const createNotificationEvent = vi
    .fn()
    .mockResolvedValueOnce({ id: "event-meta" })
    .mockResolvedValueOnce({ id: "event-homepage" })
  const markLeadDigestRunSent = vi.fn().mockResolvedValue(undefined)
  const claimLeadDigestRun = vi.fn().mockImplementation(({ reportType }) =>
    Promise.resolve({
      claimed: true,
      run: {
        id: `run-${reportType}`,
        reportType,
        status: "pending",
        attemptCount: 1,
        windowStart: "",
        windowEnd: "",
        claimedAt: "",
        createdAt: "",
        updatedAt: "",
      },
    })
  )

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomLeadReportWebhookUrl:
        "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test-room",
      notificationAppearance: {},
      notificationDigestEmailList: [],
    }),
  }))
  vi.doMock("@/lib/server/post-json", () => ({ postJson }))
  vi.doMock("@/lib/email", () => ({
    sendInternalNotification: vi.fn(),
    wrapNotificationHtml: vi.fn(),
  }))
  vi.doMock("@/lib/notifications/presentation", () => ({
    resolveNotificationPresentation: vi.fn().mockReturnValue({
      iconKey: "user-round-plus",
      tone: "emerald",
    }),
  }))
  vi.doMock("@/lib/notifications/repository", () => ({
    createDeliveryLog,
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent,
  }))
  vi.doMock("@/lib/repositories/lead-digest-runs", () => ({
    claimLeadDigestRun,
    markLeadDigestRunSent,
    markLeadDigestRunFailed: vi.fn().mockResolvedValue(undefined),
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue([
      {
        id: "meta-current-new",
        source: "meta_lead_ads",
        timestamp: "2026-08-06T02:00:00.000Z",
        status: "new",
        name: "Meta A",
        utm_campaign: "여름 캠페인",
        utm_content: "보드 광고",
      },
      {
        id: "meta-current-contacted",
        source: "meta_lead_ads",
        timestamp: "2026-08-06T03:00:00.000Z",
        status: "contacted",
        assigned_to: "담당자",
        name: "Meta B",
        utm_campaign: "여름 캠페인",
        utm_content: "보드 광고",
      },
      {
        id: "meta-test",
        source: "meta_lead_ads",
        timestamp: "2026-08-06T04:00:00.000Z",
        status: "new",
        name: "<test lead: dummy data>",
      },
      {
        id: "meta-previous",
        source: "meta_lead_ads",
        timestamp: "2026-08-05T02:00:00.000Z",
        status: "new",
      },
      {
        id: "contact-current",
        source: "contact_page",
        timestamp: "2026-08-06T05:00:00.000Z",
        status: "new",
        fbclid: "meta-click",
      },
      {
        id: "demo-current",
        source: "demo_modal",
        timestamp: "2026-08-06T06:00:00.000Z",
        status: "converted",
        assigned_to: "담당자",
      },
      {
        id: "contact-previous",
        source: "contact_page",
        timestamp: "2026-08-05T05:00:00.000Z",
        status: "new",
      },
    ]),
  }))

  const morningBrief = await import("@/lib/server/lead-morning-brief")
  return {
    ...morningBrief,
    postJson,
    claimLeadDigestRun,
    markLeadDigestRunSent,
  }
}

describe("10:10 KST lead morning brief", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("sends separate Meta and homepage cards for one fixed 24-hour window", async () => {
    const {
      sendLeadMorningBrief,
      postJson,
      claimLeadDigestRun,
      markLeadDigestRunSent,
    } = await loadMorningBrief()
    const now = new Date("2026-08-07T01:15:00.000Z")

    const meta = await sendLeadMorningBrief("meta", now)
    const homepage = await sendLeadMorningBrief("homepage", now)

    expect(meta).toMatchObject({
      status: "sent",
      totalLeads: 2,
      topCampaignLabel: "여름 캠페인",
      windowStart: "2026-08-06T01:10:00.000Z",
      windowEnd: "2026-08-07T01:10:00.000Z",
    })
    expect(homepage).toMatchObject({
      status: "sent",
      totalLeads: 2,
      contactPageLeadCount: 1,
      demoModalLeadCount: 1,
      metaAttributedWebsiteLeadCount: 1,
    })
    expect(claimLeadDigestRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        reportType: "meta",
        windowStart: new Date("2026-08-06T01:10:00.000Z"),
        windowEnd: new Date("2026-08-07T01:10:00.000Z"),
      })
    )

    const payloads = postJson.mock.calls.map((call) => call[1])
    expect(payloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          msgtype: "template_card",
          template_card: expect.objectContaining({
            main_title: expect.objectContaining({ title: "Meta 광고 리드 · 일일 리포트" }),
            emphasis_content: { title: "2", desc: "전체 접수" },
            horizontal_content_list: [
              { keyname: "미응대", value: "1개" },
              { keyname: "상담 진행", value: "1개" },
              { keyname: "전환", value: "0개" },
              { keyname: "주요 캠페인", value: "여름 캠페인" },
            ],
          }),
        }),
        expect.objectContaining({
          msgtype: "template_card",
          template_card: expect.objectContaining({
            main_title: expect.objectContaining({ title: "홈페이지 리드 · 아침 공지" }),
            emphasis_content: { title: "2", desc: "전체 접수" },
            horizontal_content_list: [
              { keyname: "홈페이지 문의", value: "1개" },
              { keyname: "데모 신청", value: "1개" },
              { keyname: "Meta 광고 경유", value: "1개" },
              { keyname: "미응대", value: "1개" },
              { keyname: "전환", value: "1개" },
            ],
          }),
        }),
      ])
    )
    expect(payloads).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          template_card: expect.objectContaining({
            sub_title_text: expect.any(String),
          }),
        }),
      ])
    )
    expect(markLeadDigestRunSent).toHaveBeenCalledTimes(2)
  })
})
