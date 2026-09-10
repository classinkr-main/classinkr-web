import { afterEach, describe, expect, it, vi } from "vitest"

async function loadEmitter() {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomOpsWebhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=existing-room",
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
    createNotificationEvent: vi.fn().mockResolvedValue({ id: "event-1" }),
  }))

  const emitter = await import("@/lib/notifications/emit-event")
  return { ...emitter, postJson, createDeliveryLog }
}

describe("WeCom lead notification", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("uses the existing operations room and includes the CONTACT inquiry", async () => {
    const { emitNotificationEvent, postJson, createDeliveryLog } = await loadEmitter()

    await emitNotificationEvent({
      eventType: "lead.created",
      notificationType: "action_required",
      categoryTag: "lead",
      severity: "info",
      title: "새 리드: Codex Test Academy",
      message: "Codex Test / Codex Test Academy / contact_page",
      routeUrl: "/admin/crm",
      source: "lead",
      sourceId: "lead-contact-wecom-1",
      payload: {
        source: "contact_page",
        sourceDetail: "도입 상담",
        org: "Codex Test Academy",
        name: "Codex Test",
        phone: "010-1234-5678",
        message: "문의 유형: 도입 상담\n도입 절차가 궁금합니다.",
      },
      channels: ["wecom_webhook"],
    })

    expect(postJson).toHaveBeenCalledWith(
      "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=existing-room",
      {
        msgtype: "text",
        text: {
          content: expect.stringContaining(
            "문의 내용: 문의 유형: 도입 상담 도입 절차가 궁금합니다."
          ),
        },
      }
    )
    expect(createDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "wecom_webhook",
        status: "sent",
      })
    )
  })
})

describe("WeCom showroom booking notification", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  /**
   * 1차 쇼룸 예약은 요청형이라 담당자가 확정 연락을 해야 끝난다.
   * categoryTag:"lead" 미등록 이벤트는 일반 폴백으로 떨어져 제목 한 줄만 나가므로,
   * 전용 문구가 실제로 붙는지와 담당자가 전화하는 데 필요한 값이 다 펼쳐지는지 본다.
   */
  it("확정 연락에 필요한 값을 한 메시지에 펼친다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter()

    await emitNotificationEvent({
      eventType: "showroom.booking_requested",
      notificationType: "action_required",
      categoryTag: "lead",
      severity: "info",
      scopeTag: "org_admin",
      title: "쇼룸 방문 예약: 무궁화 학원",
      message: "홍길동 / 010-1234-5678 / 9월 2일 10:00",
      routeUrl: "/admin/crm/customers/leads?lead=lead-1",
      source: "showroom_booking",
      sourceId: "booking-1",
      channels: ["wecom_webhook"],
      payload: {
        bookingId: "booking-1",
        leadId: "lead-1",
        visitLabel: "9월 2일 10:00",
        org: "무궁화 학원",
        name: "홍길동",
        role: "원장",
        phone: "010-1234-5678",
        email: "ops@example.com",
        visitorCount: 2,
        academySize: "100~300명",
        interests: "전자칠판 직접 써보기, 수업 녹화·복습 흐름",
        memo: "대표 수업 자료 들고 가겠습니다.",
        sourcePage: "/showroom",
      },
    })

    expect(postJson).toHaveBeenCalled()
    const body = postJson.mock.calls[0][1] as { text?: { content?: string } }
    const content = body.text?.content ?? ""

    // 일반 폴백("[INFO] 제목")이 아니라 전용 문구가 붙어야 한다.
    expect(content).not.toContain("[INFO]")
    expect(content).toContain("목동 쇼룸 방문 예약이 1건 들어왔습니다")
    // 확정 연락 전이라는 것이 드러나야 한다 — 확정으로 읽히면 안 된다.
    expect(content).toContain("확정 연락 필요")

    // 담당자가 창을 열지 않고 전화할 수 있는 값들.
    expect(content).toContain("9월 2일 10:00")
    expect(content).toContain("무궁화 학원")
    expect(content).toContain("홍길동 (원장)")
    expect(content).toContain("010-1234-5678")
    expect(content).toContain("방문 인원: 2명")
    expect(content).toContain("전자칠판 직접 써보기")
    expect(content).toContain("booking-1")
  })

  it("선택 필드가 비면 그 줄을 아예 빼고 보낸다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter()

    await emitNotificationEvent({
      eventType: "showroom.booking_requested",
      notificationType: "action_required",
      categoryTag: "lead",
      title: "쇼룸 방문 예약: 무궁화 학원",
      message: "홍길동 / 010-1234-5678 / 9월 2일 10:00",
      channels: ["wecom_webhook"],
      payload: {
        bookingId: "booking-2",
        visitLabel: "9월 2일 10:00",
        org: "무궁화 학원",
        name: "홍길동",
        phone: "010-1234-5678",
        visitorCount: 1,
        email: null,
        role: null,
        memo: null,
        academySize: null,
        interests: "",
      },
    })

    const body = postJson.mock.calls[0][1] as { text?: { content?: string } }
    const content = body.text?.content ?? ""

    expect(content).toContain("무궁화 학원")
    // 직책이 없으면 괄호를 붙이지 않는다.
    expect(content).toContain("홍길동")
    expect(content).not.toContain("홍길동 (")
    expect(content).not.toContain("이메일")
    expect(content).not.toContain("메모")
    expect(content).not.toContain("학원 규모")
  })
})
