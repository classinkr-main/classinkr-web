import { afterEach, describe, expect, it, vi } from "vitest"

// 주간·월간 리드 다이제스트(lib/server/lead-digest-alerts.ts).
// 2026-09-21 재유입 병합 — 응대 대상 소스의 재문의는 새 행 대신 기존 행의 last_inflow_at 만 갱신한다
// (lib/server/lead-capture.ts). 생성 시각만 보면 재문의가 기간 유입에서 빠지므로 유입 축(생성 또는 재문의)으로
// 세고 신규/재유입을 가른다. 아침 카드(tests/server/lead-morning-brief.test.ts)와 같은 규칙이다.

// 2026-09-21(월) 10:00 KST — 주간 보고 기간은 09-14(월)~09-20(일) KST, 직전 주는 09-07~09-13.
const NOW = new Date("2026-09-21T01:00:00.000Z")

const BASE_LEADS = [
  // 기간 안 신규 — 6일째 미응답(24h·48h 초과).
  { id: "p-new", source: "contact_page", timestamp: "2026-09-15T01:00:00.000Z", status: "new" },
  // 기간 안 생성 + 기간 안 재문의 — 신규 1건으로만.
  {
    id: "p-both",
    source: "meta_lead_ads",
    timestamp: "2026-09-14T03:00:00.000Z",
    last_inflow_at: "2026-09-18T03:00:00.000Z",
    status: "contacted",
    assigned_to: "담당자",
  },
  // 직전 주 신규.
  { id: "prev-new", source: "contact_page", timestamp: "2026-09-08T01:00:00.000Z", status: "converted" },
  // 백필 옛 리드 — 어느 기간에도 없다.
  {
    id: "old",
    source: "contact_page",
    timestamp: "2026-07-01T01:00:00.000Z",
    last_inflow_at: "2026-07-01T01:00:00.000Z",
    status: "new",
  },
  // 테스트 리드·대상 밖 소스는 재문의여도 빠진다.
  {
    id: "test-reinflow",
    source: "meta_lead_ads",
    name: "<test lead: dummy data>",
    timestamp: "2026-07-01T01:00:00.000Z",
    last_inflow_at: "2026-09-16T01:00:00.000Z",
    status: "new",
  },
  {
    id: "newsletter-reinflow",
    source: "newsletter",
    timestamp: "2026-07-01T01:00:00.000Z",
    last_inflow_at: "2026-09-16T01:00:00.000Z",
    status: "new",
  },
]

const REINFLOW_LEADS = [
  // 기간 안 재문의(일요일 23:00 KST) — 재유입. 방치 시계는 재문의부터라 24h 초과가 아니다.
  {
    id: "p-reinflow",
    source: "demo_modal",
    timestamp: "2026-08-01T01:00:00.000Z",
    last_inflow_at: "2026-09-20T14:00:00.000Z",
    status: "new",
  },
  // 직전 주 재문의 — 직전 기간도 같은 축으로 센다(델타가 맞선다).
  {
    id: "prev-reinflow",
    source: "demo_modal",
    timestamp: "2026-07-01T01:00:00.000Z",
    last_inflow_at: "2026-09-10T01:00:00.000Z",
    status: "new",
  },
]

async function loadDigest(leads: Array<Record<string, unknown>>) {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createNotificationEvent = vi.fn().mockResolvedValue({ id: "event-digest" })

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
    createDeliveryLog: vi.fn().mockResolvedValue(undefined),
    createInAppNotifications: vi.fn().mockResolvedValue(undefined),
    createNotificationEvent,
  }))
  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue(leads),
  }))
  vi.doMock("@/lib/repositories/channel-conversations", () => ({
    getConversations: vi.fn().mockReturnValue([]),
  }))
  // 챗봇 넘김 통계는 이 테스트의 관심사가 아니다 — 조회가 일어나도 0 으로 강등되게 막아 둔다.
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => {
      throw new Error("supabase not available in test")
    }),
  }))

  const digest = await import("@/lib/server/lead-digest-alerts")
  return { ...digest, postJson, createNotificationEvent }
}

