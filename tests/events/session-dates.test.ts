// 회차 행사(띄엄띄엄 열리는 공개 행사) 날짜 SSOT — lib/public-event-dates.ts
// 봉투(starts_at/ends_at)는 그대로 두고 session_dates만 추가하는 설계라, 회차가 없을 때
// 기존 단일 기간 행사의 동작이 그대로인지도 함께 못 박는다.
import { describe, expect, it } from "vitest"

import {
  buildKstIso,
  computePublicEventStatus,
  formatPublicEventSchedule,
  getPublicEventSessionRanges,
  normalizeSessionDates,
} from "@/lib/public-event-dates"

// 2026-08-03 14:00 KST ~ 2026-08-17 16:00 KST 봉투의 3회차 세미나
const SESSIONS = ["2026-08-03", "2026-08-10", "2026-08-17"]
const ENVELOPE_START = "2026-08-03T05:00:00.000Z" // 14:00 KST
const ENVELOPE_END = "2026-08-17T07:00:00.000Z" // 16:00 KST

describe("normalizeSessionDates", () => {
  it("중복을 제거하고 오름차순으로 정렬한다", () => {
    expect(normalizeSessionDates(["2026-08-17", "2026-08-03", "2026-08-17"])).toEqual([
      "2026-08-03",
      "2026-08-17",
    ])
  })

  it("형식이 어긋나거나 존재하지 않는 날짜는 버린다", () => {
    expect(
      normalizeSessionDates(["2026-08-03", "2026-8-3", "20260810", "2026-02-31", 42, null])
    ).toEqual(["2026-08-03"])
  })

  it("배열이 아니거나 남는 값이 없으면 null(단일 기간 행사)이다", () => {
    expect(normalizeSessionDates(null)).toBeNull()
    expect(normalizeSessionDates([])).toBeNull()
    expect(normalizeSessionDates(["없는날짜"])).toBeNull()
    expect(normalizeSessionDates("2026-08-03")).toBeNull()
  })
})

describe("buildKstIso", () => {
  it("KST 날짜+시각을 UTC ISO로 바꾼다", () => {
    expect(buildKstIso("2026-08-03", "14:00")).toBe(ENVELOPE_START)
  })

  it("시각이 비었거나 형식이 어긋나면 자정으로 본다", () => {
    expect(buildKstIso("2026-08-03", "")).toBe("2026-08-02T15:00:00.000Z")
  })

  it("날짜 형식이 어긋나면 null", () => {
    expect(buildKstIso("2026-8-3", "14:00")).toBeNull()
  })
})

