import { describe, expect, it } from "vitest"

import {
  addDays,
  addMonths,
  daysBetween,
  endOfMonth,
  enumerateDates,
  enumerateMonths,
  formatRangeLabel,
  getViewRange,
  getWeekday,
  isDateString,
  overlapsRange,
  startOfWeek,
  stepAnchor,
} from "@/lib/admin-calendar/range"
import {
  assignLanes,
  countLanes,
  groupByAssignee,
  layoutLanes,
} from "@/lib/admin-calendar/layout"

describe("날짜 산술", () => {
  it("일 단위 이동이 월·연 경계를 넘는다", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01")
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("윤년을 정확히 다룬다", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29")
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28")
  })

  it("개월 이동은 말일을 넘기지 않는다", () => {
    // 1/31 + 1개월이 3/3 으로 흘러가면 달 이동 버튼이 2월을 통째로 건너뛴다.
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28")
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15")
  })

  it("KST 기준 날짜가 UTC 변환으로 밀리지 않는다", () => {
    // Date 를 로컬 타임존으로 다루면 KST(UTC+9)에서 toISOString() 이 전날을 뱉는다.
    expect(addDays("2026-08-05", 0)).toBe("2026-08-05")
    expect(enumerateDates("2026-08-05", "2026-08-05")).toEqual(["2026-08-05"])
  })

  it("주는 월요일에 시작한다", () => {
    // 2026-08-05 는 수요일.
    expect(getWeekday("2026-08-05")).toBe(3)
    expect(startOfWeek("2026-08-05")).toBe("2026-08-03")
    // 일요일은 지난 월요일에 붙는다(그 주의 마지막 날).
    expect(startOfWeek("2026-08-09")).toBe("2026-08-03")
    expect(startOfWeek("2026-08-10")).toBe("2026-08-10")
  })

  it("존재하지 않는 날짜를 거른다", () => {
    expect(isDateString("2026-08-05")).toBe(true)
    expect(isDateString("2026-02-30")).toBe(false)
    expect(isDateString("2026-13-01")).toBe(false)
    expect(isDateString("20260805")).toBe(false)
    expect(isDateString(null)).toBe(false)
  })

  it("범위를 펼치고 길이를 잰다", () => {
    expect(enumerateDates("2026-08-03", "2026-08-09")).toHaveLength(7)
    expect(daysBetween("2026-08-03", "2026-08-09")).toBe(6)
    // 역전된 범위는 예외 대신 빈 배열 — 화면이 깨지지 않게.
    expect(enumerateDates("2026-08-09", "2026-08-03")).toEqual([])
  })
})

describe("뷰별 기간", () => {
  const anchor = "2026-08-05" // 수요일

  it("월/목록은 달 경계에 맞춘다", () => {
    expect(getViewRange("month", anchor)).toEqual({ from: "2026-08-01", to: "2026-08-31" })
    expect(getViewRange("agenda", anchor)).toEqual({ from: "2026-08-01", to: "2026-08-31" })
  })

  it("주는 월~일 7일이다", () => {
    expect(getViewRange("week", anchor)).toEqual({ from: "2026-08-03", to: "2026-08-09" })
  })

  it("담당자는 월요일부터 14일이다", () => {
    const range = getViewRange("assignee", anchor)
    expect(range).toEqual({ from: "2026-08-03", to: "2026-08-16" })
    expect(enumerateDates(range.from, range.to)).toHaveLength(14)
  })

  it("타임라인은 월요일부터 8주다", () => {
    const range = getViewRange("timeline", anchor)
    expect(range.from).toBe("2026-08-03")
    expect(enumerateDates(range.from, range.to)).toHaveLength(56)
  })

  it("이동 폭이 뷰가 담는 기간과 맞아 빈틈이 안 생긴다", () => {
    // 주: 다음 주로 넘기면 이전 주 끝 다음날부터 시작해야 한다.
    const week = getViewRange("week", anchor)
    const nextWeek = getViewRange("week", stepAnchor("week", anchor, 1))
    expect(nextWeek.from).toBe(addDays(week.to, 1))

    // 담당자: 2주씩 이동.
    const assignee = getViewRange("assignee", anchor)
    const nextAssignee = getViewRange("assignee", stepAnchor("assignee", anchor, 1))
    expect(nextAssignee.from).toBe(addDays(assignee.to, 1))

    // 월: 다음 달 1일로.
    expect(getViewRange("month", stepAnchor("month", anchor, 1)).from).toBe("2026-09-01")
    expect(getViewRange("month", stepAnchor("month", anchor, -1)).from).toBe("2026-07-01")
  })

  it("타임라인은 절반씩 겹치게 이동한다", () => {
    // 8주를 담되 4주씩 움직여 앞뒤 맥락이 이어진다.
    const next = stepAnchor("timeline", anchor, 1)
    expect(daysBetween(anchor, next)).toBe(28)
  })

  it("월 이동을 반복해도 되돌아온다", () => {
    let cursor = "2026-08-05"
    for (let i = 0; i < 12; i += 1) cursor = stepAnchor("month", cursor, 1)
    expect(cursor).toBe("2027-08-01")
  })

  it("기간 라벨을 사람이 읽는 형태로 만든다", () => {
    expect(formatRangeLabel("month", anchor)).toBe("2026년 8월")
    expect(formatRangeLabel("week", anchor)).toContain("2026년 8월 3일")
    // 연말을 걸치면 끝 날짜에도 연도가 붙는다.
    expect(formatRangeLabel("timeline", "2026-12-15")).toMatch(/2027년/)
  })

  it("범위가 걸치는 달을 모두 센다", () => {
    expect(enumerateMonths({ from: "2026-08-03", to: "2026-09-27" })).toEqual([
      { year: 2026, month: 8 },
      { year: 2026, month: 9 },
    ])
    // 8주 타임라인은 최대 3개월에 걸친다.
    expect(enumerateMonths(getViewRange("timeline", "2026-08-31"))).toHaveLength(3)
    expect(enumerateMonths({ from: "2026-12-28", to: "2027-01-03" })).toEqual([
      { year: 2026, month: 12 },
      { year: 2027, month: 1 },
    ])
  })

  it("멀티데이 일정이 기간 밖에서 시작해도 겹침으로 잡힌다", () => {
    const range = getViewRange("week", anchor) // 8/3 ~ 8/9
    expect(overlapsRange({ date: "2026-07-28", endDate: "2026-08-04" }, range)).toBe(true)
    expect(overlapsRange({ date: "2026-08-09" }, range)).toBe(true)
    expect(overlapsRange({ date: "2026-08-10" }, range)).toBe(false)
    expect(overlapsRange({ date: "2026-07-28", endDate: "2026-08-02" }, range)).toBe(false)
  })
})

