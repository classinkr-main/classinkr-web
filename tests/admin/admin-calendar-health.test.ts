import { describe, expect, it } from "vitest"

import {
  daysBetweenDates,
  deriveFeedHealth,
  derivePublicEventsHealth,
  deriveStoredHealth,
  deriveTeamAccessHealth,
  monthsBetween,
  summarizeDates,
} from "@/lib/admin-calendar/health"

const TODAY = "2026-08-19"

describe("날짜 요약", () => {
  it("과거 최댓값과 미래 최솟값을 고른다", () => {
    expect(summarizeDates(["2026-05-10", "2026-07-23", "2026-09-01", "2026-10-02"], TODAY)).toEqual({
      lastPast: "2026-07-23",
      nextFuture: "2026-09-01",
    })
  })

  it("오늘은 과거 쪽으로 센다", () => {
    expect(summarizeDates([TODAY], TODAY)).toEqual({ lastPast: TODAY, nextFuture: null })
  })

  it("빈 배열이면 둘 다 null", () => {
    expect(summarizeDates([], TODAY)).toEqual({ lastPast: null, nextFuture: null })
  })

  it("월 차이는 달력 월 기준", () => {
    expect(monthsBetween("2026-05-31", "2026-08-01")).toBe(3)
    expect(monthsBetween("2026-08-01", "2026-08-31")).toBe(0)
    expect(daysBetweenDates("2026-08-01", "2026-08-19")).toBe(18)
  })
})

describe("저장형 소스(팀·파트너)", () => {
  it("0건이면 dead — '입력 없음'", () => {
    const health = deriveStoredHealth({ source: "calendar", count: 0, lastDate: null })
    expect(health.status).toBe("dead")
    expect(health.headline).toBe("입력 없음")
  })

  it("1건 이상이면 ok + 마지막 날짜", () => {
    const health = deriveStoredHealth({ source: "partner", count: 3, lastDate: "2026-08-12" })
    expect(health.status).toBe("ok")
    expect(health.detail).toBe("마지막 8/12")
  })
})

describe("공개 행사", () => {
  it("미래 회차가 있으면 ok", () => {
    const health = derivePublicEventsHealth({ dates: ["2026-07-23", "2026-09-04"], today: TODAY })
    expect(health.status).toBe("ok")
    expect(health.detail).toBe("다음 9/4")
  })

  it("전부 과거면 stale — 실측 상황(마지막 7/23)", () => {
    const health = derivePublicEventsHealth({
      dates: ["2026-05-08", "2026-05-22", "2026-07-09", "2026-07-23"],
      today: TODAY,
    })
    expect(health.status).toBe("stale")
    expect(health.headline).toBe("전부 과거")
    expect(health.detail).toBe("마지막 7/23")
  })

  it("아예 없으면 dead", () => {
    expect(derivePublicEventsHealth({ dates: [], today: TODAY }).status).toBe("dead")
  })
})

describe("외부 피드(노션·쇼룸)", () => {
  it("최근 45일 안에 유입이 있으면 ok", () => {
    const health = deriveFeedHealth({
      source: "showroom",
      dates: ["2026-07-20"],
      today: TODAY,
      lookbackMonths: 4,
    })
    expect(health.status).toBe("ok")
  })

  it("노션 실측(마지막 2026-05) → '3개월째 없음'", () => {
    const health = deriveFeedHealth({
      source: "notion",
      dates: ["2026-05-14"],
      today: TODAY,
      lookbackMonths: 4,
    })
    expect(health.status).toBe("stale")
    expect(health.headline).toBe("3개월째 없음")
    expect(health.detail).toBe("마지막 5/14")
  })

  it("윈도 안에 아무것도 없으면 dead + 정직한 하한 문구", () => {
    const health = deriveFeedHealth({ source: "notion", dates: [], today: TODAY, lookbackMonths: 4 })
    expect(health.status).toBe("dead")
    expect(health.headline).toBe("4개월+ 없음")
  })

  it("미래 일정이 있으면 과거가 오래됐어도 ok", () => {
    const health = deriveFeedHealth({
      source: "notion",
      dates: ["2026-03-01", "2026-09-10"],
      today: TODAY,
      lookbackMonths: 4,
    })
    expect(health.status).toBe("ok")
    expect(health.detail).toBe("다음 9/10")
  })
})

describe("팀원 캘린더 접근", () => {
  it("실측 상황: 9명 구성 · 0명 접근 → dead '9명 공유 필요'", () => {
    const health = deriveTeamAccessHealth({ configured: 9, accessible: 0 })
    expect(health.status).toBe("dead")
    expect(health.headline).toBe("9명 공유 필요")
  })

  it("일부만 접근되면 stale + 남은 인원", () => {
    const health = deriveTeamAccessHealth({ configured: 9, accessible: 6 })
    expect(health.status).toBe("stale")
    expect(health.headline).toBe("3명 공유 필요")
    expect(health.detail).toBe("6/9명 연결됨")
  })

  it("프로브 실패는 dead가 아니라 '확인 불가'", () => {
    expect(deriveTeamAccessHealth({ configured: 9, accessible: null }).headline).toBe("확인 불가")
  })

  it("전원 연결이면 ok", () => {
    expect(deriveTeamAccessHealth({ configured: 9, accessible: 9 }).status).toBe("ok")
  })
})
