import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * 접수 이후의 축 — 담당자 확정 경로(저장소 상태 전이)와 캘린더 편입(어댑터).
 *
 * Supabase 는 tests/showroom/bookings.test.ts 와 같은 스타일로 모킹한다(체이닝하는
 * 가짜 쿼리 빌더). 검증 대상은 우리 규칙이다:
 *   - confirmed 로 올리면 confirmed_at 이 채워진다
 *   - 미등록 상태값은 거부한다
 *   - canceled·no_show 는 캘린더에 자리를 잡지 않는다
 *   - endTime 이 duration 만큼 뒤다
 *   - 소스가 "showroom_booking" 이고 ICS 의 "showroom" 과 섞이지 않는다
 */

interface BookingRow {
  id: string
  visit_date: string
  visit_time: string
  duration_minutes: number
  org: string
  name: string
  phone: string
  email: string | null
  role: string | null
  visitor_count: number
  academy_size: string | null
  interests: string[] | null
  memo: string | null
  status: string
  assigned_to: string | null
  confirmed_at: string | null
  google_calendar_event_id: string | null
  lead_id: string | null
  source_page: string | null
  created_at: string
  updated_at: string
}

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    visit_date: "2026-09-02",
    visit_time: "10:00",
    duration_minutes: 60,
    org: "무궁화 학원",
    name: "홍길동",
    phone: "010-1234-5678",
    email: "ops@example.com",
    role: "원장",
    visitor_count: 2,
    academy_size: "100~300명",
    interests: ["전자칠판 직접 써보기"],
    memo: null,
    status: "requested",
    assigned_to: null,
    confirmed_at: null,
    google_calendar_event_id: null,
    lead_id: null,
    source_page: "/showroom",
    created_at: "2026-08-29T00:00:00.000Z",
    updated_at: "2026-08-29T00:00:00.000Z",
    ...overrides,
  }
}

/**
 * showroom_bookings 한 테이블만 흉내 내는 최소 쿼리 빌더.
 * select().eq().maybeSingle() 과 update().eq().select().maybeSingle(),
 * 그리고 목록 조회(select().order().order().gte().lte())를 지원한다.
 */
function makeSupabase(rows: BookingRow[]) {
  const updates: Record<string, unknown>[] = []

  function builder(mode: "select" | "update", patch?: Record<string, unknown>) {
    let matched = [...rows]
    const chain = {
      eq(column: string, value: unknown) {
        matched = matched.filter((item) => (item as unknown as Record<string, unknown>)[column] === value)
        return chain
      },
      gte(column: string, value: string) {
        matched = matched.filter(
          (item) => String((item as unknown as Record<string, string>)[column]) >= value
        )
        return chain
      },
      lte(column: string, value: string) {
        matched = matched.filter(
          (item) => String((item as unknown as Record<string, string>)[column]) <= value
        )
        return chain
      },
      in(column: string, values: readonly string[]) {
        matched = matched.filter((item) =>
          values.includes(String((item as unknown as Record<string, string>)[column]))
        )
        return chain
      },
      order() {
        return chain
      },
      limit() {
        return chain
      },
      select() {
        return chain
      },
      async maybeSingle() {
        const target = matched[0]
        if (!target) return { data: null, error: null }
        if (mode === "update" && patch) Object.assign(target, patch)
        return { data: target, error: null }
      },
      // 목록 조회는 빌더 자체를 await 한다(PostgREST 와 같은 thenable 규약).
      then(resolve: (value: { data: BookingRow[]; error: null }) => unknown) {
        return Promise.resolve(resolve({ data: matched, error: null }))
      },
    }
    return chain
  }

  return {
    updates,
    createSupabaseAdminClient: vi.fn(() => ({
      from: () => ({
        select: () => builder("select"),
        update: (patch: Record<string, unknown>) => {
          updates.push(patch)
          return builder("update", patch)
        },
      }),
    })),
  }
}

async function loadRepository(rows: BookingRow[]) {
  vi.resetModules()
  const supabase = makeSupabase(rows)
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  const mod = await import("@/lib/repositories/showroom-bookings")
  return { mod, updates: supabase.updates }
}

