import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 쇼룸 예약 접수 파이프라인. Supabase·리드 캡처·알림은 전부 모킹하고
 * 검증 규칙과 불변식(저장 1순위 / 알림 1건 / 후속은 best-effort)만 본다.
 */

const VALID_BODY = {
  consent: true,
  visitDate: "2026-09-02",
  visitTime: "10:00",
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

async function loadBookings(options?: { insertError?: string; leadOk?: boolean }) {
  vi.resetModules()

  const insertedRows: Record<string, unknown>[] = []
  const updates: Record<string, unknown>[] = []
  const emitNotificationEvent = vi.fn().mockResolvedValue(undefined)
  const submitLeadCapture = vi.fn().mockResolvedValue({
    status: 200,
    body: options?.leadOk === false ? { ok: false } : { ok: true, leadId: "lead-1" },
  })

  const createSupabaseAdminClient = vi.fn(() => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return {
          select: () => ({
            single: async () =>
              options?.insertError
                ? { data: null, error: { message: options.insertError } }
                : { data: { id: "booking-1" }, error: null },
          }),
        }
      },
      update: (patch: Record<string, unknown>) => {
        updates.push(patch)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }))

  vi.doMock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent }))
  vi.doMock("@/lib/server/lead-capture", () => ({ submitLeadCapture }))

  const mod = await import("@/lib/showroom/bookings")
  return { mod, insertedRows, updates, emitNotificationEvent, submitLeadCapture }
}

