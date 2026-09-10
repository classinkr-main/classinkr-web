import { describe, expect, it } from "vitest"

import {
  SHOWROOM_MAX_ADVANCE_DAYS,
  SHOWROOM_SLOT_TIMES,
  addBusinessDays,
  addIsoDays,
  buildShowroomAvailability,
  compareIsoDate,
  countBusyOverlaps,
  getShowroomBookingRange,
  isBusinessDay,
  isShowroomSlotOpen,
  isShowroomSlotTime,
  isValidIsoDate,
  isWeekendIso,
  timeToMinutes,
  toDisabledIsoDates,
  type ShowroomBusyInterval,
} from "@/lib/showroom/slots"

/**
 * 기준일: 2026-08-31 은 월요일이다. 요일 계산이 틀리면 아래 기대값이 통째로 흔들리므로
 * 먼저 그 사실 자체를 고정한다.
 */
const MONDAY = "2026-08-31"

describe("날짜 원시 함수", () => {
  it("기준일이 월요일이라는 전제를 고정한다", () => {
    expect(isWeekendIso(MONDAY)).toBe(false)
    expect(isWeekendIso("2026-09-05")).toBe(true) // 토
    expect(isWeekendIso("2026-09-06")).toBe(true) // 일
    expect(isWeekendIso("2026-09-07")).toBe(false) // 월
  })

  it("월·연 경계를 넘어 날짜를 더한다", () => {
    expect(addIsoDays("2026-08-31", 1)).toBe("2026-09-01")
    expect(addIsoDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addIsoDays("2026-03-01", -1)).toBe("2026-02-28")
    // 2028 은 윤년이다.
    expect(addIsoDays("2028-03-01", -1)).toBe("2028-02-29")
  })

  it("실존하지 않는 날짜를 거른다", () => {
    expect(isValidIsoDate("2026-02-28")).toBe(true)
    expect(isValidIsoDate("2026-02-30")).toBe(false)
    expect(isValidIsoDate("2026-13-01")).toBe(false)
    expect(isValidIsoDate("2026-00-10")).toBe(false)
    expect(isValidIsoDate("20260210")).toBe(false)
    expect(isValidIsoDate("")).toBe(false)
  })

  it("시각을 분으로 바꾸고 잘못된 형식은 null 이다", () => {
    expect(timeToMinutes("10:00")).toBe(600)
    expect(timeToMinutes("00:00")).toBe(0)
    expect(timeToMinutes("23:59")).toBe(1439)
    expect(timeToMinutes("24:00")).toBeNull()
    expect(timeToMinutes("9:00")).toBeNull()
    expect(timeToMinutes("10:60")).toBeNull()
  })

  it("날짜를 사전순이 아니라 시간순으로 비교한다", () => {
    expect(compareIsoDate("2026-08-31", "2026-09-01")).toBeLessThan(0)
    expect(compareIsoDate("2026-09-01", "2026-08-31")).toBeGreaterThan(0)
    expect(compareIsoDate("2026-09-01", "2026-09-01")).toBe(0)
  })
})

describe("영업일", () => {
  const noHolidays = new Set<string>()

  it("주말과 공휴일을 영업일에서 뺀다", () => {
    expect(isBusinessDay("2026-09-07", noHolidays)).toBe(true)
    expect(isBusinessDay("2026-09-05", noHolidays)).toBe(false)
    expect(isBusinessDay("2026-09-07", new Set(["2026-09-07"]))).toBe(false)
  })

  it("오늘을 세지 않고 N 영업일 뒤를 찾는다", () => {
    // 월요일 + 2영업일 = 수요일
    expect(addBusinessDays(MONDAY, 2, noHolidays)).toBe("2026-09-02")
  })

  it("주말을 건너뛴다", () => {
    // 목요일(2026-09-03) + 2영업일 = 월요일(2026-09-07)
    expect(addBusinessDays("2026-09-03", 2, noHolidays)).toBe("2026-09-07")
  })

  it("공휴일을 건너뛴다", () => {
    // 월요일 + 2영업일인데 화요일이 공휴일이면 목요일이 된다.
    expect(addBusinessDays(MONDAY, 2, new Set(["2026-09-01"]))).toBe("2026-09-03")
  })

  it("0 영업일이면 오늘 그대로다", () => {
    expect(addBusinessDays(MONDAY, 0, noHolidays)).toBe(MONDAY)
  })
})

