import { describe, expect, it } from "vitest"

import {
  MAX_DESIRED_DATE_ADVANCE_DAYS,
  addDays,
  buildMonthGrid,
  clampToRange,
  compareIsoDate,
  type DesiredDateRange,
  formatDesiredDateLabel,
  formatMonthLabel,
  getKstToday,
  getMaxDesiredDate,
  getMinDesiredDate,
  getWeekday,
  getYearMonth,
  isDesiredDateSelectable,
  isSameMonth,
  isValidIsoDate,
  parseIsoDate,
  shiftMonth,
  toIsoDate,
} from "@/components/checkout/request-date"

describe("parseIsoDate / isValidIsoDate", () => {
  it("정상 날짜를 분해한다", () => {
    expect(parseIsoDate("2026-07-27")).toEqual({ year: 2026, month: 7, day: 27 })
  })

  it("형식이 틀리면 null", () => {
    expect(parseIsoDate("2026-7-27")).toBeNull()
    expect(parseIsoDate("20260727")).toBeNull()
    expect(parseIsoDate("")).toBeNull()
    expect(parseIsoDate("2026-07-27T10:00")).toBeNull()
  })

  it("존재하지 않는 날짜는 롤오버 없이 null", () => {
    expect(parseIsoDate("2026-02-30")).toBeNull()
    expect(parseIsoDate("2026-13-01")).toBeNull()
    expect(parseIsoDate("2026-04-31")).toBeNull()
    expect(isValidIsoDate("2024-02-29")).toBe(true) // 윤년
    expect(isValidIsoDate("2026-02-29")).toBe(false)
  })
})

describe("addDays", () => {
  it("월·연 경계를 넘는다", () => {
    expect(addDays("2026-07-27", 5)).toBe("2026-08-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
  })

  it("윤년 2월을 정확히 넘는다", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29")
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01")
  })

  it("파싱 불가한 값은 원문 유지", () => {
    expect(addDays("bogus", 3)).toBe("bogus")
  })
})

describe("getWeekday", () => {
  it("0=일 … 6=토", () => {
    expect(getWeekday("2026-07-26")).toBe(0) // 일
    expect(getWeekday("2026-07-27")).toBe(1) // 월
    expect(getWeekday("2026-08-01")).toBe(6) // 토
    expect(getWeekday("bogus")).toBe(-1)
  })
})

describe("getKstToday", () => {
  it("UTC 자정 직후에도 KST 로는 이미 다음 날이다", () => {
    // 2026-07-27T15:30Z = KST 2026-07-28 00:30
    expect(getKstToday(new Date("2026-07-27T15:30:00Z"))).toBe("2026-07-28")
    // 2026-07-27T00:30Z = KST 2026-07-27 09:30
    expect(getKstToday(new Date("2026-07-27T00:30:00Z"))).toBe("2026-07-27")
  })
})

describe("선택 가능 범위", () => {
  const todayIso = "2026-07-27"
  const range = {
    minIso: getMinDesiredDate(todayIso),
    maxIso: getMaxDesiredDate(todayIso),
  }

  it("최소는 내일이다 — 오늘과 과거는 비활성", () => {
    expect(range.minIso).toBe("2026-07-28")
    expect(isDesiredDateSelectable("2026-07-27", range)).toBe(false)
    expect(isDesiredDateSelectable("2026-07-26", range)).toBe(false)
    expect(isDesiredDateSelectable("2026-07-28", range)).toBe(true)
  })

  it("최대는 오늘 + 180일이며 그 다음날은 비활성", () => {
    expect(range.maxIso).toBe(addDays(todayIso, MAX_DESIRED_DATE_ADVANCE_DAYS))
    expect(isDesiredDateSelectable(range.maxIso, range)).toBe(true)
    expect(isDesiredDateSelectable(addDays(range.maxIso, 1), range)).toBe(false)
  })

  it("형식이 깨진 값은 선택 불가", () => {
    expect(isDesiredDateSelectable("2026-02-30", range)).toBe(false)
    expect(isDesiredDateSelectable("", range)).toBe(false)
  })

  it("clampToRange 는 범위 밖 이동을 경계로 당긴다", () => {
    expect(clampToRange("2026-01-01", range)).toBe(range.minIso)
    expect(clampToRange("2030-01-01", range)).toBe(range.maxIso)
    expect(clampToRange("2026-08-15", range)).toBe("2026-08-15")
    expect(clampToRange("nope", range)).toBe(range.minIso)
  })
})

/**
 * disabledIsoDates — 쇼룸 예약(/showroom)이 주말·공휴일·마감된 날짜를 개별로 막는 데 쓸
 * 선택적 필드. /checkout 은 이 필드를 넘기지 않으므로 위 "선택 가능 범위" 블록의 모든
 * 테스트가 그대로 하위 호환 증거이기도 하다 — 여기서는 새 필드 자체의 동작만 고정한다.
 */
