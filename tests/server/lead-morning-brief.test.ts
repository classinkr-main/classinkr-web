import { afterEach, describe, expect, it, vi } from "vitest"

async function loadMorningBrief(extraLeads: Array<Record<string, unknown>> = []) {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)
  const createNotificationEvent = vi.fn().mockResolvedValue({ id: "event-daily" })
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
      ...extraLeads,
    ]),
  }))

  const morningBrief = await import("@/lib/server/lead-morning-brief")
  return {
    ...morningBrief,
    postJson,
    claimLeadDigestRun,
    markLeadDigestRunSent,
    createNotificationEvent,
  }
}

// 2026-09-21 재유입 병합 — 응대 대상 소스의 재문의는 새 행 대신 기존 행의 last_inflow_at 만 갱신한다.
// 기본 창(2026-08-06 10:10 ~ 08-07 10:10 KST) 기준 픽스처.
const REINFLOW_LEADS = [
  {
    // 예전에 생성되고 창 안에 재문의 — 재유입 1건.
    id: "demo-reinflow",
    source: "demo_modal",
    timestamp: "2026-07-01T02:00:00.000Z",
    last_inflow_at: "2026-08-06T07:00:00.000Z",
    status: "contacted",
  },
  {
    // 창 안에 생성되고 창 안에 또 재문의 — 신규 1건으로만(이중 집계 금지). 기존 픽스처와 합쳐 Meta 3건.
    id: "meta-created-and-reinflow",
    source: "meta_lead_ads",
    timestamp: "2026-08-06T02:30:00.000Z",
    last_inflow_at: "2026-08-06T09:00:00.000Z",
    status: "new",
  },
  {
    // 백필(두 값이 같음) 옛 리드 — 창 밖이다.
    id: "contact-old-backfilled",
    source: "contact_page",
    timestamp: "2026-07-01T02:00:00.000Z",
    last_inflow_at: "2026-07-01T02:00:00.000Z",
    status: "new",
  },
  {
    // 재문의가 창 끝 뒤 — 다음 카드의 몫이다.
    id: "contact-reinflow-next-window",
    source: "contact_page",
    timestamp: "2026-07-01T02:00:00.000Z",
    last_inflow_at: "2026-08-07T01:10:00.000Z",
    status: "new",
  },
]

