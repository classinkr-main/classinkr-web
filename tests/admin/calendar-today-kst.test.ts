// 캘린더 "오늘"은 서버(UTC)·브라우저(어느 시간대든) 모두 서울 기준 같은 날짜여야 한다 —
// 로컬 날짜로 구하면 한국 시간 00~09시에 서버·클라이언트 첫 렌더의 오늘 표시 속성이 어긋난다(하이드레이션 경고).
import { afterEach, describe, expect, it, vi } from "vitest"

import { getDefaultAdminCalendarRange, todayDateString } from "@/lib/admin/calendar-range"

afterEach(() => vi.useRealTimers())

describe("todayDateString (서울 기준)", () => {
  it("UTC 로는 전날인 한국 새벽도 한국 날짜를 돌려준다", () => {
    expect(todayDateString(new Date("2026-04-04T15:30:00Z"))).toBe("2026-04-05")
    expect(todayDateString(new Date("2026-12-31T15:00:00Z"))).toBe("2027-01-01")
  })

  it("한국 날짜가 바뀌기 직전까지는 같은 날이다", () => {
    expect(todayDateString(new Date("2026-04-04T14:59:59Z"))).toBe("2026-04-04")
  })

  it("기본 진입 범위(사이드바 예열)도 같은 오늘을 따른다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-30T16:00:00Z"))
    expect(getDefaultAdminCalendarRange().from.slice(0, 7)).toBe("2026-05")
  })
})