describe("disabledIsoDates — 개별 날짜 차단(쇼룸 예약용)", () => {
  const todayIso = "2026-07-27"
  const baseRange: DesiredDateRange = {
    minIso: getMinDesiredDate(todayIso), // 2026-07-28
    maxIso: getMaxDesiredDate(todayIso),
  }

  it("안 넘기면(undefined) 기존과 완전히 동일하게 동작한다 — 하위 호환", () => {
    expect(isDesiredDateSelectable("2026-07-28", baseRange)).toBe(true)
    expect(isDesiredDateSelectable("2026-07-27", baseRange)).toBe(false) // 오늘은 여전히 최소 미만
    expect(isDesiredDateSelectable(baseRange.maxIso, baseRange)).toBe(true)
  })

  it("빈 Set 을 넘겨도 기존과 동일하다", () => {
    const range: DesiredDateRange = { ...baseRange, disabledIsoDates: new Set() }
    expect(isDesiredDateSelectable("2026-07-28", range)).toBe(true)
    expect(isDesiredDateSelectable("2026-08-01", range)).toBe(true)
  })

  it("집합에 든 날짜는 범위 안이어도 선택 불가로 판정된다", () => {
    const range: DesiredDateRange = {
      ...baseRange,
      disabledIsoDates: new Set(["2026-08-01", "2026-08-02"]), // 예: 주말이라 가정
    }
    expect(isDesiredDateSelectable("2026-08-01", range)).toBe(false)
    expect(isDesiredDateSelectable("2026-08-02", range)).toBe(false)
    // 집합에 없는 날짜는 여전히 선택 가능 — 다른 날짜에 영향이 새지 않는다.
    expect(isDesiredDateSelectable("2026-07-31", range)).toBe(true)
    expect(isDesiredDateSelectable("2026-08-03", range)).toBe(true)
  })

  it("min/max 범위 밖 판정은 disabledIsoDates 유무와 무관하게 그대로다", () => {
    const range: DesiredDateRange = {
      ...baseRange,
      disabledIsoDates: new Set(["2026-08-01"]),
    }
    expect(isDesiredDateSelectable(todayIso, range)).toBe(false)
    expect(isDesiredDateSelectable(addDays(baseRange.maxIso, 1), range)).toBe(false)
    // 범위 안 + 집합에 없는 날짜는 여전히 선택 가능.
    expect(isDesiredDateSelectable(baseRange.minIso, range)).toBe(true)
  })

  it("선택 불가 날짜와 범위 밖이 겹쳐도 결과는 같다(둘 다 false)", () => {
    const outOfRange = addDays(baseRange.maxIso, 5)
    const range: DesiredDateRange = {
      ...baseRange,
      // 범위 밖 날짜와 오늘(최소 미만)을 disabledIsoDates 에도 중복으로 넣어본다.
      disabledIsoDates: new Set([outOfRange, todayIso]),
    }
    expect(isDesiredDateSelectable(outOfRange, range)).toBe(false)
    expect(isDesiredDateSelectable(todayIso, range)).toBe(false)
  })

  it("형식이 깨진 값은 disabledIsoDates 와 무관하게 여전히 선택 불가다", () => {
    const range: DesiredDateRange = {
      ...baseRange,
      disabledIsoDates: new Set(["2026-02-30"]),
    }
    expect(isDesiredDateSelectable("2026-02-30", range)).toBe(false)
    expect(isDesiredDateSelectable("", range)).toBe(false)
  })
})

/**
 * 서버 신청 계약(lib/checkout-requests.ts)과 같은 진실을 여기서 고정한다.
 * - 하한: KST 기준 "내일"부터 — 프론트·서버 동일.
 * - 상한: 서버는 오늘 + 365일. 프론트 캘린더는 항상 그 안쪽이어야 한다
 *   (프론트 범위 ⊂ 서버 범위여야 캘린더에서 고른 날짜가 400 을 맞지 않는다).
 */
const SERVER_MAX_DESIRED_DATE_ADVANCE_DAYS = 365

