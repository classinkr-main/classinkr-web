/**
 * Compass 캘린더 소스의 원천 하드 마감.
 *
 * 공용 SWR은 응답 마감(3.5초)에서 fallback을 내주되 원 약속은 취소하지 않는다 — 늦게라도
 * 끝나면 캐시에 앉히려는 의도다. 문제는 Supabase 왕복이 영영 안 끝날 때다: 그 약속이
 * inFlight 맵에 남아 같은 월의 이후 요청이 전부 그 시체를 재사용하고, 인스턴스 수명 내내
 * Compass 소스가 회복하지 못한다. 여기서 지키는 것: ①화면은 3.5초에 접힌다 ②늘어진 원천은
 * 9초에 스스로 접혀 in-flight를 놓아준다 ③그 뒤 요청은 새 시도를 띄운다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const bridge = vi.hoisted(() => ({ getCompassCalEvents: vi.fn() }))

vi.mock("@/lib/compass/bridge", () => bridge)

import { resetSourceCache } from "@/lib/admin-calendar/source-cache"
import { getCompassCalendarEventsWithHealth } from "@/lib/compass/calendar"

const RESPONSE_TIMEOUT_MS = 3_500
const HARD_TIMEOUT_MS = 9_000

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
  resetSourceCache()
  bridge.getCompassCalEvents.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("브리지가 영영 안 끝날 때", () => {
  it("화면은 3.5초에 접히고, 9초 뒤 요청은 새 시도를 띄운다", async () => {
    bridge.getCompassCalEvents.mockImplementation(() => new Promise(() => {}))

    const pending = getCompassCalendarEventsWithHealth({ year: 2026, month: 8 })
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS)
    const first = await pending

    expect(first.events).toEqual([])
    expect(first.down).toBe(true)
    expect(bridge.getCompassCalEvents).toHaveBeenCalledTimes(1)

    // 하드 마감 전에는 아직 같은 시도를 공유한다(중복 왕복 방지는 그대로 유효)
    const during = getCompassCalendarEventsWithHealth({ year: 2026, month: 8 })
    await vi.advanceTimersByTimeAsync(RESPONSE_TIMEOUT_MS)
    await during
    expect(bridge.getCompassCalEvents).toHaveBeenCalledTimes(1)

    // 하드 마감이 지나면 늘어진 시도가 스스로 접혀 in-flight를 놓아준다
    await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS)

    bridge.getCompassCalEvents.mockResolvedValue({
      rows: [
        {
          key: "recovered",
          day: "2026-08-19",
          time: "16:00",
          title: "복구된 일정",
          owners: [],
          lead_id: null,
          link: null,
          synced_at: "2026-08-28T00:00:00.000Z",
        },
      ],
      down: false,
    })

    const recovered = await getCompassCalendarEventsWithHealth({ year: 2026, month: 8 })
    expect(bridge.getCompassCalEvents).toHaveBeenCalledTimes(2)
    expect(recovered.down).toBe(false)
    expect(recovered.events.map((event) => event.title)).toEqual(["복구된 일정"])
  })

  it("마감으로 접힌 시도는 캐시를 덮지 않는다 — 받아 둔 값이 있으면 그대로 보여준다", async () => {
    bridge.getCompassCalEvents.mockResolvedValueOnce({
      rows: [
        {
          key: "warm",
          day: "2026-09-02",
          time: null,
          title: "미리 받아 둔 일정",
          owners: [],
          lead_id: null,
          link: null,
          synced_at: "2026-08-28T00:00:00.000Z",
        },
      ],
      down: false,
    })

    const warm = await getCompassCalendarEventsWithHealth({ year: 2026, month: 9 })
    expect(warm.events).toHaveLength(1)

    // TTL 경과 후 갱신이 늘어져 하드 마감에 걸려도 스테일은 살아남는다
    bridge.getCompassCalEvents.mockImplementation(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1)
    const stale = await getCompassCalendarEventsWithHealth({ year: 2026, month: 9 })
    expect(stale.events.map((event) => event.title)).toEqual(["미리 받아 둔 일정"])

    await vi.advanceTimersByTimeAsync(HARD_TIMEOUT_MS + 1)
    const afterDeadline = await getCompassCalendarEventsWithHealth({ year: 2026, month: 9 })
    expect(afterDeadline.events.map((event) => event.title)).toEqual(["미리 받아 둔 일정"])
    expect(afterDeadline.down).toBe(true)
  })
})
