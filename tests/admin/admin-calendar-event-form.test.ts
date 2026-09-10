import { describe, expect, it } from "vitest"

import {
  EMPTY_EVENT_FORM,
  addMinutesToTime,
  formatAssignees,
  formatDateLabel,
  formatDuration,
  getFormIssues,
  getWeekdayLabel,
  hasBlockingIssue,
  isTimeString,
  minutesBetweenTimes,
  parseAssignees,
  shiftEndDate,
  summarizeSchedule,
  toggleAssignee,
  type EventFormData,
} from "@/lib/admin-calendar/event-form"

function form(overrides: Partial<EventFormData> = {}): EventFormData {
  return { ...EMPTY_EVENT_FORM, title: "정기 회의", date: "2026-08-21", ...overrides }
}

describe("시간 산술", () => {
  it("HH:mm 형식만 통과시킨다", () => {
    expect(isTimeString("09:00")).toBe(true)
    expect(isTimeString("23:59")).toBe(true)
    expect(isTimeString("24:00")).toBe(false)
    expect(isTimeString("9:00")).toBe(false)
    expect(isTimeString("")).toBe(false)
  })

  it("분을 더하면 시를 올린다", () => {
    expect(addMinutesToTime("09:00", 60)).toBe("10:00")
    expect(addMinutesToTime("14:45", 30)).toBe("15:15")
    expect(addMinutesToTime("09:00", 120)).toBe("11:00")
  })

  it("자정을 넘기지 않고 23:59 에서 멈춘다", () => {
    // 넘어가면 같은 날 안에서 종료 시간이 시작보다 앞서 보인다.
    expect(addMinutesToTime("23:30", 60)).toBe("23:59")
    expect(addMinutesToTime("23:00", 120)).toBe("23:59")
  })

  it("형식이 아니면 빈 문자열", () => {
    expect(addMinutesToTime("", 60)).toBe("")
    expect(addMinutesToTime("점심", 60)).toBe("")
  })

  it("간격을 분으로 재고 사람이 읽는 길이로 바꾼다", () => {
    expect(minutesBetweenTimes("09:00", "10:30")).toBe(90)
    expect(minutesBetweenTimes("15:00", "14:00")).toBe(-60)
    expect(formatDuration(90)).toBe("1시간 30분")
    expect(formatDuration(45)).toBe("45분")
    expect(formatDuration(120)).toBe("2시간")
    expect(formatDuration(0)).toBe("")
  })
})

describe("날짜 표기", () => {
  it("요일이 KST 로컬 타임존에 밀리지 않는다", () => {
    // 2026-08-21 은 금요일.
    expect(getWeekdayLabel("2026-08-21")).toBe("금")
    expect(formatDateLabel("2026-08-21")).toBe("8월 21일 (금)")
    expect(formatDateLabel("2026-01-01")).toBe("1월 1일 (목)")
  })

  it("날짜가 아니면 빈 문자열", () => {
    expect(formatDateLabel("")).toBe("")
    expect(formatDateLabel("2026-02-30")).toBe("")
  })
})

describe("담당자 문자열", () => {
  it("쉼표 원문을 이름 배열로 눕힌다", () => {
    expect(parseAssignees("문준혁, 정규성")).toEqual(["문준혁", "정규성"])
    expect(parseAssignees("  문준혁 ,, 정규성 , ")).toEqual(["문준혁", "정규성"])
    expect(parseAssignees("")).toEqual([])
  })

  it("중복은 첫 등장만 남긴다", () => {
    // 같은 사람이 두 번 들어가면 담당자 필터에서 카운트가 부풀려진다.
    expect(parseAssignees("문준혁, 문준혁")).toEqual(["문준혁"])
  })

  it("배열과 원문을 왕복해도 값이 유지된다", () => {
    const names = ["문준혁", "정규성"]
    expect(parseAssignees(formatAssignees(names))).toEqual(names)
  })

  it("토글은 입력 순서를 보존한다", () => {
    expect(toggleAssignee(["문준혁"], "정규성")).toEqual(["문준혁", "정규성"])
    expect(toggleAssignee(["문준혁", "정규성"], "문준혁")).toEqual(["정규성"])
    expect(toggleAssignee(["문준혁"], "  ")).toEqual(["문준혁"])
  })
})