describe("getPublicEventSessionRanges", () => {
  it("회차가 없으면 봉투 그대로 구간 하나를 돌려준다", () => {
    const ranges = getPublicEventSessionRanges(ENVELOPE_START, ENVELOPE_END, null)
    expect(ranges).toEqual([
      { date: "2026-08-03", startIso: ENVELOPE_START, endIso: ENVELOPE_END },
    ])
  })

  it("종료 시각이 없는 단일 기간 행사는 시작 +2시간으로 채운다", () => {
    const [range] = getPublicEventSessionRanges(ENVELOPE_START, null, null)
    expect(range.endIso).toBe("2026-08-03T07:00:00.000Z")
  })

  it("회차마다 봉투의 KST 시각부를 재사용한다", () => {
    const ranges = getPublicEventSessionRanges(ENVELOPE_START, ENVELOPE_END, SESSIONS)
    expect(ranges).toEqual([
      { date: "2026-08-03", startIso: "2026-08-03T05:00:00.000Z", endIso: "2026-08-03T07:00:00.000Z" },
      { date: "2026-08-10", startIso: "2026-08-10T05:00:00.000Z", endIso: "2026-08-10T07:00:00.000Z" },
      { date: "2026-08-17", startIso: "2026-08-17T05:00:00.000Z", endIso: "2026-08-17T07:00:00.000Z" },
    ])
  })

  it("종료 시각이 없으면 회차마다 시작 +2시간", () => {
    const ranges = getPublicEventSessionRanges(ENVELOPE_START, null, SESSIONS)
    expect(ranges.map((r) => r.endIso)).toEqual([
      "2026-08-03T07:00:00.000Z",
      "2026-08-10T07:00:00.000Z",
      "2026-08-17T07:00:00.000Z",
    ])
  })

  it("자정을 넘기는 회차는 종료를 다음 날로 민다", () => {
    // 매 회차 22:00 ~ 다음 날 01:00 KST. 봉투 끝은 마지막 회차(8/10)의 다음 날 01:00.
    const ranges = getPublicEventSessionRanges(
      "2026-08-03T13:00:00.000Z", // 8/3 22:00 KST
      "2026-08-10T16:00:00.000Z", // 8/11 01:00 KST
      ["2026-08-03", "2026-08-10"]
    )
    expect(ranges[0]).toEqual({
      date: "2026-08-03",
      startIso: "2026-08-03T13:00:00.000Z", // 8/3 22:00 KST
      endIso: "2026-08-03T16:00:00.000Z", // 8/4 01:00 KST
    })
    expect(ranges[1]).toEqual({
      date: "2026-08-10",
      startIso: "2026-08-10T13:00:00.000Z", // 8/10 22:00 KST
      endIso: "2026-08-10T16:00:00.000Z", // 8/11 01:00 KST
    })
  })
})

describe("computePublicEventStatus — 회차 행사는 봉투 기준(의도된 동작)", () => {
  it("회차 사이 빈 날에도 진행 중으로 본다", () => {
    const between = new Date("2026-08-05T03:00:00.000Z")
    expect(computePublicEventStatus(ENVELOPE_START, ENVELOPE_END, null, between)).toBe("진행 중")
  })

  it("봉투 앞은 예정, 뒤는 마감", () => {
    expect(
      computePublicEventStatus(ENVELOPE_START, ENVELOPE_END, null, new Date("2026-07-01T00:00:00.000Z"))
    ).toBe("예정")
    expect(
      computePublicEventStatus(ENVELOPE_START, ENVELOPE_END, null, new Date("2026-09-01T00:00:00.000Z"))
    ).toBe("마감")
  })
})

describe("formatPublicEventSchedule", () => {
  it("회차가 없는 여러 날 행사는 범위로 적는다", () => {
    expect(formatPublicEventSchedule(ENVELOPE_START, ENVELOPE_END, null)).toBe(
      "2026. 08. 03 ~ 2026. 08. 17"
    )
  })

  it("하루 안에 끝나는 행사는 날짜를 두 번 적지 않는다", () => {
    expect(formatPublicEventSchedule(ENVELOPE_START, "2026-08-03T07:00:00.000Z", null)).toBe(
      "2026. 08. 03"
    )
  })

  it("회차 4개 이하는 전부 나열한다", () => {
    expect(formatPublicEventSchedule(ENVELOPE_START, ENVELOPE_END, SESSIONS)).toBe(
      "2026. 08. 03, 08. 10, 08. 17 · 3회"
    )
  })

  it("회차 5개 이상은 범위 + 일수로 압축한다", () => {
    const many = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-09-21"]
    expect(formatPublicEventSchedule(ENVELOPE_START, ENVELOPE_END, many)).toBe(
      "2026. 08. 03 ~ 09. 21 중 5일"
    )
  })

  it("해가 바뀌면 뒤쪽 날짜에도 연도를 적는다", () => {
    expect(
      formatPublicEventSchedule(ENVELOPE_START, ENVELOPE_END, ["2026-12-28", "2027-01-04"])
    ).toBe("2026. 12. 28, 2027. 01. 04 · 2회")
  })

  it("회차가 하나면 그 날짜만 적는다", () => {
    expect(formatPublicEventSchedule(ENVELOPE_START, ENVELOPE_END, ["2026-08-03"])).toBe(
      "2026. 08. 03"
    )
  })
})