async function loadCalendarSource(rows: BookingRow[]) {
  vi.resetModules()
  const supabase = makeSupabase(rows)
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: supabase.createSupabaseAdminClient,
  }))
  const mod = await import("@/lib/showroom/calendar-source")
  return { mod }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("updateShowroomBookingStatus", () => {
  it("confirmed 로 올리면 confirmed_at 을 함께 채운다", async () => {
    const { mod, updates } = await loadRepository([row()])

    const updated = await mod.updateShowroomBookingStatus("booking-1", { status: "confirmed" })

    expect(updated?.status).toBe("confirmed")
    expect(updates).toHaveLength(1)
    expect(updates[0].status).toBe("confirmed")
    expect(typeof updates[0].confirmed_at).toBe("string")
    expect(Number.isNaN(Date.parse(String(updates[0].confirmed_at)))).toBe(false)
    expect(updated?.confirmedAt).toBe(updates[0].confirmed_at)
  })

  it("이미 confirmed 인 행을 다시 confirmed 로 올려도 시각이 흔들리지 않는다", async () => {
    const previous = "2026-08-20T01:02:03.000Z"
    const { mod, updates } = await loadRepository([
      row({ status: "confirmed", confirmed_at: previous }),
    ])

    await mod.updateShowroomBookingStatus("booking-1", { status: "confirmed" })

    expect(updates[0].confirmed_at).toBe(previous)
  })

  it("confirmed 가 아닌 전이는 confirmed_at 을 건드리지 않는다", async () => {
    const { mod, updates } = await loadRepository([row()])

    await mod.updateShowroomBookingStatus("booking-1", { status: "canceled" })

    expect(updates[0]).toEqual({ status: "canceled" })
    expect(updates[0]).not.toHaveProperty("confirmed_at")
  })

  it("담당자는 명시할 때만 쓴다 — 미지정이면 기존 값을 그대로 둔다", async () => {
    const { mod, updates } = await loadRepository([row({ assigned_to: "진소망" })])

    await mod.updateShowroomBookingStatus("booking-1", { status: "completed" })
    expect(updates[0]).not.toHaveProperty("assigned_to")

    await mod.updateShowroomBookingStatus("booking-1", {
      status: "completed",
      assignedTo: "김민재",
    })
    expect(updates[1].assigned_to).toBe("김민재")
  })

  it("없는 id 는 null 이다(호출부가 404 로 말한다)", async () => {
    const { mod, updates } = await loadRepository([row()])

    expect(await mod.updateShowroomBookingStatus("nope", { status: "confirmed" })).toBeNull()
    expect(updates).toHaveLength(0)
  })
})

describe("isShowroomBookingStatus", () => {
  it("스키마 CHECK 와 같은 목록만 통과시킨다", async () => {
    const { mod } = await loadRepository([])

    expect(mod.SHOWROOM_BOOKING_STATUSES).toEqual([
      "requested",
      "confirmed",
      "completed",
      "no_show",
      "canceled",
    ])
    for (const status of mod.SHOWROOM_BOOKING_STATUSES) {
      expect(mod.isShowroomBookingStatus(status)).toBe(true)
    }
  })

  it("미등록 상태값은 거부한다", async () => {
    const { mod } = await loadRepository([])

    // 그럴듯한 오타·다른 도메인의 상태값·비문자열을 조용히 삼키지 않는다.
    expect(mod.isShowroomBookingStatus("cancelled")).toBe(false)
    expect(mod.isShowroomBookingStatus("CONFIRMED")).toBe(false)
    expect(mod.isShowroomBookingStatus("pending")).toBe(false)
    expect(mod.isShowroomBookingStatus("")).toBe(false)
    expect(mod.isShowroomBookingStatus(null)).toBe(false)
    expect(mod.isShowroomBookingStatus(1)).toBe(false)
  })
})