describe("막대 배치", () => {
  const range = { from: "2026-08-03", to: "2026-08-16" }

  it("겹치지 않는 일정은 같은 줄을 공유한다", () => {
    const spans = assignLanes(
      [
        { id: "a", date: "2026-08-03", endDate: "2026-08-05" },
        { id: "b", date: "2026-08-07", endDate: "2026-08-08" },
      ],
      range
    )
    expect(spans.map((s) => s.lane)).toEqual([0, 0])
    expect(countLanes(spans)).toBe(1)
  })

  it("겹치는 일정은 아래 줄로 밀린다", () => {
    const spans = assignLanes(
      [
        { id: "a", date: "2026-08-03", endDate: "2026-08-10" },
        { id: "b", date: "2026-08-05", endDate: "2026-08-06" },
        { id: "c", date: "2026-08-05", endDate: "2026-08-07" },
      ],
      range
    )
    expect(countLanes(spans)).toBe(3)
    expect(new Set(spans.map((s) => s.lane)).size).toBe(3)
  })

  it("맞닿기만 한 일정은 겹침이 아니다", () => {
    // 8/5 종료와 8/6 시작은 같은 줄에 나란히 놓여도 된다.
    const spans = assignLanes(
      [
        { id: "a", date: "2026-08-03", endDate: "2026-08-05" },
        { id: "b", date: "2026-08-06", endDate: "2026-08-08" },
      ],
      range
    )
    expect(countLanes(spans)).toBe(1)
  })

  it("기간 밖으로 삐져나온 일정을 잘라내고 잘림을 표시한다", () => {
    const [span] = assignLanes([{ id: "a", date: "2026-07-30", endDate: "2026-08-20" }], range)
    expect(span.startIndex).toBe(0)
    expect(span.endIndex).toBe(13)
    expect(span.clippedStart).toBe(true)
    expect(span.clippedEnd).toBe(true)
  })

  it("기간과 안 겹치는 일정은 버린다", () => {
    expect(assignLanes([{ id: "a", date: "2026-09-01" }], range)).toHaveLength(0)
  })

  it("종료가 시작보다 앞선 손상 데이터를 버리지 않고 하루로 눕힌다", () => {
    const [span] = assignLanes([{ id: "a", date: "2026-08-10", endDate: "2026-08-04" }], range)
    expect(span.startIndex).toBe(7)
    expect(span.endIndex).toBe(7)
  })

  it("줄 수 상한을 넘으면 잘라내되 몇 건 잘렸는지 알린다", () => {
    // 같은 날 10건이 겹치면 10줄이 필요한데, 그 높이는 한 행이 화면을 통째로 먹는다.
    const items = Array.from({ length: 10 }, (_, index) => ({
      id: `e${index}`,
      date: "2026-08-05",
    }))
    const { spans, overflow, lanes } = layoutLanes(items, range, 4)
    expect(lanes).toBe(4)
    expect(spans).toHaveLength(4)
    expect(overflow).toHaveLength(6)
    // 잘린 건수 + 그린 건수 = 전체. 조용히 사라지는 항목이 없어야 한다.
    expect(spans.length + overflow.length).toBe(items.length)
  })

  it("상한 안에 들어가면 아무것도 접지 않는다", () => {
    const { spans, overflow, lanes } = layoutLanes(
      [
        { id: "a", date: "2026-08-03", endDate: "2026-08-05" },
        { id: "b", date: "2026-08-07" },
      ],
      range,
      4
    )
    expect(spans).toHaveLength(2)
    expect(overflow).toEqual([])
    expect(lanes).toBe(1)
  })

  it("담당자가 여럿이면 각 행에 모두 나타난다", () => {
    const groups = groupByAssignee([
      { id: "a", assignees: ["박한", "김민재"] },
      { id: "b", assignees: [] },
      { id: "c", assignees: ["박한"] },
    ])
    expect(groups.get("박한")).toHaveLength(2)
    expect(groups.get("김민재")).toHaveLength(1)
    expect(groups.get("미지정")).toHaveLength(1)
  })
})