describe("10:10 KST lead morning brief", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("Meta 와 홈페이지를 카드 한 장으로 합쳐 보낸다 — 홈페이지는 서브 요소", async () => {
    const {
      sendLeadMorningBrief,
      postJson,
      claimLeadDigestRun,
      markLeadDigestRunSent,
    } = await loadMorningBrief()
    const now = new Date("2026-08-07T01:15:00.000Z")

    const result = await sendLeadMorningBrief(now)

    expect(result).toMatchObject({
      status: "sent",
      totalLeads: 4,
      metaLeadAdsLeadCount: 2,
      homepageLeadCount: 2,
      contactPageLeadCount: 1,
      demoModalLeadCount: 1,
      metaAttributedWebsiteLeadCount: 1,
      unrespondedCount: 2,
      contactedCount: 1,
      convertedCount: 1,
      topCampaignLabel: "여름 캠페인",
      windowStart: "2026-08-06T01:10:00.000Z",
      windowEnd: "2026-08-07T01:10:00.000Z",
    })

    // 창별 실행 레코드도 한 줄 — report_type 은 'daily'.
    expect(claimLeadDigestRun).toHaveBeenCalledTimes(1)
    expect(claimLeadDigestRun).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: "daily",
        windowStart: new Date("2026-08-06T01:10:00.000Z"),
        windowEnd: new Date("2026-08-07T01:10:00.000Z"),
      })
    )

    // 위컴에도 한 번만 나간다.
    expect(postJson).toHaveBeenCalledTimes(1)
    expect(postJson.mock.calls[0][1]).toMatchObject({
      msgtype: "template_card",
      template_card: {
        main_title: expect.objectContaining({ title: "리드 일일 리포트" }),
        emphasis_content: { title: "4", desc: "전체 접수" },
        sub_title_text: "미응대 2개 / 상담 진행 1개 / 전환 1개",
        horizontal_content_list: [
          { keyname: "Meta 광고 리드", value: "2개" },
          { keyname: "주요 캠페인", value: "여름 캠페인" },
          { keyname: "홈페이지 문의", value: "1개" },
          { keyname: "홈페이지 데모 신청", value: "1개" },
          { keyname: "홈페이지 Meta 경유", value: "1개" },
        ],
      },
    })
    expect(markLeadDigestRunSent).toHaveBeenCalledTimes(1)
  })

  it("재유입이 없으면 신규/재유입을 가르지 않는다 — 예전 문구 그대로", async () => {
    const { sendLeadMorningBrief, createNotificationEvent } = await loadMorningBrief()

    const result = await sendLeadMorningBrief(new Date("2026-08-07T01:15:00.000Z"))

    expect(result).toMatchObject({ status: "sent", totalLeads: 4, newLeadCount: 4, reinflowLeadCount: 0 })
    const message = createNotificationEvent.mock.calls[0][0].message as string
    expect(message.split("\n")[0]).toBe("08.06 10:10 - 08.07 10:10 전체 접수 4건")
  })

  it("재문의 병합 리드를 창 안 유입으로 세고 신규·재유입을 가른다(생성·재문의가 모두 창 안이면 신규 1건)", async () => {
    const { sendLeadMorningBrief, postJson, createNotificationEvent } =
      await loadMorningBrief(REINFLOW_LEADS)

    const result = await sendLeadMorningBrief(new Date("2026-08-07T01:15:00.000Z"))

    expect(result).toMatchObject({
      status: "sent",
      totalLeads: 6,
      newLeadCount: 5,
      reinflowLeadCount: 1,
      metaLeadAdsLeadCount: 3,
      homepageLeadCount: 3,
      demoModalLeadCount: 2,
      unrespondedCount: 3,
      contactedCount: 2,
      convertedCount: 1,
    })

    const event = createNotificationEvent.mock.calls[0][0]
    expect((event.message as string).split("\n")[0]).toBe(
      "08.06 10:10 - 08.07 10:10 전체 접수 6건 (신규 5건 · 재유입 1건)"
    )
    expect(event.payload).toMatchObject({ newLeadCount: 5, reinflowLeadCount: 1 })

    // 위컴 카드 — 강조 숫자는 합계, 설명은 신규/재유입 분해.
    expect(postJson.mock.calls[0][1]).toMatchObject({
      template_card: {
        emphasis_content: { title: "6", desc: "신규 5 · 재유입 1" },
      },
    })
  })

  it("주말(토·일 KST)에는 일일 보고를 발송하지 않는다", async () => {
    const { sendLeadMorningBrief, postJson, claimLeadDigestRun } = await loadMorningBrief()

    // 2026-08-08 10:15 KST = 토요일, 2026-08-09 10:15 KST = 일요일
    const saturday = await sendLeadMorningBrief(new Date("2026-08-08T01:15:00.000Z"))
    const sunday = await sendLeadMorningBrief(new Date("2026-08-09T01:15:00.000Z"))

    expect(saturday).toMatchObject({ status: "skipped", reason: "weekend" })
    expect(sunday).toMatchObject({ status: "skipped", reason: "weekend" })
    // 주말 구간은 실행 레코드조차 남기지 않는다 — 월요일 발송을 막지 않기 위해서다.
    expect(claimLeadDigestRun).not.toHaveBeenCalled()
    expect(postJson).not.toHaveBeenCalled()
  })

  it("월요일에는 일요일 구간을 담은 보고를 정상 발송한다", async () => {
    const { sendLeadMorningBrief, postJson } = await loadMorningBrief()

    const monday = await sendLeadMorningBrief(new Date("2026-08-10T01:15:00.000Z"))

    expect(monday).toMatchObject({
      status: "sent",
      windowStart: "2026-08-09T01:10:00.000Z",
      windowEnd: "2026-08-10T01:10:00.000Z",
    })
    expect(postJson).toHaveBeenCalled()
  })
})