describe("서버 신청 계약과의 정합", () => {
  const todayIso = "2026-07-27"

  it("프론트 최소 선택일 = 서버 최소 접수일(내일)", () => {
    expect(getMinDesiredDate(todayIso)).toBe(addDays(todayIso, 1))
    expect(isDesiredDateSelectable(todayIso, {
      minIso: getMinDesiredDate(todayIso),
      maxIso: getMaxDesiredDate(todayIso),
    })).toBe(false)
  })

  it("프론트 최대 선택일이 서버 상한(오늘+365) 안쪽이다", () => {
    expect(MAX_DESIRED_DATE_ADVANCE_DAYS).toBeGreaterThan(0)
    expect(MAX_DESIRED_DATE_ADVANCE_DAYS).toBeLessThanOrEqual(
      SERVER_MAX_DESIRED_DATE_ADVANCE_DAYS
    )
    expect(getMaxDesiredDate(todayIso) <= addDays(todayIso, SERVER_MAX_DESIRED_DATE_ADVANCE_DAYS)).toBe(
      true
    )
  })
})

describe("compareIsoDate", () => {
  it("사전순 = 시간순", () => {
    expect(compareIsoDate("2026-07-27", "2026-07-28")).toBe(-1)
    expect(compareIsoDate("2026-07-28", "2026-07-27")).toBe(1)
    expect(compareIsoDate("2026-07-27", "2026-07-27")).toBe(0)
    expect(compareIsoDate("2026-09-01", "2026-10-01")).toBe(-1)
  })
})

describe("shiftMonth / getYearMonth / isSameMonth", () => {
  it("연 경계를 양방향으로 넘는다", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 7 }, 12)).toEqual({ year: 2027, month: 7 })
    expect(shiftMonth({ year: 2026, month: 3 }, -5)).toEqual({ year: 2025, month: 10 })
  })

  it("iso 에서 연·월을 뽑고 동일 월을 판정한다", () => {
    expect(getYearMonth("2026-07-27")).toEqual({ year: 2026, month: 7 })
    expect(isSameMonth("2026-07-01", { year: 2026, month: 7 })).toBe(true)
    expect(isSameMonth("2026-08-01", { year: 2026, month: 7 })).toBe(false)
    expect(isSameMonth("bogus", { year: 2026, month: 7 })).toBe(false)
  })
})

describe("buildMonthGrid", () => {
  it("항상 6주 × 7열 = 42칸이라 달마다 높이가 튀지 않는다", () => {
    for (const month of [1, 2, 5, 8, 12]) {
      const grid = buildMonthGrid({ year: 2026, month })
      expect(grid).toHaveLength(6)
      for (const week of grid) expect(week).toHaveLength(7)
    }
  })

  it("항상 일요일에서 시작한다", () => {
    const grid = buildMonthGrid({ year: 2026, month: 7 })
    expect(grid[0][0].weekday).toBe(0)
    expect(getWeekday(grid[0][0].iso)).toBe(0)
  })

  it("2026-07 은 수요일 시작 — 앞 3칸이 6월 셀이다", () => {
    const grid = buildMonthGrid({ year: 2026, month: 7 })
    const flat = grid.flat()
    expect(flat[0].iso).toBe("2026-06-28")
    expect(flat.slice(0, 3).every((cell) => !cell.inMonth)).toBe(true)
    expect(flat[3].iso).toBe("2026-07-01")
    expect(flat[3].inMonth).toBe(true)
    expect(flat[3].day).toBe(1)
  })

  it("해당 월 셀 수가 그 달의 일수와 같다", () => {
    expect(buildMonthGrid({ year: 2026, month: 7 }).flat().filter((c) => c.inMonth)).toHaveLength(31)
    expect(buildMonthGrid({ year: 2026, month: 2 }).flat().filter((c) => c.inMonth)).toHaveLength(28)
    expect(buildMonthGrid({ year: 2024, month: 2 }).flat().filter((c) => c.inMonth)).toHaveLength(29)
  })

  it("셀이 하루 간격으로 연속한다", () => {
    const flat = buildMonthGrid({ year: 2026, month: 12 }).flat()
    for (let i = 1; i < flat.length; i += 1) {
      expect(flat[i].iso).toBe(addDays(flat[i - 1].iso, 1))
    }
  })
})

describe("표기 포맷", () => {
  it("월 라벨", () => {
    expect(formatMonthLabel({ year: 2026, month: 7 })).toBe("2026년 7월")
    expect(formatMonthLabel({ year: 2027, month: 12 })).toBe("2027년 12월")
  })

  it("선택 날짜 라벨에 요일이 붙는다", () => {
    expect(formatDesiredDateLabel("2026-07-27")).toBe("2026년 7월 27일 (월)")
    expect(formatDesiredDateLabel("2026-08-01")).toBe("2026년 8월 1일 (토)")
    expect(formatDesiredDateLabel("bogus")).toBe("bogus")
  })

  it("toIsoDate 는 0 패딩한다", () => {
    expect(toIsoDate(2026, 7, 1)).toBe("2026-07-01")
    expect(toIsoDate(2026, 12, 31)).toBe("2026-12-31")
  })
})
