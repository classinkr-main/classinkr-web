/**
 * 팀원 구글 캘린더 네거티브 캐시.
 *
 * 실측(2026-07-29~): 구성된 9명 전원이 서비스 계정에 캘린더를 공유하지 않아 events.list가 404다.
 * 실패를 기억하지 않던 시절엔 캐시 TTL이 지날 때마다 9회 왕복을 다시 태웠다(타임라인 3개월이면 27회).
 * 여기서 지키는 것: ①미공유 멤버는 60분 쉰다 ②전원 미공유면 소스 자체가 쉰다
 * ③시간이 지나면 저절로 다시 두드린다(하드 비활성 금지) ④일시 장애는 기억하지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const google = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock("@/lib/google", () => ({ calendar: { events: { list: google.list } } }))
vi.mock("next/cache", () => ({ unstable_cache: (fetcher: unknown) => fetcher }))

import { resetSourceCache } from "@/lib/admin-calendar/source-cache"
import {
  getTeamEventsCalendarEvents,
  probeTeamCalendarAccess,
  resetTeamCalendarBackoff,
} from "@/lib/team-member-calendars"

const MEMBERS = [
  { name: "정규성", email: "gyusung@example.com" },
  { name: "진소망", email: "somang@example.com" },
]

const TTL_MS = 5 * 60_000
const BLOCK_MS = 60 * 60_000

function notShared() {
  return Object.assign(new Error("Not Found"), { code: 404 })
}

function transient() {
  return Object.assign(new Error("Backend Error"), { code: 500 })
}

function calendarWith(summary: string) {
  return {
    data: {
      items: [
        { id: "ev1", summary, start: { date: "2026-08-20" }, end: { date: "2026-08-21" } },
      ],
    },
  }
}

const savedEnv: Record<string, string | undefined> = {}
const ENV = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "svc@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----",
  TEAM_CALENDAR_MEMBERS: JSON.stringify(MEMBERS),
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  vi.spyOn(console, "warn").mockImplementation(() => {})
  for (const [key, value] of Object.entries(ENV)) {
    savedEnv[key] = process.env[key]
    process.env[key] = value
  }
  google.list.mockReset()
  resetSourceCache()
  resetTeamCalendarBackoff()
})

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("전원 미공유(404)", () => {
  it("한 번 확인한 뒤로는 60분 동안 구글을 다시 두드리지 않는다", async () => {
    google.list.mockRejectedValue(notShared())

    expect(await getTeamEventsCalendarEvents({ year: 2026, month: 8 })).toEqual([])
    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length)

    // 캐시 TTL이 지나도(예전엔 여기서 9회 왕복이 재발했다) 추가 왕복이 없다
    await vi.advanceTimersByTimeAsync(TTL_MS + 1)
    expect(await getTeamEventsCalendarEvents({ year: 2026, month: 8 })).toEqual([])
    await vi.advanceTimersByTimeAsync(TTL_MS + 1)
    expect(await getTeamEventsCalendarEvents({ year: 2026, month: 8 })).toEqual([])

    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length)
  })

  it("60분이 지나면 저절로 다시 두드리고, 공유가 열려 있으면 그대로 회복한다", async () => {
    google.list.mockRejectedValue(notShared())
    await getTeamEventsCalendarEvents({ year: 2026, month: 8 })
    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length)

    await vi.advanceTimersByTimeAsync(BLOCK_MS + 1)
    google.list.mockReset()
    google.list.mockResolvedValue(calendarWith("팀 회의"))

    const events = await getTeamEventsCalendarEvents({ year: 2026, month: 8 })

    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length)
    expect(events).toHaveLength(MEMBERS.length)
    expect(events[0]).toMatchObject({
      title: "팀 회의",
      date: "2026-08-20",
      source: "team_event",
      readonly: true,
    })
  })
})

describe("일부만 미공유", () => {
  it("막힌 멤버만 건너뛰고 열린 멤버는 계속 읽는다", async () => {
    google.list.mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === MEMBERS[0].email) throw notShared()
      return calendarWith("데모")
    })

    const first = await getTeamEventsCalendarEvents({ year: 2026, month: 8 })
    expect(first).toHaveLength(1)
    expect(first[0].assignees).toEqual([MEMBERS[1].name])
    expect(google.list).toHaveBeenCalledTimes(2)

    // TTL 만료 후 갱신은 막힌 멤버를 빼고 1명만 두드린다
    await vi.advanceTimersByTimeAsync(TTL_MS + 1)
    await getTeamEventsCalendarEvents({ year: 2026, month: 8 })
    await vi.advanceTimersByTimeAsync(0)

    expect(google.list).toHaveBeenCalledTimes(3)
    expect(google.list.mock.calls[2][0]).toMatchObject({ calendarId: MEMBERS[1].email })
  })
})

describe("일시 장애(5xx)", () => {
  it("기억하지 않는다 — 다음 요청이 그대로 다시 시도한다", async () => {
    google.list.mockRejectedValue(transient())

    expect(await getTeamEventsCalendarEvents({ year: 2026, month: 8 })).toEqual([])
    expect(await getTeamEventsCalendarEvents({ year: 2026, month: 8 })).toEqual([])

    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length * 2)
  })
})

/**
 * 연결 상태 화면의 "N명 공유 필요"는 이 프로브가 유일한 근거다. 그래서 실패를 두 종류로
 * 나눠야 한다 — 403/404(미공유)만 인원 수에 세고, 5xx·타임아웃은 "판단 불가"다.
 * 구글이 잠깐 죽었을 뿐인데 0명으로 세면 화면이 전원 미공유라고 오진하고, 그 오진이
 * 10분 캐시로 굳는다.
 */
