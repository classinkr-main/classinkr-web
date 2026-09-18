/**
 * lib/crm/activity-week-summary — 기록 화면 "이번 주 요약"(A5) 순수 집계 계약.
 * 주 경계는 월요일 00:00 KST(+9h 고정). 금액 합산은 없다.
 */
import { describe, expect, it } from "vitest"

import {
  ACTIVITY_WEEK_KINDS,
  activityWeekEndIso,
  activityWeekRange,
  isActivityWeekSummaryPartial,
  kstDayDiff,
  summarizeActivityWeek,
  type ActivityWeekItem,
} from "@/lib/crm/activity-week-summary"

// 2026-09-16 12:00 KST (수요일) — 이번 주 = 9/14(월) 00:00 KST ~ 9/21(월) 00:00 KST 직전
const NOW_MS = Date.parse("2026-09-16T03:00:00.000Z")
const WEEK_START_ISO = "2026-09-13T15:00:00.000Z" // 9/14 00:00 KST
const WEEK_END_ISO = "2026-09-20T15:00:00.000Z" // 9/21 00:00 KST

function item(overrides: Partial<ActivityWeekItem> = {}): ActivityWeekItem {
  return {
    occurredAt: "2026-09-15T01:00:00.000Z",
    sourceType: "manual_note",
    sentiment: "neutral",
    targetType: "neo_account",
    targetId: "acc-1",
    ...overrides,
  }
}

describe("activityWeekRange (KST, 월요일 시작)", () => {
  it("수요일 정오 KST → 이번 주 월요일 00:00 KST 부터 7일", () => {
    const range = activityWeekRange(NOW_MS)
    expect(new Date(range.startMs).toISOString()).toBe(WEEK_START_ISO)
    expect(new Date(range.endMs).toISOString()).toBe(WEEK_END_ISO)
  })

  it("일요일 23:30 KST 는 아직 같은 주, 월요일 00:30 KST 는 다음 주 (UTC 로는 둘 다 일요일)", () => {
    const sundayLate = activityWeekRange(Date.parse("2026-09-20T14:30:00.000Z"))
    expect(new Date(sundayLate.startMs).toISOString()).toBe(WEEK_START_ISO)

    const mondayEarly = activityWeekRange(Date.parse("2026-09-20T15:30:00.000Z"))
    expect(new Date(mondayEarly.startMs).toISOString()).toBe(WEEK_END_ISO)
  })

  it("weekStartsOn=0 이면 일요일 시작", () => {
    const range = activityWeekRange(NOW_MS, 0)
    expect(new Date(range.startMs).toISOString()).toBe("2026-09-12T15:00:00.000Z") // 9/13(일) 00:00 KST
  })

  it("activityWeekEndIso 는 일요일 23:59:59.999 KST", () => {
    expect(activityWeekEndIso(NOW_MS)).toBe("2026-09-20T14:59:59.999Z")
  })
})

