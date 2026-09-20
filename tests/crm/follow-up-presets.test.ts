/**
 * 리드 드로어 팔로업 프리셋 순수 함수 — CRM 디벨롭 §13 Q1.
 *
 * KST 일 경계는 호스트 타임존(CI가 대개 UTC)과 무관해야 하므로, "오늘"에 기대지 않고 고정된
 * 시각(fixture)으로만 검증한다. 2026-09-20(일) 기준 요일은 `date -d` 로 미리 확인했다:
 * 2026-09-20 일, 2026-09-21 월, 2026-09-25 금, 2026-09-14 월, 2026-09-28 월, 2026-10-10 토.
 */
import { describe, expect, it } from "vitest"

import {
  FOLLOW_UP_PRESETS,
  buildFollowUpQuickSuggestions,
  describeFollowUpDate,
  resolveFollowUpPreset,
} from "@/lib/crm/follow-up-presets"

// KST 00:00 = UTC 전날 15:00. 아래 fixture는 전부 "그 날짜의 KST 낮 시각"을 UTC로 표기한 것이다.
const SUNDAY_KST_NOON = Date.parse("2026-09-20T03:00:00.000Z") // 2026-09-20 12:00 KST(일)
const MONDAY_EARLY_KST = Date.parse("2026-09-20T15:30:00.000Z") // 2026-09-21 00:30 KST(월)
const FRIDAY_KST_NOON = Date.parse("2026-09-25T03:00:00.000Z") // 2026-09-25 12:00 KST(금)

describe("FOLLOW_UP_PRESETS", () => {
  it("정확히 4개(오늘·내일·3일 뒤·다음 주 월)를 이 순서로 정의한다", () => {
    expect(FOLLOW_UP_PRESETS.map((p) => p.id)).toEqual(["today", "tomorrow", "in3", "next_monday"])
    expect(FOLLOW_UP_PRESETS.map((p) => p.label)).toEqual(["오늘", "내일", "3일 뒤", "다음 주 월"])
  })
})

describe("resolveFollowUpPreset — KST 일 경계", () => {
  it("UTC 15:00:00.000 정각에 KST 날짜가 넘어간다(그 전은 이전 날짜)", () => {
    const before = Date.parse("2026-09-19T14:59:59.999Z")
    const at = Date.parse("2026-09-19T15:00:00.000Z")
    expect(resolveFollowUpPreset("today", before)).toBe("2026-09-19")
    expect(resolveFollowUpPreset("today", at)).toBe("2026-09-20")
  })

  it("일요일 기준 오늘/내일/3일 뒤", () => {
    expect(resolveFollowUpPreset("today", SUNDAY_KST_NOON)).toBe("2026-09-20")
    expect(resolveFollowUpPreset("tomorrow", SUNDAY_KST_NOON)).toBe("2026-09-21")
    expect(resolveFollowUpPreset("in3", SUNDAY_KST_NOON)).toBe("2026-09-23")
  })

  it("일요일의 '다음 주 월'은 내일이다(이번 주 안에 남은 가장 가까운 월요일)", () => {
    expect(resolveFollowUpPreset("next_monday", SUNDAY_KST_NOON)).toBe(
      resolveFollowUpPreset("tomorrow", SUNDAY_KST_NOON)
    )
    expect(resolveFollowUpPreset("next_monday", SUNDAY_KST_NOON)).toBe("2026-09-21")
  })

  it("오늘이 월요일이면 '다음 주 월'은 +7일(오늘이 아니라 그다음 주 월요일)", () => {
    expect(resolveFollowUpPreset("today", MONDAY_EARLY_KST)).toBe("2026-09-21")
    expect(resolveFollowUpPreset("next_monday", MONDAY_EARLY_KST)).toBe("2026-09-28")
  })

  it("금요일은 '3일 뒤'와 '다음 주 월'이 같은 날짜로 겹친다(둘 다 그다음 월요일 — 계산상 정상)", () => {
    expect(resolveFollowUpPreset("today", FRIDAY_KST_NOON)).toBe("2026-09-25")
    expect(resolveFollowUpPreset("in3", FRIDAY_KST_NOON)).toBe("2026-09-28")
    expect(resolveFollowUpPreset("next_monday", FRIDAY_KST_NOON)).toBe("2026-09-28")
  })
})

describe("describeFollowUpDate", () => {
  it("오늘/내일은 고정 문구", () => {
    expect(describeFollowUpDate("2026-09-20", SUNDAY_KST_NOON)).toBe("오늘")
    expect(describeFollowUpDate("2026-09-21", SUNDAY_KST_NOON)).toBe("내일")
  })

  it("2~6일 뒤는 D-day 카운트", () => {
    expect(describeFollowUpDate("2026-09-23", SUNDAY_KST_NOON)).toBe("D-3")
  })

  it("7일 이상 미래는 M/D (요일)", () => {
    expect(describeFollowUpDate("2026-09-28", MONDAY_EARLY_KST)).toBe("9/28 (월)")
  })

  it("지난 날짜는 음수 D-day가 아니라 M/D (요일)로 답한다", () => {
    expect(describeFollowUpDate("2026-09-14", MONDAY_EARLY_KST)).toBe("9/14 (월)")
  })

  it("먼 미래도 M/D (요일)", () => {
    expect(describeFollowUpDate("2026-10-10", SUNDAY_KST_NOON)).toBe("10/10 (토)")
  })
})

describe("buildFollowUpQuickSuggestions", () => {
  it("현재 팔로업이 없으면 내일·3일 뒤 두 제안을 모두 낸다", () => {
    const result = buildFollowUpQuickSuggestions({ nowMs: SUNDAY_KST_NOON, currentFollowUpDate: null })
    expect(result).toEqual([
      { id: "tomorrow", label: "팔로업 내일", dateKey: "2026-09-21" },
      { id: "in3", label: "팔로업 3일 뒤", dateKey: "2026-09-23" },
    ])
  })

  it("현재 팔로업이 이미 '내일'이면 그 제안만 숨긴다", () => {
    const result = buildFollowUpQuickSuggestions({
      nowMs: SUNDAY_KST_NOON,
      currentFollowUpDate: "2026-09-21",
    })
    expect(result).toEqual([{ id: "in3", label: "팔로업 3일 뒤", dateKey: "2026-09-23" }])
  })

  it("현재 팔로업이 이미 '3일 뒤'면 그 제안만 숨긴다", () => {
    const result = buildFollowUpQuickSuggestions({
      nowMs: SUNDAY_KST_NOON,
      currentFollowUpDate: "2026-09-23",
    })
    expect(result).toEqual([{ id: "tomorrow", label: "팔로업 내일", dateKey: "2026-09-21" }])
  })

  it("현재 팔로업이 둘 다 아니면(먼 미래 등) 그대로 둘 다 낸다", () => {
    const result = buildFollowUpQuickSuggestions({
      nowMs: SUNDAY_KST_NOON,
      currentFollowUpDate: "2026-12-25",
    })
    expect(result).toHaveLength(2)
  })
})
