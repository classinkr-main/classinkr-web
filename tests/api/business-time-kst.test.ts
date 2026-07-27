// KST 시각 계약 회귀 가드 (2026-07-27 파트너 워크스페이스 결함 P1).
//
// 어드민 입력 폼(datetime-local)은 오프셋 없는 'YYYY-MM-DDTHH:mm' 을 보낸다. 이 값을
// 그대로 timestamptz 에 넣으면 Postgres 가 UTC 로 해석해 KST 입력이 9시간 뒤로 밀렸다.
// 저장(+09:00 명시)과 표시(인스턴트 → KST 벽시계)가 대칭이어야 왕복이 맞고, 캘린더 월
// 경계도 같은 기준(KST 자정)이어야 KST 1일 00:30 일정이 전월로 새지 않는다.
//
// 이 파일은 lib/business-time.ts 를 직접 검증한다 — partners-data(저장/표시)와
// calendar-data(월 필터·날짜 파싱)가 같은 함수를 쓰므로 한쪽만 되돌아가는 회귀를 막는다.
// 서버 TZ 와 무관하게 통과해야 한다(Intl timeZone 고정).
import { describe, expect, it } from "vitest"

import {
  formatBusinessDateTimeLabel,
  getBusinessDateParts,
  getBusinessMonthRangeIso,
  hasExplicitUtcOffset,
  toBusinessClockDateTime,
  toBusinessStorageDateTime,
} from "@/lib/business-time"

describe("toBusinessStorageDateTime", () => {
  it("오프셋 없는 벽시계 입력에 +09:00 을 명시한다", () => {
    expect(toBusinessStorageDateTime("2026-07-27T14:00")).toBe("2026-07-27T14:00+09:00")
    expect(toBusinessStorageDateTime("2026-07-27 14:00")).toBe("2026-07-27T14:00+09:00")
  })

  it("이미 절대 시각인 값은 이중 보정하지 않는다", () => {
    expect(toBusinessStorageDateTime("2026-07-27T05:00:00+00:00")).toBe("2026-07-27T05:00:00+00:00")
    expect(toBusinessStorageDateTime("2026-07-27T05:00:00Z")).toBe("2026-07-27T05:00:00Z")
    expect(toBusinessStorageDateTime("2026-07-27T14:00+09:00")).toBe("2026-07-27T14:00+09:00")
  })

  it("날짜만 있는 값은 원문을 유지한다(DATE 컬럼 경로)", () => {
    expect(toBusinessStorageDateTime("2026-07-27")).toBe("2026-07-27")
  })
})

describe("formatBusinessDateTimeLabel", () => {
  it("timestamptz 왕복값(UTC)을 KST 벽시계 라벨로 환산한다", () => {
    expect(formatBusinessDateTimeLabel("2026-07-27T05:00:00+00:00")).toBe("2026-07-27 14:00")
    expect(formatBusinessDateTimeLabel("2026-07-27T05:00:00Z")).toBe("2026-07-27 14:00")
  })

  it("자정을 24:00 이 아니라 00:00 으로 표기한다", () => {
    expect(formatBusinessDateTimeLabel("2026-07-26T15:00:00+00:00")).toBe("2026-07-27 00:00")
  })

  it("오프셋 없는 로컬 JSON 폴백 값은 변환하지 않는다", () => {
    expect(formatBusinessDateTimeLabel("2026-07-27 14:00")).toBe("2026-07-27 14:00")
  })

  it("파싱 불가한 값은 원문을 유지한다", () => {
    expect(formatBusinessDateTimeLabel("미정")).toBe("미정")
  })
})

describe("저장 → 표시 왕복", () => {
  it("14:00 입력이 Postgres UTC 표현을 거쳐도 14:00 으로 되돌아온다", () => {
    const stored = toBusinessStorageDateTime("2026-07-27T14:00")
    // Postgres 가 timestamptz 를 UTC 로 돌려주는 형태를 재현
    const pgEcho = `${new Date(stored).toISOString().slice(0, 19)}+00:00`

    expect(pgEcho).toBe("2026-07-27T05:00:00+00:00")
    expect(formatBusinessDateTimeLabel(pgEcho)).toBe("2026-07-27 14:00")
  })
})

describe("getBusinessMonthRangeIso", () => {
  it("월 경계를 KST 자정 인스턴트로 잡는다", () => {
    expect(getBusinessMonthRangeIso(2026, 8)).toEqual({
      startIso: "2026-07-31T15:00:00.000Z",
      endIso: "2026-08-31T15:00:00.000Z",
    })
  })

  it("KST 8월 1일 00:30 일정이 8월 범위에 포함된다(전월로 새지 않음)", () => {
    const { startIso, endIso } = getBusinessMonthRangeIso(2026, 8)
    const kstAugustFirst0030 = new Date("2026-07-31T15:30:00+00:00")

    expect(kstAugustFirst0030 >= new Date(startIso)).toBe(true)
    expect(kstAugustFirst0030 < new Date(endIso)).toBe(true)
  })

  it("KST 7월 31일 23:30 일정은 8월 범위에서 제외된다", () => {
    const { startIso } = getBusinessMonthRangeIso(2026, 8)

    expect(new Date("2026-07-31T14:30:00+00:00") < new Date(startIso)).toBe(true)
  })
})

describe("toBusinessClockDateTime", () => {
  it("UTC 인스턴트를 KST 벽시계로 환산해 날짜 경계를 넘긴다", () => {
    expect(toBusinessClockDateTime("2026-07-31T15:30:00+00:00")).toBe("2026-08-01T00:30")
  })

  it("오프셋 없는 값은 'T' 구분자만 정규화한다", () => {
    expect(toBusinessClockDateTime("2026-08-01 09:00")).toBe("2026-08-01T09:00")
  })
})

describe("getBusinessDateParts", () => {
  it("서버 TZ 와 무관하게 KST 기준 오늘/이번 달을 준다", () => {
    // UTC 2026-07-27 20:00 = KST 2026-07-28 05:00 → 날짜와 달이 UTC 기준과 갈린다
    expect(getBusinessDateParts(new Date("2026-07-27T20:00:00Z"))).toEqual({
      date: "2026-07-28",
      month: "2026-07",
    })
    // UTC 2026-07-31 16:00 = KST 2026-08-01 01:00 → 월도 넘어간다
    expect(getBusinessDateParts(new Date("2026-07-31T16:00:00Z"))).toEqual({
      date: "2026-08-01",
      month: "2026-08",
    })
  })
})

describe("hasExplicitUtcOffset", () => {
  it("Z·±hh:mm·±hhmm 을 절대 시각으로 판정하고 벽시계 입력은 아니라고 본다", () => {
    expect(hasExplicitUtcOffset("2026-07-27T05:00:00Z")).toBe(true)
    expect(hasExplicitUtcOffset("2026-07-27T14:00+09:00")).toBe(true)
    expect(hasExplicitUtcOffset("2026-07-27T14:00+0900")).toBe(true)
    expect(hasExplicitUtcOffset("2026-07-27T14:00")).toBe(false)
    expect(hasExplicitUtcOffset("2026-07-27")).toBe(false)
  })
})