describe("summarizeActivityWeek", () => {
  it("주 경계(KST)를 포함/제외로 정확히 자르고 weekLabel 은 M/D–M/D", () => {
    const summary = summarizeActivityWeek(
      [
        item({ occurredAt: "2026-09-13T14:59:59.000Z" }), // 일 23:59:59 KST — 지난 주
        item({ occurredAt: "2026-09-13T15:00:00.000Z" }), // 월 00:00 KST — 포함
        item({ occurredAt: "2026-09-20T14:59:59.000Z" }), // 일 23:59:59 KST — 포함
        item({ occurredAt: "2026-09-20T15:00:00.000Z" }), // 다음 주 월 00:00 KST — 제외
        item({ occurredAt: "not-a-date" }),
      ],
      { nowMs: NOW_MS, weekStartsOn: 1 }
    )
    expect(summary.weekLabel).toBe("9/14–9/20")
    expect(summary.total).toBe(2)
    expect(summary.weekStartMs).toBe(Date.parse(WEEK_START_ISO))
    expect(summary.weekEndMs).toBe(Date.parse(WEEK_END_ISO))
  })

  it("종류별 카운트 — 계약 enum 키 전부를 0 으로 채우고, 콜/회의 별칭을 같이 준다", () => {
    const summary = summarizeActivityWeek(
      [
        item({ sourceType: "call" }),
        item({ sourceType: "call" }),
        item({ sourceType: "meeting_minutes" }),
        item({ sourceType: "sms" }),
        item({ sourceType: "recording" }),
        item({ sourceType: "manual_note" }),
        item({ sourceType: "site_inflow" }),
        item({ sourceType: "something_new" }), // enum 밖 — total 에는 들어가고 byKind 에는 없음
      ],
      { nowMs: NOW_MS, weekStartsOn: 1 }
    )
    expect(summary.total).toBe(8)
    expect(summary.byKind.call).toBe(2)
    expect(summary.byKind.meeting_minutes).toBe(1)
    expect(summary.byKind.sms).toBe(1)
    expect(summary.byKind.recording).toBe(1)
    expect(summary.byKind.manual_note).toBe(1)
    expect(summary.byKind.site_inflow).toBe(1)
    expect(summary.byKind.external_crm).toBe(0)
    expect(summary.calls).toBe(2)
    expect(summary.meetings).toBe(1)
    for (const kind of ACTIVITY_WEEK_KINDS) expect(typeof summary.byKind[kind]).toBe("number")
    expect(Object.keys(summary.byKind)).toHaveLength(ACTIVITY_WEEK_KINDS.length)
    expect(summary).not.toHaveProperty("amount")
  })

  it("위험 신호 = sentiment risk 건수, 미연결 = targetType unknown 또는 targetId 없음", () => {
    const summary = summarizeActivityWeek(
      [
        item({ sentiment: "risk" }),
        item({ sentiment: "risk", targetType: "unknown", targetId: null }),
        item({ sentiment: "positive", targetId: null }),
        item({ sentiment: "neutral", targetId: "  " }),
        item({ sentiment: "neutral" }),
        item({ sentiment: "risk", occurredAt: "2026-09-01T00:00:00.000Z" }), // 지난 주 — 세지 않음
      ],
      { nowMs: NOW_MS, weekStartsOn: 1 }
    )
    expect(summary.total).toBe(5)
    expect(summary.negativeSentiment).toBe(2)
    expect(summary.unlinked).toBe(3)
  })

  it("빈 입력이면 전부 0 이고 라벨은 유지", () => {
    const summary = summarizeActivityWeek([], { nowMs: NOW_MS })
    expect(summary.total).toBe(0)
    expect(summary.negativeSentiment).toBe(0)
    expect(summary.unlinked).toBe(0)
    expect(summary.weekLabel).toBe("9/14–9/20")
  })
})

describe("kstDayDiff", () => {
  it("KST 달력일 기준 — 어제 -1 · 오늘 0 · 내일 +1 · 없음/파싱 실패 null", () => {
    expect(kstDayDiff("2026-09-15T14:59:00.000Z", NOW_MS)).toBe(-1) // 화 23:59 KST
    expect(kstDayDiff("2026-09-15T16:00:00.000Z", NOW_MS)).toBe(0) // 수 01:00 KST
    expect(kstDayDiff("2026-09-16T14:59:00.000Z", NOW_MS)).toBe(0) // 수 23:59 KST
    expect(kstDayDiff("2026-09-16T15:00:00.000Z", NOW_MS)).toBe(1) // 목 00:00 KST
    expect(kstDayDiff(null, NOW_MS)).toBeNull()
    expect(kstDayDiff("nope", NOW_MS)).toBeNull()
  })
})

describe("isActivityWeekSummaryPartial", () => {
  const summary = summarizeActivityWeek([], { nowMs: NOW_MS })

  it("다음 페이지가 있고 가장 오래된 행이 아직 이번 주 안이면 하한값(partial)", () => {
    const rows = [item({ occurredAt: "2026-09-16T00:00:00.000Z" }), item({ occurredAt: "2026-09-14T00:00:00.000Z" })]
    expect(isActivityWeekSummaryPartial(rows, summary, true)).toBe(true)
  })

  it("다음 페이지가 있어도 지난 주 행까지 내려왔으면 이번 주는 다 덮은 것", () => {
    const rows = [item({ occurredAt: "2026-09-16T00:00:00.000Z" }), item({ occurredAt: "2026-09-10T00:00:00.000Z" })]
    expect(isActivityWeekSummaryPartial(rows, summary, true)).toBe(false)
  })

  it("다음 페이지가 없거나 행이 없으면 false", () => {
    expect(isActivityWeekSummaryPartial([item()], summary, false)).toBe(false)
    expect(isActivityWeekSummaryPartial([], summary, true)).toBe(false)
  })
})