/** 후속 작업(deferTask)을 즉시 돌리고 끝날 때까지 기다린다. */
function immediateDefer() {
  const pending: Promise<void>[] = []
  return {
    deferTask: (task: () => Promise<void>) => {
      pending.push(task())
    },
    settle: () => Promise.all(pending),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("normalizeShowroomBooking", () => {
  let normalize: typeof import("@/lib/showroom/bookings").normalizeShowroomBooking

  beforeEach(async () => {
    const { mod } = await loadBookings()
    normalize = mod.normalizeShowroomBooking
  })

  it("정상 본문을 통과시킨다", () => {
    const result = normalize(VALID_BODY)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.visitDate).toBe("2026-09-02")
    expect(result.value.visitTime).toBe("10:00")
    expect(result.value.visitorCount).toBe(2)
  })

  it("동의 없이는 받지 않는다", () => {
    expect(normalize({ ...VALID_BODY, consent: false })).toEqual({ ok: false, field: "consent" })
    expect(normalize({ ...VALID_BODY, consent: undefined })).toEqual({ ok: false, field: "consent" })
    // 문자열 "true" 도 동의가 아니다.
    expect(normalize({ ...VALID_BODY, consent: "true" })).toEqual({ ok: false, field: "consent" })
  })

  it("실존하지 않는 날짜를 막는다", () => {
    expect(normalize({ ...VALID_BODY, visitDate: "2026-02-30" }).ok).toBe(false)
    expect(normalize({ ...VALID_BODY, visitDate: "2026-9-2" }).ok).toBe(false)
    expect(normalize({ ...VALID_BODY, visitDate: "" }).ok).toBe(false)
  })

  it("등록된 슬롯 시각만 받는다", () => {
    // 점심시간은 슬롯이 아니다.
    expect(normalize({ ...VALID_BODY, visitTime: "12:00" })).toEqual({
      ok: false,
      field: "visitTime",
    })
    expect(normalize({ ...VALID_BODY, visitTime: "10:30" }).ok).toBe(false)
  })

  it("연락처를 형식까지 본다", () => {
    expect(normalize({ ...VALID_BODY, phone: "123" })).toEqual({ ok: false, field: "phone" })
    // +82 표기와 하이픈은 관대하게 받는다.
    expect(normalize({ ...VALID_BODY, phone: "+82 10-1234-5678" }).ok).toBe(true)
  })

  it("이메일은 선택이지만 값이 있으면 형식을 본다", () => {
    expect(normalize({ ...VALID_BODY, email: undefined }).ok).toBe(true)
    expect(normalize({ ...VALID_BODY, email: "" }).ok).toBe(true)
    expect(normalize({ ...VALID_BODY, email: "broken@" })).toEqual({ ok: false, field: "email" })
  })

  it("방문 인원은 미지정이면 1명, 범위 밖은 거부한다", () => {
    const omitted = normalize({ ...VALID_BODY, visitorCount: undefined })
    expect(omitted.ok && omitted.value.visitorCount).toBe(1)

    expect(normalize({ ...VALID_BODY, visitorCount: 0 })).toEqual({
      ok: false,
      field: "visitorCount",
    })
    expect(normalize({ ...VALID_BODY, visitorCount: 21 }).ok).toBe(false)
    expect(normalize({ ...VALID_BODY, visitorCount: 2.5 }).ok).toBe(false)
  })

  it("등록되지 않은 관심사는 버린다", () => {
    const result = normalize({
      ...VALID_BODY,
      interests: ["전자칠판 직접 써보기", "<script>", "없는항목"],
    })
    expect(result.ok && result.value.interests).toEqual(["전자칠판 직접 써보기"])
  })

  it("관심사 중복을 제거하고 화면 순서를 유지한다", () => {
    const result = normalize({
      ...VALID_BODY,
      interests: ["견적·도입 범위", "전자칠판 직접 써보기", "견적·도입 범위"],
    })
    expect(result.ok && result.value.interests).toEqual([
      "전자칠판 직접 써보기",
      "견적·도입 범위",
    ])
  })

  it("본문이 객체가 아니면 거부한다", () => {
    expect(normalize(null).ok).toBe(false)
    expect(normalize("문자열").ok).toBe(false)
    expect(normalize([]).ok).toBe(false)
  })
})

describe("submitShowroomBooking", () => {
  it("저장 → 리드 미러 → 링크 → 알림 순서로 흐른다", async () => {
    const { mod, insertedRows, updates, emitNotificationEvent, submitLeadCapture } =
      await loadBookings()
    const defer = immediateDefer()

    const result = await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    await defer.settle()

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, bookingId: "booking-1" })

    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]).toMatchObject({
      visit_date: "2026-09-02",
      visit_time: "10:00",
      status: "requested",
      org: "무궁화 학원",
    })

    // 리드 큐 미러 — 쇼룸 의향이 분리 집계되도록 sourceDetail 을 고정한다.
    expect(submitLeadCapture).toHaveBeenCalledTimes(1)
    expect(submitLeadCapture.mock.calls[0][0]).toMatchObject({
      source: "contact_page",
      sourceDetail: "showroom_booking",
      marketingConsent: false,
    })
    // lead.created 알림은 끄고 showroom.booking_requested 1건으로 통일한다.
    expect(submitLeadCapture.mock.calls[0][1]).toMatchObject({
      suppressLeadCreatedNotification: true,
    })

    expect(updates).toEqual([{ lead_id: "lead-1" }])

    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent.mock.calls[0][0]).toMatchObject({
      eventType: "showroom.booking_requested",
      channels: ["wecom_webhook"],
    })
  })

  it("저장이 실패하면 500 이고 후속을 돌리지 않는다", async () => {
    const { mod, emitNotificationEvent, submitLeadCapture } = await loadBookings({
      insertError: "boom",
    })
    const defer = immediateDefer()

    const result = await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    await defer.settle()

    expect(result.status).toBe(500)
    expect(submitLeadCapture).not.toHaveBeenCalled()
    expect(emitNotificationEvent).not.toHaveBeenCalled()
  })

  it("리드 미러가 실패해도 예약은 성공이고 알림은 나간다", async () => {
    const { mod, updates, emitNotificationEvent } = await loadBookings({ leadOk: false })
    const defer = immediateDefer()

    const result = await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    await defer.settle()

    expect(result.status).toBe(200)
    // 리드 id 가 없으니 링크 업데이트는 건너뛴다.
    expect(updates).toEqual([])
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
    expect(emitNotificationEvent.mock.calls[0][0].payload).toMatchObject({ leadId: null })
  })

  it("슬롯이 닫혀 있으면 409 로 막고 저장하지 않는다", async () => {
    const { mod, insertedRows } = await loadBookings()

    const result = await mod.submitShowroomBooking(VALID_BODY, {
      isSlotOpen: async () => false,
    })

    expect(result.status).toBe(409)
    expect(result.body).toEqual({ ok: false, error: "slot_unavailable" })
    expect(insertedRows).toHaveLength(0)
  })

  it("검증 실패는 저장 전에 400 이고 어떤 필드인지 알려준다", async () => {
    const { mod, insertedRows } = await loadBookings()

    const result = await mod.submitShowroomBooking({ ...VALID_BODY, visitTime: "12:00" })

    expect(result.status).toBe(400)
    expect(result.body).toEqual({ ok: false, error: "validation", field: "visitTime" })
    expect(insertedRows).toHaveLength(0)
  })

  it("같은 접수의 재시도는 행도 알림도 늘리지 않는다", async () => {
    const { mod, insertedRows, emitNotificationEvent } = await loadBookings()
    const defer = immediateDefer()

    const first = await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    const second = await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    await defer.settle()

    expect(first.body).toEqual(second.body)
    expect(insertedRows).toHaveLength(1)
    expect(emitNotificationEvent).toHaveBeenCalledTimes(1)
  })

  it("다른 슬롯이면 별개 접수로 받는다", async () => {
    const { mod, insertedRows } = await loadBookings()
    const defer = immediateDefer()

    await mod.submitShowroomBooking(VALID_BODY, { deferTask: defer.deferTask })
    await mod.submitShowroomBooking(
      { ...VALID_BODY, visitTime: "11:00" },
      { deferTask: defer.deferTask }
    )
    await defer.settle()

    expect(insertedRows).toHaveLength(2)
  })
})