describe("접근 프로브 — 실패 분류", () => {
  it("403/404만 미공유로 센다", async () => {
    google.list.mockRejectedValue(notShared())

    expect(await probeTeamCalendarAccess()).toEqual({
      configured: MEMBERS.length,
      accessible: 0,
    })
  })

  it("열린 캘린더와 미공유가 섞이면 열린 인원만 센다", async () => {
    google.list.mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === MEMBERS[0].email) throw notShared()
      return calendarWith("데모")
    })

    expect(await probeTeamCalendarAccess()).toEqual({
      configured: MEMBERS.length,
      accessible: 1,
    })
  })

  it("일시 장애(5xx)는 '공유 안 됨'이 아니라 '판단 불가'다", async () => {
    google.list.mockRejectedValue(transient())

    // accessible:0(= "2명 공유 필요" 오진)이 아니라 null(= "확인 불가")
    expect(await probeTeamCalendarAccess()).toEqual({
      configured: MEMBERS.length,
      accessible: null,
    })
  })

  it("한 명만 일시 장애여도 인원 수를 단정하지 않는다", async () => {
    google.list.mockImplementation(async (params: { calendarId: string }) => {
      if (params.calendarId === MEMBERS[0].email) throw transient()
      return calendarWith("데모")
    })

    expect(await probeTeamCalendarAccess()).toEqual({
      configured: MEMBERS.length,
      accessible: null,
    })
  })

  it("판단 불가는 캐시에 앉지 않는다 — 장애가 풀리면 바로 회복한다", async () => {
    google.list.mockRejectedValue(transient())
    expect((await probeTeamCalendarAccess()).accessible).toBeNull()

    google.list.mockReset()
    google.list.mockResolvedValue(calendarWith("데모"))

    // TTL(10분)을 기다리지 않고 곧바로 다시 확인한다 — 오진이 굳지 않았다는 증거
    expect(await probeTeamCalendarAccess()).toEqual({
      configured: MEMBERS.length,
      accessible: MEMBERS.length,
    })
    expect(google.list).toHaveBeenCalledTimes(MEMBERS.length)
  })
})
