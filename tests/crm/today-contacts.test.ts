import { describe, expect, it } from "vitest"

import { extractTodayContacts, TODAY_CONTACTS_LIMIT, type TodayContactEvent } from "@/lib/crm/today-contacts"

// 기획 §14.2 A1 — 오늘(KST) 기록 대상 추출. 순수 함수라 실제 시각 대신 고정된 nowMs를 준다.

// 2026-09-21 낮(KST) 기준 — KST 자정은 UTC 전날 15:00.
const NOW_MS = new Date("2026-09-21T05:00:00.000Z").getTime() // KST 2026-09-21 14:00
const TODAY_KST_MORNING = "2026-09-21T00:30:00.000Z" // KST 09:30(오늘)
const TODAY_KST_LATE = "2026-09-21T14:59:00.000Z" // KST 23:59(오늘, 자정 직전)
const YESTERDAY_KST_LATE = "2026-09-20T14:59:00.000Z" // KST 2026-09-20 23:59(어제, 경계 밖)
const TODAY_KST_JUST_AFTER_MIDNIGHT = "2026-09-20T15:00:00.000Z" // KST 2026-09-21 00:00(오늘 자정, 경계 포함)

function event(overrides: Partial<TodayContactEvent> = {}): TodayContactEvent {
  return {
    targetType: "lead",
    targetId: "lead-1",
    targetLabel: "테스트 학원",
    occurredAt: TODAY_KST_MORNING,
    ...overrides,
  }
}

describe("extractTodayContacts", () => {
  it("오늘(KST) occurredAt을 가진 연결 대상만 남긴다", () => {
    const rows: TodayContactEvent[] = [
      event({ occurredAt: TODAY_KST_MORNING }),
      event({ targetId: "lead-2", targetLabel: "어제 학원", occurredAt: YESTERDAY_KST_LATE }),
    ]
    const result = extractTodayContacts(rows, NOW_MS)
    expect(result.map((c) => c.targetId)).toEqual(["lead-1"])
  })

  it("KST 자정 경계를 포함/배제한다(00:00 포함, 전날 23:59 제외)", () => {
    const rows: TodayContactEvent[] = [
      event({ targetId: "lead-midnight", occurredAt: TODAY_KST_JUST_AFTER_MIDNIGHT }),
      event({ targetId: "lead-yesterday", occurredAt: YESTERDAY_KST_LATE }),
      event({ targetId: "lead-late", occurredAt: TODAY_KST_LATE }),
    ]
    const ids = extractTodayContacts(rows, NOW_MS).map((c) => c.targetId)
    expect(ids).toContain("lead-midnight")
    expect(ids).toContain("lead-late")
    expect(ids).not.toContain("lead-yesterday")
  })

  it("같은 대상은 중복 제거하고 가장 최근 occurredAt만 남긴다", () => {
    const rows: TodayContactEvent[] = [
      event({ occurredAt: "2026-09-21T01:00:00.000Z" }),
      event({ occurredAt: "2026-09-21T03:00:00.000Z" }), // 더 최근
      event({ occurredAt: "2026-09-21T00:30:00.000Z" }),
    ]
    const result = extractTodayContacts(rows, NOW_MS)
    expect(result).toHaveLength(1)
    expect(result[0]?.occurredAt).toBe("2026-09-21T03:00:00.000Z")
  })

  it("최근순으로 정렬하고 상한(4)에서 자른다", () => {
    const rows: TodayContactEvent[] = Array.from({ length: 6 }, (_, i) =>
      event({ targetId: `lead-${i}`, targetLabel: `학원 ${i}`, occurredAt: `2026-09-21T0${i}:00:00.000Z` })
    )
    const result = extractTodayContacts(rows, NOW_MS)
    expect(TODAY_CONTACTS_LIMIT).toBe(4)
    expect(result).toHaveLength(4)
    // 가장 늦은(최근) occurredAt부터: lead-5, lead-4, lead-3, lead-2
    expect(result.map((c) => c.targetId)).toEqual(["lead-5", "lead-4", "lead-3", "lead-2"])
  })

  it("targetType이 customer/deal/unknown이거나 targetId·targetLabel이 비어 있으면 건너뛴다", () => {
    const rows: TodayContactEvent[] = [
      event({ targetType: "customer", targetId: "c-1", targetLabel: "고객V2" }),
      event({ targetType: "deal", targetId: "d-1", targetLabel: "딜" }),
      event({ targetType: "unknown", targetId: null, targetLabel: null }),
      event({ targetType: "lead", targetId: null, targetLabel: "아이디 없음" }),
      event({ targetType: "neo_account", targetId: "acc-1", targetLabel: "" }),
    ]
    expect(extractTodayContacts(rows, NOW_MS)).toEqual([])
  })

  it("neo_account 대상도 함께 뽑는다", () => {
    const rows: TodayContactEvent[] = [event({ targetType: "neo_account", targetId: "acc-1", targetLabel: "네오 학원" })]
    const result = extractTodayContacts(rows, NOW_MS)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1", name: "네오 학원" })
  })

  it("빈 입력은 빈 배열", () => {
    expect(extractTodayContacts([], NOW_MS)).toEqual([])
  })
})