describe("예약 창", () => {
  it("최소는 영업일, 최대는 달력일 기준이다", () => {
    const range = getShowroomBookingRange(MONDAY)
    expect(range.minIso).toBe("2026-09-02")
    expect(range.maxIso).toBe(addIsoDays(MONDAY, SHOWROOM_MAX_ADVANCE_DAYS))
  })
})

describe("슬롯 점유 판정", () => {
  it("시작 시각이 정확히 같은 일정을 잡는다", () => {
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-02", startTime: "10:00", endTime: "11:00" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(1)
    expect(countBusyOverlaps("2026-09-02", "11:00", busy)).toBe(0)
  })

  it("격자에 안 맞는 일정도 겹치면 잡는다", () => {
    // ICS 일정은 우리 슬롯 격자에 맞춰 들어오지 않는다.
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-02", startTime: "10:30", endTime: "11:30" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(1)
    expect(countBusyOverlaps("2026-09-02", "11:00", busy)).toBe(1)
    expect(countBusyOverlaps("2026-09-02", "14:00", busy)).toBe(0)
  })

  it("경계가 닿기만 하는 것은 겹침이 아니다", () => {
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-02", startTime: "09:00", endTime: "10:00" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(0)
  })

  it("종일 일정은 그날 전체를 막는다", () => {
    const busy: ShowroomBusyInterval[] = [{ date: "2026-09-02", allDay: true }]
    for (const time of SHOWROOM_SLOT_TIMES) {
      expect(countBusyOverlaps("2026-09-02", time, busy)).toBe(1)
    }
  })

  it("시각을 못 읽는 일정은 안전하게 그날 전체를 막는다", () => {
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-02", startTime: "이상한값", endTime: "11:00" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(1)
    expect(countBusyOverlaps("2026-09-02", "16:00", busy)).toBe(1)
  })

  it("종료가 시작보다 이르면 그날 전체를 막는다", () => {
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-02", startTime: "23:00", endTime: "01:00" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(1)
  })

  it("다른 날짜 일정은 세지 않는다", () => {
    const busy: ShowroomBusyInterval[] = [
      { date: "2026-09-03", startTime: "10:00", endTime: "11:00" },
    ]
    expect(countBusyOverlaps("2026-09-02", "10:00", busy)).toBe(0)
  })
})

