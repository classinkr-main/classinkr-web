import { afterEach, describe, expect, it, vi } from "vitest"

import type { ShowroomBookingRecord } from "@/lib/repositories/showroom-bookings"

const OPS_ROOM_URL = "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=existing-room"

async function loadEmitter() {
  vi.resetModules()

  const postJson = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  const createDeliveryLog = vi.fn().mockResolvedValue(undefined)
  const createNotificationEvent = vi.fn().mockResolvedValue({ id: "event-1" })

  vi.doMock("@/lib/repositories/settings", () => ({
    getResolvedSettings: vi.fn().mockResolvedValue({
      wecomOpsWebhookUrl: OPS_ROOM_URL,
      wecomCriticalWebhookUrl: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=critical-room",
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

  const emitter = await import("@/lib/notifications/emit-event")
  return { ...emitter, postJson, createDeliveryLog, createNotificationEvent }
}

/**
 * 쇼룸 알림은 payload 를 만드는 쪽(lib/showroom/bookings.ts · lib/server/showroom-compass-confirm.ts)과 위컴 문구를
 * 펴는 쪽(emit-event)이 키 이름으로만 이어진다 — 손으로 만든 payload 로는 그 이음매가 끊겨도 초록이다. 그래서 진짜 빌더를
 * 불러 진짜 emitNotificationEvent 에 넘긴다. 빌더 모듈의 DB·발송 의존성은 전부 막는다(불리면 던진다).
 */
async function loadShowroomEmitter() {
  const emitter = await loadEmitter()
  const forbidden = () => {
    throw new Error("빌더 테스트에서 DB·발송을 부르면 안 된다")
  }
  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(forbidden) }))
  vi.doMock("@/lib/server/lead-capture", () => ({ submitLeadCapture: vi.fn(forbidden) }))
  vi.doMock("@/lib/messaging/customer-receipt", () => ({
    sendShowroomBookingReceipt: vi.fn(forbidden),
    sendShowroomBookingConfirmation: vi.fn(forbidden),
  }))
  vi.doMock("@/lib/repositories/showroom-bookings", () => ({
    claimShowroomConfirmationMessage: vi.fn(forbidden),
    confirmShowroomBookingFromCompass: vi.fn(forbidden),
    listShowroomBookingsAwaitingConfirm: vi.fn(forbidden),
    listUsedCompassDemoIds: vi.fn(forbidden),
  }))
  vi.doMock("@/lib/compass/admin-lead-links", () => ({ getCompassLinksForAdminLeads: vi.fn(forbidden) }))
  vi.doMock("@/lib/compass/bridge", () => ({ getCompassShowroomDemoRounds: vi.fn(forbidden) }))
  vi.doMock("@/lib/auth/audit", () => ({ logAudit: vi.fn(forbidden) }))

  const bookings = await import("@/lib/showroom/bookings")
  const confirm = await import("@/lib/server/showroom-compass-confirm")
  return {
    ...emitter,
    normalizeShowroomBooking: bookings.normalizeShowroomBooking,
    buildShowroomBookingNotification: bookings.buildShowroomBookingNotification,
    buildShowroomConfirmedNotification: confirm.buildShowroomConfirmedNotification,
  }
}

/** 마지막 위컴 발송의 본문 */
function lastWecomText(postJson: ReturnType<typeof vi.fn>) {
  const calls = postJson.mock.calls
  const body = calls[calls.length - 1][1] as { text?: { content?: string } }
  return body.text?.content ?? ""
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

const SHOWROOM_REQUEST_BODY = {
  consent: true,
  visitDate: "2026-11-12",
  visitTime: "14:00",
  org: "무궁화 학원",
  name: "홍길동",
  phone: "010-1234-5678",
  email: "ops@example.com",
  role: "원장",
  visitorCount: 2,
  academySize: "100~300명",
  interests: ["전자칠판 직접 써보기", "수업 녹화·복습 흐름"],
  memo: "대표 수업 자료 들고 가겠습니다.",
  sourcePage: "/showroom",
}

describe("WeCom showroom booking notification", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  /**
   * 쇼룸은 신청형이다(2026-11-06) — 신청 알림은 확정이 아니라 Compass 컨펌 대기를 알리고 팀이 할 일을 적는다.
   * categoryTag:"lead" 미등록 이벤트는 일반 폴백으로 떨어져 제목 한 줄만 나가므로, 전용 문구가 실제로 붙는지와
   * 담당자가 전화하는 데 필요한 값이 다 펼쳐지는지 본다.
   */
  it("스위치가 켜져 있으면 Compass 컨펌 대기와 할 일(「쇼룸 데모」 회차 → 자동 확정·확정 문자)을 알린다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "1")
    const { emitNotificationEvent, postJson, createNotificationEvent, normalizeShowroomBooking, buildShowroomBookingNotification } =
      await loadShowroomEmitter()
    const validation = normalizeShowroomBooking(SHOWROOM_REQUEST_BODY)
    if (!validation.ok) throw new Error("fixture must be valid")

    await emitNotificationEvent(
      buildShowroomBookingNotification({ booking: validation.value, bookingId: "booking-1", leadId: "lead-1" })
    )

    expect(postJson).toHaveBeenCalledTimes(1)
    expect(postJson.mock.calls[0][0]).toBe(OPS_ROOM_URL)
    const content = lastWecomText(postJson)
    const lines = content.split("\n")

    // 일반 폴백("[INFO] 제목")이 아니라 전용 문구 — 신청이고 Compass 컨펌을 기다린다.
    expect(content).not.toContain("[INFO]")
    expect(lines[0]).toBe("목동 쇼룸 방문 신청이 1건 들어왔습니다 (Compass 컨펌 대기)")
    expect(lines[1]).toBe(
      "할 일: Compass 에서 이 리드에 데모 회차를 추가하고 방식 「쇼룸 데모」·날짜·시각·담당을 넣어 주세요."
    )
    expect(lines[2]).toBe("그러면 다음 5분 동기화에서 확정되고 고객에게 확정 문자가 자동으로 나갑니다.")
    // 확정으로 읽히거나 수동 안내가 섞이면 안 된다.
    expect(content).not.toContain("확정되었습니다")
    expect(content).not.toContain("수동 확정")
    expect(content).not.toContain("접수 큐")

    // 담당자가 창을 열지 않고 전화할 수 있는 값들 — 예전 줄은 그대로 남는다.
    expect(lines).toContain("희망 일시: 11월 12일 14:00")
    expect(lines).toContain("학원: 무궁화 학원")
    expect(lines).toContain("담당자: 홍길동 (원장)")
    expect(lines).toContain("연락처: 010-1234-5678")
    expect(lines).toContain("이메일: ops@example.com")
    expect(lines).toContain("방문 인원: 2명")
    expect(lines).toContain("학원 규모: 100~300명")
    expect(lines).toContain("보고 싶은 것: 전자칠판 직접 써보기, 수업 녹화·복습 흐름")
    expect(lines).toContain("메모: 대표 수업 자료 들고 가겠습니다.")
    expect(lines).toContain("접수 경로: /showroom")
    expect(lines).toContain("접수 번호: booking-1")
    expect(lines).toContain("확인: https://classin.co.kr/admin/crm/customers/leads?lead=lead-1")

    // 인앱 제목도 "신청"이다.
    expect(createNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "showroom.booking_requested", title: "쇼룸 방문 신청: 무궁화 학원" })
    )
  })

  it("스위치가 꺼져 있으면 자동 확정·확정 문자를 약속하지 않고 접수 큐의 수동 확정을 안내한다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    vi.stubEnv("SHOWROOM_CONFIRM_ENABLED", "")
    const { emitNotificationEvent, postJson, normalizeShowroomBooking, buildShowroomBookingNotification } =
      await loadShowroomEmitter()
    const validation = normalizeShowroomBooking(SHOWROOM_REQUEST_BODY)
    if (!validation.ok) throw new Error("fixture must be valid")

    await emitNotificationEvent(
      buildShowroomBookingNotification({ booking: validation.value, bookingId: "booking-1", leadId: "lead-1" })
    )

    const content = lastWecomText(postJson)
    const lines = content.split("\n")
    expect(lines[0]).toBe("목동 쇼룸 방문 신청이 1건 들어왔습니다 (수동 확정 대기)")
    expect(lines).toContain(
      "할 일: 자동 확정이 꺼져 있습니다. 고객과 일정을 맞춘 뒤 어드민 접수 큐에서 직접 확정해 주세요."
    )
    expect(lines).toContain("확정 문자가 자동으로 나가지 않으니 확정 안내는 고객에게 직접 해 주세요.")
    expect(lines).toContain("접수 큐: https://classin.co.kr/admin/crm/customers/intake")
    // 꺼져 있을 때 자동 확정·Compass 컨펌을 약속하면 아무도 확정하지 않는다.
    expect(content).not.toContain("Compass 컨펌")
    expect(content).not.toContain("「쇼룸 데모」")
    expect(content).not.toContain("자동으로 나갑니다")
    // 예전 줄은 그대로다.
    expect(lines).toContain("희망 일시: 11월 12일 14:00")
    expect(lines).toContain("연락처: 010-1234-5678")
    expect(lines).toContain("접수 번호: booking-1")
  })

  it("선택 필드가 비면 그 줄을 아예 빼고 보낸다 — 안내 값이 없는 옛 payload 는 자동 확정을 약속하지 않는다", async () => {
    const { emitNotificationEvent, postJson } = await loadEmitter()

    await emitNotificationEvent({
      eventType: "showroom.booking_requested",
      notificationType: "action_required",
      categoryTag: "lead",
      title: "쇼룸 방문 신청: 무궁화 학원",
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

    const content = lastWecomText(postJson)

    expect(content).toContain("무궁화 학원")
    // 직책이 없으면 괄호를 붙이지 않는다.
    expect(content).toContain("홍길동")
    expect(content).not.toContain("홍길동 (")
    expect(content).not.toContain("이메일")
    expect(content).not.toContain("메모")
    expect(content).not.toContain("학원 규모")
    expect(content).toContain("(수동 확정 대기)")
    expect(content).not.toContain("Compass 컨펌")
  })
})