describe("주간·월간 리드 다이제스트 — 유입 축", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("재유입이 없으면 예전 문구·카드 그대로 — 생성 시각으로 센 것과 같다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { sendLeadDigestAlert, postJson, createNotificationEvent } = await loadDigest(BASE_LEADS)

    const result = await sendLeadDigestAlert("weekly", NOW)

    expect(result).toMatchObject({
      periodLabel: "2026.09.14 - 2026.09.20",
      totalLeads: 2,
      newLeadCount: 2,
      reinflowLeadCount: 0,
      previousTotalLeads: 1,
      deltaLeads: 1,
      unrespondedCount: 1,
      over24h: 1,
      over48h: 1,
    })
    const message = createNotificationEvent.mock.calls[0][0].message as string
    expect(message).not.toContain("재유입")
    expect(message.split("\n")[0]).toBe("2026.09.14 - 2026.09.20 유효 인바운드 2개")
    expect(postJson.mock.calls[0][1]).toMatchObject({
      template_card: { emphasis_content: { title: "2", desc: "신규 리드" } },
    })
  })

  it("기간 안 재문의를 재유입으로 세고 신규/재유입을 가른다 — 한 리드는 한 번만", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { sendLeadDigestAlert, postJson, createNotificationEvent } = await loadDigest([
      ...BASE_LEADS,
      ...REINFLOW_LEADS,
    ])

    const result = await sendLeadDigestAlert("weekly", NOW)

    expect(result).toMatchObject({
      totalLeads: 3,
      newLeadCount: 2,
      reinflowLeadCount: 1,
      totalInboundCount: 3,
      // 직전 주도 같은 축 — 신규 1 + 재문의 1.
      previousTotalLeads: 2,
      deltaLeads: 1,
      contactPageLeadCount: 1,
      demoModalLeadCount: 1,
      metaLeadAdsLeadCount: 1,
      contactedCount: 1,
      unrespondedCount: 2,
      // 재문의 리드의 방치 시계는 재문의 시각(11시간 전)부터 — 몇 달 전 생성 때문에 48시간 초과로 뜨지 않는다.
      over24h: 1,
      over48h: 1,
      unassignedCount: 2,
    })

    const event = createNotificationEvent.mock.calls[0][0]
    const lines = (event.message as string).split("\n")
    expect(lines[0]).toBe("2026.09.14 - 2026.09.20 유효 인바운드 3개")
    expect(lines[1]).toBe("홈페이지 문의 1개 / 데모 신청 1개 / 접수 0개 / Meta 1개")
    expect(lines[2]).toBe("리드 3개 — 신규 2개 · 재유입 1개")
    expect(lines[3]).toMatch(/^채널톡 문의 /)
    expect(event.payload).toMatchObject({ newLeadCount: 2, reinflowLeadCount: 1 })

    // 위컴 카드 — 합계에 재유입이 섞이면 "신규 리드"라고 부르지 않는다.
    expect(postJson.mock.calls[0][1]).toMatchObject({
      template_card: { emphasis_content: { title: "3", desc: "신규 2 · 재유입 1" } },
    })
  })

  it("월간도 같은 축 — 지난달 재문의를 지난달 유입으로 센다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const { sendLeadDigestAlert } = await loadDigest([
      ...BASE_LEADS,
      ...REINFLOW_LEADS,
      // 8월 재문의 — 2026-10-01 발송 월간(9월) 보고 기준 직전 달.
      {
        id: "aug-reinflow",
        source: "contact_page",
        timestamp: "2026-06-01T01:00:00.000Z",
        last_inflow_at: "2026-08-20T01:00:00.000Z",
        status: "new",
      },
    ])

    // 2026-10-01 10:00 KST — 기간 = 9월, 직전 = 8월.
    const result = await sendLeadDigestAlert("monthly", new Date("2026-10-01T01:00:00.000Z"))

    // 9월: p-new·p-both(신규) + p-reinflow·prev-reinflow(재문의). test/newsletter 는 빠진다.
    // prev-new(09-08)도 9월 신규다.
    expect(result).toMatchObject({
      periodLabel: "2026.09.01 - 2026.09.30",
      totalLeads: 5,
      newLeadCount: 3,
      reinflowLeadCount: 2,
      // 8월: aug-reinflow(재문의) + p-reinflow(8월 1일 생성 — 8월엔 신규, 9월엔 재유입으로 각 1건).
      previousTotalLeads: 2,
    })
  })
})