describe("시작일 이동", () => {
  it("종료일이 같은 간격만큼 따라온다", () => {
    expect(shiftEndDate("2026-08-21", "2026-08-23", "2026-08-25")).toBe("2026-08-27")
  })

  it("종료일이 비어 있으면 그대로 둔다", () => {
    expect(shiftEndDate("2026-08-21", "", "2026-08-25")).toBe("")
  })

  it("이미 역전된 범위는 따라가지 않고 비운다", () => {
    expect(shiftEndDate("2026-08-21", "2026-08-19", "2026-08-25")).toBe("")
  })

  it("월 경계를 넘어도 간격이 유지된다", () => {
    expect(shiftEndDate("2026-08-30", "2026-08-31", "2026-08-31")).toBe("2026-09-01")
  })
})

describe("검증", () => {
  it("정상 입력에는 문제가 없다", () => {
    expect(hasBlockingIssue(getFormIssues(form()))).toBe(false)
    expect(hasBlockingIssue(getFormIssues(form({ time: "09:00", endTime: "10:00" })))).toBe(false)
  })

  it("제목과 시작일은 필수다", () => {
    expect(getFormIssues(form({ title: "   " })).title).toBeTruthy()
    expect(getFormIssues(form({ date: "" })).date).toBeTruthy()
  })

  it("종료일이 시작일보다 앞서면 막는다", () => {
    expect(getFormIssues(form({ endDate: "2026-08-20" })).endDate).toBeTruthy()
    expect(getFormIssues(form({ endDate: "2026-08-21" })).endDate).toBeUndefined()
  })

  it("하루짜리 일정의 종료 시간은 시작 시간보다 늦어야 한다", () => {
    expect(getFormIssues(form({ time: "14:00", endTime: "13:00" })).endTime).toBeTruthy()
    expect(getFormIssues(form({ time: "14:00", endTime: "14:00" })).endTime).toBeTruthy()
  })

  it("멀티데이는 종료 시간이 시작 시간보다 일러도 정상이다", () => {
    // 21일 18:00 시작 → 23일 09:00 종료.
    const issues = getFormIssues(
      form({ endDate: "2026-08-23", time: "18:00", endTime: "09:00" })
    )
    expect(issues.endTime).toBeUndefined()
  })

  it("시작 시간 없이 종료 시간만 있으면 막는다", () => {
    expect(getFormIssues(form({ endTime: "10:00" })).endTime).toBeTruthy()
  })

  it("종일이면 시간 검증을 하지 않는다", () => {
    const issues = getFormIssues(form({ allDay: true, time: "14:00", endTime: "13:00" }))
    expect(issues.endTime).toBeUndefined()
  })
})

describe("요약", () => {
  it("멀티데이는 일수를 센다", () => {
    expect(summarizeSchedule(form({ endDate: "2026-08-23" }))).toBe(
      "8월 21일 (금) → 8월 23일 (일) · 3일간"
    )
  })

  it("종일과 시간 지정을 구분한다", () => {
    expect(summarizeSchedule(form({ allDay: true }))).toBe("8월 21일 (금) · 종일")
    expect(summarizeSchedule(form({ time: "14:00", endTime: "15:30" }))).toBe(
      "8월 21일 (금) · 14:00–15:30 (1시간 30분)"
    )
    expect(summarizeSchedule(form({ time: "14:00" }))).toBe("8월 21일 (금) · 14:00")
    expect(summarizeSchedule(form())).toBe("8월 21일 (금) · 시간 미정")
  })

  it("시작일이 없으면 요약하지 않는다", () => {
    expect(summarizeSchedule(form({ date: "" }))).toBe("")
  })
})