describe("가용성 조립", () => {
  const base = { todayIso: MONDAY }

  it("주말은 닫고 이유를 남긴다", () => {
    const [saturday] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-05",
      toIso: "2026-09-05",
    })
    expect(saturday.bookable).toBe(false)
    expect(saturday.blockedReason).toBe("weekend")
    expect(saturday.slots).toEqual([])
  })

  it("공휴일은 닫고 이유를 남긴다", () => {
    const [day] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-02",
      toIso: "2026-09-02",
      holidayDates: new Set(["2026-09-02"]),
    })
    expect(day.blockedReason).toBe("holiday")
  })

  it("리드타임 이전은 too_soon 이다", () => {
    const [tomorrow] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-01",
      toIso: "2026-09-01",
    })
    expect(tomorrow.bookable).toBe(false)
    expect(tomorrow.blockedReason).toBe("too_soon")
  })

  it("예약 창 이후 평일은 too_far 다", () => {
    // 오프셋을 하드코딩하면 그 날이 우연히 주말일 때 주말 사유가 먼저 잡힌다.
    // 창 밖의 첫 평일을 찾아서 확인한다.
    let beyond = addIsoDays(MONDAY, SHOWROOM_MAX_ADVANCE_DAYS + 1)
    while (isWeekendIso(beyond)) beyond = addIsoDays(beyond, 1)

    const [day] = buildShowroomAvailability({ ...base, fromIso: beyond, toIso: beyond })
    expect(day.bookable).toBe(false)
    expect(day.blockedReason).toBe("too_far")
  })

  it("사유는 주말 → 공휴일 → 리드타임 순으로 고른다", () => {
    // 한 날짜가 여러 이유로 닫힐 수 있다. 사용자에게 보여줄 이유는 하나뿐이라
    // 우선순위를 고정해 둔다 — 주말이면 리드타임을 따질 것도 없다.
    const [saturdayBeforeLeadTime] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-05",
      toIso: "2026-09-05",
      holidayDates: new Set(["2026-09-05"]),
    })
    expect(saturdayBeforeLeadTime.blockedReason).toBe("weekend")

    // 평일 공휴일이면서 리드타임 이전인 날은 공휴일이 먼저다.
    const [holidayBeforeLeadTime] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-01",
      toIso: "2026-09-01",
      holidayDates: new Set(["2026-09-01"]),
    })
    expect(holidayBeforeLeadTime.blockedReason).toBe("holiday")
  })

  it("열린 날은 슬롯 전체를 open 으로 준다", () => {
    const [day] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-02",
      toIso: "2026-09-02",
    })
    expect(day.bookable).toBe(true)
    expect(day.slots).toHaveLength(SHOWROOM_SLOT_TIMES.length)
    expect(day.slots.every((slot) => slot.state === "open")).toBe(true)
  })

  it("모든 슬롯이 차면 full 로 닫는다", () => {
    const busy: ShowroomBusyInterval[] = SHOWROOM_SLOT_TIMES.map((time) => ({
      date: "2026-09-02",
      startTime: time,
      endTime: "23:00",
    }))
    const [day] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-02",
      toIso: "2026-09-02",
      busy,
    })
    expect(day.bookable).toBe(false)
    expect(day.blockedReason).toBe("full")
    expect(day.slots.every((slot) => slot.state === "booked")).toBe(true)
  })

  it("일부만 차면 그 슬롯만 booked 다", () => {
    const [day] = buildShowroomAvailability({
      ...base,
      fromIso: "2026-09-02",
      toIso: "2026-09-02",
      busy: [{ date: "2026-09-02", startTime: "10:00", endTime: "11:00" }],
    })
    expect(day.bookable).toBe(true)
    expect(day.slots.find((slot) => slot.time === "10:00")?.state).toBe("booked")
    expect(day.slots.find((slot) => slot.time === "11:00")?.state).toBe("open")
  })

  it("잘못된 조회 범위는 빈 배열이다", () => {
    expect(buildShowroomAvailability({ ...base, fromIso: "2026-09-05", toIso: "2026-09-02" })).toEqual([])
    expect(buildShowroomAvailability({ ...base, fromIso: "엉터리", toIso: "2026-09-02" })).toEqual([])
  })

  it("조회 범위가 지나치게 넓어도 응답이 무한정 커지지 않는다", () => {
    const days = buildShowroomAvailability({
      ...base,
      fromIso: MONDAY,
      toIso: addIsoDays(MONDAY, 5000),
    })
    expect(days.length).toBeLessThanOrEqual(400)
  })
})

describe("서버 최종 확인", () => {
  const availability = buildShowroomAvailability({
    todayIso: MONDAY,
    fromIso: "2026-09-02",
    toIso: "2026-09-07",
    busy: [{ date: "2026-09-02", startTime: "10:00", endTime: "11:00" }],
  })

  it("열린 슬롯만 통과시킨다", () => {
    expect(isShowroomSlotOpen("2026-09-02", "11:00", availability)).toBe(true)
    expect(isShowroomSlotOpen("2026-09-02", "10:00", availability)).toBe(false)
  })

  it("닫힌 날짜와 미등록 시각을 막는다", () => {
    expect(isShowroomSlotOpen("2026-09-05", "10:00", availability)).toBe(false)
    expect(isShowroomSlotOpen("2026-09-02", "13:00", availability)).toBe(false)
    expect(isShowroomSlotOpen("2026-12-25", "10:00", availability)).toBe(false)
  })

  it("등록된 슬롯 시각만 인정한다", () => {
    expect(isShowroomSlotTime("10:00")).toBe(true)
    expect(isShowroomSlotTime("12:00")).toBe(false)
    expect(isShowroomSlotTime(600)).toBe(false)
    expect(isShowroomSlotTime(null)).toBe(false)
  })
})

describe("캘린더 비활성 날짜", () => {
  it("예약 못 받는 날만 모은다", () => {
    const availability = buildShowroomAvailability({
      todayIso: MONDAY,
      fromIso: "2026-09-02",
      toIso: "2026-09-07",
    })
    const disabled = toDisabledIsoDates(availability)

    expect(disabled.has("2026-09-05")).toBe(true) // 토
    expect(disabled.has("2026-09-06")).toBe(true) // 일
    expect(disabled.has("2026-09-02")).toBe(false) // 수 — 열림
  })
})