describe("쇼룸 예약 요청 캘린더 어댑터", () => {
  it("canceled·no_show 는 캘린더에 넣지 않는다", async () => {
    const { mod } = await loadCalendarSource([
      row({ id: "keep-requested", status: "requested" }),
      row({ id: "keep-confirmed", status: "confirmed" }),
      row({ id: "keep-completed", status: "completed" }),
      row({ id: "drop-canceled", status: "canceled" }),
      row({ id: "drop-no-show", status: "no_show" }),
    ])

    const events = await mod.getShowroomBookingCalendarEvents({ year: 2026, month: 9 })

    expect(events.map((event) => event.id)).toEqual([
      "showroom_booking_keep-requested",
      "showroom_booking_keep-confirmed",
      "showroom_booking_keep-completed",
    ])
    expect(mod.mapShowroomBookingEvent).toBeTypeOf("function")
  })

  it("endTime 이 duration 만큼 뒤다", async () => {
    const { mod } = await loadCalendarSource([
      row({ id: "b60", visit_time: "10:00", duration_minutes: 60 }),
      row({ id: "b90", visit_time: "14:00", duration_minutes: 90 }),
      row({ id: "b45", visit_time: "16:15", duration_minutes: 45 }),
    ])

    const events = await mod.getShowroomBookingCalendarEvents({ year: 2026, month: 9 })
    const byId = new Map(events.map((event) => [event.id, event]))

    expect(byId.get("showroom_booking_b60")?.endTime).toBe("11:00")
    expect(byId.get("showroom_booking_b90")?.endTime).toBe("15:30")
    expect(byId.get("showroom_booking_b45")?.endTime).toBe("17:00")
    // 시작 시각은 KST 벽시계 그대로 — 어디서도 UTC 로 눕히지 않는다.
    expect(byId.get("showroom_booking_b90")?.time).toBe("14:00")
  })

  it("자정을 넘기는 duration 은 날짜를 밀지 않고 그날 끝으로 자른다", async () => {
    const { mod } = await loadCalendarSource([])

    expect(mod.addMinutesToClockTime("16:00", 480)).toBe("23:59")
    expect(mod.addMinutesToClockTime("23:30", 60)).toBe("23:59")
    expect(mod.addMinutesToClockTime("깨진값", 60)).toBeUndefined()
  })

  it("source 가 showroom_booking 이고 ICS 의 showroom 과 섞이지 않는다", async () => {
    const { mod } = await loadCalendarSource([row({ id: "abc", lead_id: "lead-9" })])

    const [event] = await mod.getShowroomBookingCalendarEvents({ year: 2026, month: 9 })

    expect(event).toMatchObject({
      source: "showroom_booking",
      sourceLabel: "쇼룸 예약 요청",
      type: "meeting",
      readonly: true,
      date: "2026-09-02",
      allDay: false,
      href: "/admin/crm/customers/leads?lead=lead-9",
    })
    // ICS 소스는 source "showroom" / sourceLabel "쇼룸 예약" 이다 — 둘은 다른 원천이다.
    expect(event.source).not.toBe("showroom")
    expect(event.sourceLabel).not.toBe("쇼룸 예약")
    // id 접두사도 갈라 둔다(ICS 는 `showroom_<uid>`).
    expect(event.id).toBe("showroom_booking_abc")
    // 제목은 학원명 + 방문 인원.
    expect(event.title).toBe("무궁화 학원 (2명)")
  })

  it("조회가 실패해도 이 소스만 비고 예외를 밖으로 던지지 않는다", async () => {
    vi.resetModules()
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: vi.fn(() => {
        throw new Error("no supabase")
      }),
    }))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const mod = await import("@/lib/showroom/calendar-source")
    await expect(mod.getShowroomBookingCalendarEvents({ year: 2026, month: 9 })).resolves.toEqual([])
  })
})

describe("캘린더 색축·범례", () => {
  it("showroom_booking 이 SOURCE_OPTIONS 에 등록되고 showroom 과 다른 항목이다", async () => {
    vi.resetModules()
    const { SOURCE_OPTIONS, getSourceColor } = await import(
      "@/components/admin/calendar/event-style"
    )

    const booking = SOURCE_OPTIONS.find((item) => item.value === "showroom_booking")
    const ics = SOURCE_OPTIONS.find((item) => item.value === "showroom")

    expect(booking).toBeDefined()
    expect(ics).toBeDefined()
    expect(booking?.label).toBe("쇼룸 예약 요청")
    expect(ics?.label).toBe("쇼룸 예약")
    expect(booking?.readonlyHelp).toBeTruthy()
    expect(getSourceColor("showroom_booking")).toBe(booking?.dot)
    expect(booking?.dot).not.toBe(ics?.dot)

    // 점만 찍히는 뷰에서 구분되어야 한다 — 소스 고정색은 서로 겹치지 않는다.
    const colors = SOURCE_OPTIONS.map((item) => item.dot)
    expect(new Set(colors).size).toBe(colors.length)
  })
})