describe("주간 보고서가 쓰는 '마지막 일일 보고 이후' 구간", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("월요일 아침에는 금요일 10:10 KST 를 가리킨다 — 토·일 카드는 나가지 않았으므로", async () => {
    const { getLastSentLeadMorningWindowEnd } = await loadMorningBrief()

    // 2026-09-07(월) 09:20 KST — 그날 일일 카드(11:10)가 나가기 전
    const since = getLastSentLeadMorningWindowEnd(new Date("2026-09-07T00:20:00.000Z"))

    // 2026-09-04(금) 10:10 KST
    expect(since.toISOString()).toBe("2026-09-04T01:10:00.000Z")
  })

  it("평일 오후에는 그날 아침 카드의 창 끝을 가리킨다", async () => {
    const { getLastSentLeadMorningWindowEnd } = await loadMorningBrief()

    // 2026-09-09(수) 18:00 KST
    const since = getLastSentLeadMorningWindowEnd(new Date("2026-09-09T09:00:00.000Z"))

    expect(since.toISOString()).toBe("2026-09-09T01:10:00.000Z")
  })

  it("구간 집계는 일일 카드와 같은 소스·테스트 리드 규칙을 쓴다", async () => {
    const { summarizeLeadIntake } = await loadMorningBrief()
    const start = new Date("2026-09-04T01:10:00.000Z")
    const end = new Date("2026-09-07T00:20:00.000Z")

    const counts = summarizeLeadIntake(
      [
        { id: "a", source: "meta_lead_ads", timestamp: "2026-09-05T02:00:00.000Z", status: "new" },
        { id: "b", source: "contact_page", timestamp: "2026-09-06T02:00:00.000Z", status: "contacted" },
        { id: "c", source: "demo_modal", timestamp: "2026-09-06T05:00:00.000Z", status: "new" },
        // 테스트 리드는 빠진다
        {
          id: "d",
          source: "meta_lead_ads",
          timestamp: "2026-09-06T06:00:00.000Z",
          status: "new",
          name: "<test lead: dummy data>",
        },
        // 보고 대상 소스가 아니다
        { id: "e", source: "chatbot", timestamp: "2026-09-06T07:00:00.000Z", status: "new" },
        // 구간 밖(금요일 카드가 이미 보고함)
        { id: "f", source: "contact_page", timestamp: "2026-09-04T00:00:00.000Z", status: "new" },
      ] as never,
      start,
      end
    )

    expect(counts).toEqual({
      totalLeads: 3,
      newLeadCount: 3,
      reinflowLeadCount: 0,
      metaLeadAdsLeadCount: 1,
      homepageLeadCount: 2,
      unrespondedCount: 2,
    })
  })

  it("구간 집계도 일일 카드와 같은 유입 축 — 구간 안 재문의는 재유입으로 센다", async () => {
    const { summarizeLeadIntake } = await loadMorningBrief()
    const start = new Date("2026-09-04T01:10:00.000Z")
    const end = new Date("2026-09-07T00:20:00.000Z")

    const counts = summarizeLeadIntake(
      [
        { id: "a", source: "meta_lead_ads", timestamp: "2026-09-05T02:00:00.000Z", status: "new" },
        // 금요일 이전 생성 + 주말 재문의
        {
          id: "b",
          source: "contact_page",
          timestamp: "2026-08-20T02:00:00.000Z",
          last_inflow_at: "2026-09-06T02:00:00.000Z",
          status: "new",
        },
        // 재문의가 구간 밖(이미 금요일 카드가 보고한 구간)
        {
          id: "c",
          source: "demo_modal",
          timestamp: "2026-08-20T02:00:00.000Z",
          last_inflow_at: "2026-09-03T02:00:00.000Z",
          status: "new",
        },
        // 보고 대상 소스가 아니면 재문의여도 빠진다
        {
          id: "d",
          source: "chatbot",
          timestamp: "2026-08-20T02:00:00.000Z",
          last_inflow_at: "2026-09-06T03:00:00.000Z",
          status: "new",
        },
      ] as never,
      start,
      end
    )

    expect(counts).toEqual({
      totalLeads: 2,
      newLeadCount: 1,
      reinflowLeadCount: 1,
      metaLeadAdsLeadCount: 1,
      homepageLeadCount: 1,
      unrespondedCount: 2,
    })
  })
})
