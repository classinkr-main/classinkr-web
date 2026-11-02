import { afterEach, describe, expect, it, vi } from "vitest"

import {
  addDays,
  getKstToday,
  MAX_DESIRED_DATE_ADVANCE_DAYS,
} from "@/components/checkout/request-date"
import {
  KOREA_PUBLIC_HOLIDAYS,
  KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH,
  koreaPublicHolidayDatesBetween,
} from "@/lib/korea-public-holidays"

/**
 * 법정 공휴일 고정 목록.
 *
 * 운영 방침이 "공휴일은 쉰다"라 구글 원천이 비어도 설·추석은 막혀야 한다. 목록이 틀리면
 * 연휴에 예약을 받거나 멀쩡한 평일을 닫는다 — 둘 다 조용히 일어나므로 수로 대조한다.
 */

type HolidayEventsFn = (month?: { year: number; month: number }) => Promise<Array<{ date: string }>>

const holidaySource = vi.hoisted(() => ({
  getKoreaHolidayEvents: vi.fn<HolidayEventsFn>(async () => []),
}))
vi.mock("@/lib/korea-holidays", () => holidaySource)

/**
 * 연도별 공휴일 수(일요일 포함, 일요일과 겹친 공휴일은 한 번만 센다).
 *   - 2026: 「2026년 월력요항」 70일 + 노동절·제헌절(대통령령 제36290호, 2026-05-11 시행)
 *   - 2027: 「2027년 월력요항」 72일
 * 한 해치를 더할 때 그 해 월력요항의 공휴일 수도 여기 더한다.
 */
const OFFICIAL_HOLIDAY_COUNT: Record<number, number> = {
  2026: 72,
  2027: 72,
}

function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

function sundaysIn(year: number): number {
  let count = 0
  for (let t = Date.UTC(year, 0, 1); t < Date.UTC(year + 1, 0, 1); t += 86_400_000) {
    if (new Date(t).getUTCDay() === 0) count += 1
  }
  return count
}

afterEach(() => {
  holidaySource.getKoreaHolidayEvents.mockReset()
  holidaySource.getKoreaHolidayEvents.mockResolvedValue([])
  vi.restoreAllMocks()
})

describe("법정 공휴일 고정 목록", () => {
  it("날짜가 실제 달력 날짜이고, 오름차순이며 겹치지 않는다", () => {
    const dates = KOREA_PUBLIC_HOLIDAYS.map((holiday) => holiday.date)
    for (const date of dates) {
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date).toBe(date)
    }
    expect(dates).toEqual([...new Set(dates)].sort())
  })

  it("연도별 공휴일 수가 월력요항과 맞다 — 빠뜨리거나 잘못 넣은 날을 잡는다", () => {
    const years = [...new Set(KOREA_PUBLIC_HOLIDAYS.map((holiday) => Number(holiday.date.slice(0, 4))))]
    // 대조값 없는 해가 목록에 들어오면 검증 없이 통과하게 된다.
    expect(years.sort()).toEqual(Object.keys(OFFICIAL_HOLIDAY_COUNT).map(Number).sort())

    for (const year of years) {
      const weekdayHolidays = KOREA_PUBLIC_HOLIDAYS.filter(
        (holiday) => holiday.date.startsWith(`${year}-`) && weekdayOf(holiday.date) !== 0
      ).length
      expect(sundaysIn(year) + weekdayHolidays, String(year)).toBe(OFFICIAL_HOLIDAY_COUNT[year])
    }
  })

  it("대체공휴일은 모두 평일이다", () => {
    const substitutes = KOREA_PUBLIC_HOLIDAYS.filter((holiday) => holiday.name.startsWith("대체공휴일"))
    expect(substitutes.length).toBeGreaterThan(0)
    for (const holiday of substitutes) {
      const weekday = weekdayOf(holiday.date)
      expect(weekday >= 1 && weekday <= 5, holiday.date).toBe(true)
    }
  })

  it("목록이 구매 희망일 창을 덮는다 — 실패하면 다음 해 월력요항(매년 6월 발표)을 더할 때다", () => {
    const windowEnd = addDays(getKstToday(), MAX_DESIRED_DATE_ADVANCE_DAYS)
    expect(
      KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH >= windowEnd,
      `고정 목록이 ${KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH}까지뿐인데 희망일 창은 ${windowEnd}까지다 — lib/korea-public-holidays.ts 에 한 해치를 더한다`
    ).toBe(true)
    expect(KOREA_PUBLIC_HOLIDAYS.at(-1)!.date <= KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH).toBe(true)
  })

  it("기간 필터는 양 끝을 포함한다", () => {
    expect(koreaPublicHolidayDatesBetween("2026-09-24", "2026-09-26")).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ])
    expect(koreaPublicHolidayDatesBetween("2026-09-27", "2026-10-02")).toEqual([])
  })
})

describe("loadKoreaHolidayDates — 고정 목록이 하한선", () => {
  it("구글 원천이 비어도 추석 연휴가 막힌다", async () => {
    const { loadKoreaHolidayDates } = await import("@/lib/korea-holiday-dates")

    const holidays = await loadKoreaHolidayDates("2026-09-22", "2026-10-31")

    for (const date of ["2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05", "2026-10-09"]) {
      expect(holidays.has(date), date).toBe(true)
    }
    // 범위 밖 공휴일은 담지 않는다.
    expect(holidays.has("2026-12-25")).toBe(false)
  })

  it("구글 원천이 주는 임시공휴일을 더한다", async () => {
    holidaySource.getKoreaHolidayEvents.mockImplementation(async (month) =>
      month?.month === 10 ? [{ date: "2026-10-02" }] : []
    )
    const { loadKoreaHolidayDates } = await import("@/lib/korea-holiday-dates")

    const holidays = await loadKoreaHolidayDates("2026-09-22", "2026-10-31")

    expect(holidays.has("2026-10-02")).toBe(true)
    expect(holidays.has("2026-09-25")).toBe(true)
  })

  it("구글 원천이 던져도 고정 목록은 남는다", async () => {
    holidaySource.getKoreaHolidayEvents.mockRejectedValue(new Error("calendar down"))
    const { loadKoreaHolidayDates } = await import("@/lib/korea-holiday-dates")

    const holidays = await loadKoreaHolidayDates("2027-02-01", "2027-02-28")

    expect([...holidays].sort()).toEqual(["2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09"])
  })

  it("목록이 끝난 뒤를 물으면 인스턴스당 한 번만 경고한다", async () => {
    vi.resetModules()
    const { loadKoreaHolidayDates } = await import("@/lib/korea-holiday-dates")
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await loadKoreaHolidayDates("2027-12-01", "2028-01-31")
    await loadKoreaHolidayDates("2027-12-01", "2028-01-31")

    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(String(consoleWarn.mock.calls[0][0])).toContain(KOREA_PUBLIC_HOLIDAYS_COVERED_THROUGH)
  })

  it("목록 안의 범위에는 경고하지 않는다", async () => {
    vi.resetModules()
    const { loadKoreaHolidayDates } = await import("@/lib/korea-holiday-dates")
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await loadKoreaHolidayDates("2026-09-22", "2027-03-21")

    expect(consoleWarn).not.toHaveBeenCalled()
  })
})