function confirmedRecord(overrides: Partial<ShowroomBookingRecord> = {}): ShowroomBookingRecord {
  return {
    id: "booking-1",
    visitDate: "2026-11-12",
    visitTime: "14:00",
    durationMinutes: 60,
    org: "무궁화 학원",
    name: "홍길동",
    phone: "010-1234-5678",
    email: "ops@example.com",
    role: "원장",
    visitorCount: 2,
    academySize: null,
    interests: [],
    memo: null,
    status: "confirmed",
    assignedTo: "진소망",
    confirmedAt: "2026-11-06T03:00:00.000Z",
    googleCalendarEventId: null,
    leadId: "lead-1",
    sourcePage: "/showroom",
    createdAt: "2026-11-05T01:00:00.000Z",
    updatedAt: "2026-11-06T03:00:00.000Z",
    requestedVisitDate: null,
    requestedVisitTime: null,
    compassDemoId: 9001,
    confirmationSentAt: "2026-11-06T03:00:01.000Z",
    ...overrides,
  }
}

const CONFIRM_PLAN = { compassDemoId: 9001, compassLeadId: 101, assignedTo: "진소망", moved: false }

describe("WeCom showroom confirmed notification", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("Compass 가 확정한 방문을 신청 알림과 같은 운영 방에 펼친다 — 확정 일시·학원·고객·담당·인원·문자·Compass·어드민", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    const { emitNotificationEvent, postJson, createNotificationEvent, buildShowroomConfirmedNotification } =
      await loadShowroomEmitter()

    await emitNotificationEvent(
      buildShowroomConfirmedNotification({
        before: { visitDate: "2026-11-12", visitTime: "14:00" },
        confirmed: confirmedRecord(),
        plan: CONFIRM_PLAN,
        message: "sent",
      })
    )

    expect(postJson).toHaveBeenCalledTimes(1)
    expect(postJson.mock.calls[0][0]).toBe(OPS_ROOM_URL)
    const lines = lastWecomText(postJson).split("\n")
    expect(lines).toEqual([
      "목동 쇼룸 방문이 Compass 에서 확정되었습니다",
      "",
      "확정 일시: 11월 12일 14:00",
      "학원: 무궁화 학원",
      "고객: 홍길동 (원장)",
      "연락처: 010-1234-5678",
      "담당: 진소망",
      "방문 인원: 2명",
      "확정 문자: 보냄",
      "Compass: https://mkt.classin.co.kr/leads?open=101",
      "확인: https://classin.co.kr/admin/crm/customers/leads?lead=lead-1",
      "접수 번호: booking-1",
    ])
    expect(createNotificationEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "showroom.booking_confirmed",
        title: "쇼룸 방문 확정: 무궁화 학원",
        categoryTag: "lead",
        notificationType: "status_update",
        severity: "info",
        source: "showroom_booking",
        sourceId: "booking-1",
      })
    )
  })

  it("Compass 가 시각을 옮겨 확정했으면 처음 신청 일시를 같이 적는다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    const { emitNotificationEvent, postJson, buildShowroomConfirmedNotification } = await loadShowroomEmitter()

    await emitNotificationEvent(
      buildShowroomConfirmedNotification({
        before: { visitDate: "2026-11-12", visitTime: "14:00" },
        confirmed: confirmedRecord({
          visitDate: "2026-11-13",
          visitTime: "15:00",
          requestedVisitDate: "2026-11-12",
          requestedVisitTime: "14:00",
        }),
        plan: { ...CONFIRM_PLAN, moved: true },
        message: "sent",
      })
    )

    const lines = lastWecomText(postJson).split("\n")
    expect(lines.slice(2, 4)).toEqual(["확정 일시: 11월 13일 15:00", "처음 신청 일시: 11월 12일 14:00"])
  })

  it("확정 문자 결과를 한국어로 적고, 실패면 머리에 띄우고 warning 으로 올린다(운영 방 그대로)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    const { emitNotificationEvent, postJson, createNotificationEvent, buildShowroomConfirmedNotification } =
      await loadShowroomEmitter()

    const cases = [
      ["sent", "확정 문자: 보냄", "info"],
      ["simulated", "확정 문자: 모의 발송 — 실제 문자는 나가지 않음", "info"],
      ["failed", "확정 문자: 실패 — 고객에게 직접 연락 필요", "warning"],
      ["skipped", "확정 문자: 보내지 않음 — 이미 보냈거나 지난 방문", "info"],
    ] as const

    for (const [message, line, severity] of cases) {
      await emitNotificationEvent(
        buildShowroomConfirmedNotification({
          before: { visitDate: "2026-11-12", visitTime: "14:00" },
          confirmed: confirmedRecord(),
          plan: CONFIRM_PLAN,
          message,
        })
      )
      const lines = lastWecomText(postJson).split("\n")
      expect(lines).toContain(line)
      expect(lines[0]).toBe(
        message === "failed"
          ? "목동 쇼룸 방문이 Compass 에서 확정되었습니다 (확정 문자 실패 — 고객에게 직접 연락 필요)"
          : "목동 쇼룸 방문이 Compass 에서 확정되었습니다"
      )
      // warning 도 긴급 방이 아니라 신청 알림과 같은 운영 방이다.
      expect(postJson.mock.calls[postJson.mock.calls.length - 1][0]).toBe(OPS_ROOM_URL)
      expect(createNotificationEvent.mock.calls[createNotificationEvent.mock.calls.length - 1][0]).toMatchObject({
        severity,
        notificationType: severity === "warning" ? "action_required" : "status_update",
      })
    }
    expect(postJson).toHaveBeenCalledTimes(cases.length)
  })

  it("어드민 리드가 없으면 확인 링크는 접수 큐다", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://classin.co.kr")
    const { emitNotificationEvent, postJson, buildShowroomConfirmedNotification } = await loadShowroomEmitter()

    await emitNotificationEvent(
      buildShowroomConfirmedNotification({
        before: { visitDate: "2026-11-12", visitTime: "14:00" },
        confirmed: confirmedRecord({ leadId: null }),
        plan: CONFIRM_PLAN,
        message: "sent",
      })
    )

    expect(lastWecomText(postJson).split("\n")).toContain("확인: https://classin.co.kr/admin/crm/customers/intake")
  })
})
