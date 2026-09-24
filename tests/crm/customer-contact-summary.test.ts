/**
 * CT9 — 고객 360 "마지막 연락 · 다음 연락" 순수 읽기 모델(lib/crm/customer-contact-summary.ts).
 * 마지막 연락은 통합 고객 목록(CT8, lib/crm/last-contact.ts)과 같은 정의·표기를 써야 한다 — 두 화면의
 * 일수·원천·채널 문구가 같다는 것을 여기서 고정한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { computeCustomerHealth } from "@/lib/crm/customer-health"
import {
  buildCustomerContactSummary,
  CONTACT_SUMMARY_COMPASS_DOWN_CAPTION,
  contactSummaryCaptions,
  formatLastContactText,
  formatNextContactText,
  HUMAN_CONTACT_EVENT_SOURCE_TYPES,
  isCompassContactActivity,
  isHumanContactEventSource,
  isLeadEraRow,
  lastContactCalendarDaysAgo,
  lastContactDaysForHealth,
  lastContactTone,
  nextContactTone,
  pickNextContact,
  taskNextContactAt,
  type BuildCustomerContactSummaryInput,
  type ContactEventLike,
} from "@/lib/crm/customer-contact-summary"
import {
  COMPASS_CONTACT_KINDS,
  describeLastContact,
  HOME_CONTACT_EVENT_SOURCE_TYPES,
} from "@/lib/crm/last-contact"

// 2026-09-25 12:00 KST
const NOW = new Date("2026-09-25T03:00:00.000Z")

function event(overrides: Partial<ContactEventLike> = {}): ContactEventLike {
  return {
    targetType: "neo_account",
    sourceType: "call",
    occurredAt: "2026-09-22T03:00:00.000Z",
    ownerName: "김지사",
    createdBy: null,
    ...overrides,
  }
}

function input(overrides: Partial<BuildCustomerContactSummaryInput> = {}): BuildCustomerContactSummaryInput {
  return {
    now: NOW,
    customerSource: "neo_account",
    events: [],
    compassEntries: [],
    compassDown: false,
    tasks: [],
    ...overrides,
  }
}

describe("정의 — 통합 목록(CT8 last-contact.ts)·crm-events.ts 와 같은 목록", () => {
  it("사람 연락 종류는 last-contact.ts 목록 그대로이고 crm-events.ts RESPONSE_SOURCE_TYPES 와 같다", () => {
    expect(HUMAN_CONTACT_EVENT_SOURCE_TYPES).toBe(HOME_CONTACT_EVENT_SOURCE_TYPES)
    const source = readFileSync(join(process.cwd(), "lib/repositories/crm-events.ts"), "utf8")
    const match = source.match(/const RESPONSE_SOURCE_TYPES = \[([^\]]*)\]/)
    expect(match).not.toBeNull()
    const listed = [...(match?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
    expect([...HUMAN_CONTACT_EVENT_SOURCE_TYPES].sort()).toEqual(listed.sort())
  })

  it("내부 메모·자동 유입·동기화·캘린더는 Home 사람 연락이 아니다", () => {
    for (const type of ["manual_note", "site_inflow", "sheet", "external_crm", "calendar_event", null, ""]) {
      expect(isHumanContactEventSource(type)).toBe(false)
    }
    expect(isHumanContactEventSource("lead_contact_log")).toBe(true)
  })

  it("Compass 는 last-contact.ts 의 사람 활동 종류만, 자동 작성자는 뺀다(작성자 없음은 사람 기록)", () => {
    for (const kind of COMPASS_CONTACT_KINDS) expect(isCompassContactActivity(kind, "진소망")).toBe(true)
    expect(isCompassContactActivity("meeting", null)).toBe(true)
    for (const kind of ["alimtalk", "inflow", "import", "system", "action", null]) {
      expect(isCompassContactActivity(kind, "진소망")).toBe(false)
    }
    expect(isCompassContactActivity("call", "BD시트")).toBe(false)
    expect(isCompassContactActivity("sms", "시트 동기화")).toBe(false)
  })

  it("리드 시절 = NEO 계정 360 의 target_type lead 행뿐이다", () => {
    expect(isLeadEraRow("neo_account", "lead")).toBe(true)
    expect(isLeadEraRow("neo_account", "neo_account")).toBe(false)
    expect(isLeadEraRow("lead", "lead")).toBe(false)
  })
})

describe("마지막 연락 — 통합 목록 셀과 같은 문구", () => {
  it("Home 메모는 건너뛰고 더 최근 Compass 콜을 고른다 — 목록 셀(describeLastContact)과 뒷부분이 같다", () => {
    const summary = buildCustomerContactSummary(
      input({
        events: [
          event({ sourceType: "manual_note", occurredAt: "2026-09-24T03:00:00.000Z" }),
          event({ sourceType: "call", occurredAt: "2026-09-10T03:00:00.000Z" }),
        ],
        compassEntries: [
          { kind: "alimtalk", occurredAt: "2026-09-24T09:00:00.000Z", actor: null },
          { kind: "call", occurredAt: "2026-09-22T03:00:00.000Z", actor: "진소망" },
        ],
      })
    )
    expect(summary.last).toMatchObject({ origin: "compass", source: "compass", channel: "call", actor: "진소망", daysAgo: 3 })
    expect(formatLastContactText(summary)).toBe("마지막 연락 3일 전 · Compass 콜 · 진소망")

    const listCell = describeLastContact(
      {
        lastContactAt: summary.last?.at,
        lastContactSource: summary.last?.source,
        lastContactChannel: summary.last?.channel,
        lastContactActor: summary.last?.actor,
      },
      NOW.getTime()
    )
    expect(formatLastContactText(summary)).toBe(`마지막 연락 ${listCell.text}`)
  })

  it("같은 시각의 미러 기록과 연락 로그 원본은 로그를 남긴다(목록과 같은 원천 순위)", () => {
    const at = "2026-09-24T03:00:00.000Z"
    const summary = buildCustomerContactSummary(
      input({
        customerSource: "lead",
        events: [event({ targetType: "lead", sourceType: "lead_contact_log", occurredAt: at })],
        contactLogs: [{ type: "call", contactedAt: at, contactedBy: "박매니저" }],
      })
    )
    expect(summary.last).toMatchObject({ source: "home_log", channel: "call", origin: "home" })
    expect(formatLastContactText(summary)).toBe("마지막 연락 어제 · 콜 · 박매니저")
  })

  it("NEO 계정 360 에서 연결 리드 기록·로그는 채널 앞에 '리드 시절'을 붙인다", () => {
    const summary = buildCustomerContactSummary(
      input({ contactLogs: [{ type: "kakao", contactedAt: "2026-09-20T03:00:00.000Z", contactedBy: "박매니저" }] })
    )
    expect(summary.last?.origin).toBe("lead_era")
    expect(formatLastContactText(summary)).toBe("마지막 연락 5일 전 · 리드 시절 카톡 · 박매니저")

    const fromEvent = buildCustomerContactSummary(
      input({ events: [event({ targetType: "lead", sourceType: "meeting_minutes", occurredAt: "2026-09-23T03:00:00.000Z" })] })
    )
    expect(formatLastContactText(fromEvent)).toBe("마지막 연락 2일 전 · 리드 시절 미팅 기록 · 김지사")
  })

  it("표기는 목록과 같은 KST 달력일, 경과 일수(daysAgo)는 24시간 단위 그대로", () => {
    const summary = buildCustomerContactSummary(
      input({ events: [event({ occurredAt: "2026-09-24T05:00:00.000Z" })] }) // 22시간 전 = 어제 14:00 KST
    )
    expect(summary.last?.daysAgo).toBe(0)
    expect(lastContactCalendarDaysAgo(summary)).toBe(1)
    expect(formatLastContactText(summary)).toBe("마지막 연락 어제 · 콜 기록 · 김지사")
    // 건강도 입력은 경과 일수(판정 의미 유지).
    expect(lastContactDaysForHealth(summary)).toBe(0)
  })

  it("자정 경계 — 어제 23:30 연락을 오늘 08:00 에 보면 '어제'(목록 셀과 같은 문구)", () => {
    const morning = new Date("2026-09-25T08:00:00+09:00")
    const summary = buildCustomerContactSummary(
      input({
        now: morning,
        compassEntries: [{ kind: "call", occurredAt: "2026-09-24T23:30:00+09:00", actor: "진소망" }],
      })
    )
    expect(summary.last?.daysAgo).toBe(0)
    expect(formatLastContactText(summary)).toBe("마지막 연락 어제 · Compass 콜 · 진소망")
    const listCell = describeLastContact(
      {
        lastContactAt: summary.last?.at,
        lastContactSource: summary.last?.source,
        lastContactChannel: summary.last?.channel,
        lastContactActor: summary.last?.actor,
      },
      morning.getTime()
    )
    expect(formatLastContactText(summary)).toBe(`마지막 연락 ${listCell.text}`)

    // 같은 날 00:10 연락을 23:50 에 보면 '오늘'.
    const late = buildCustomerContactSummary(
      input({
        now: new Date("2026-09-25T23:50:00+09:00"),
        events: [event({ occurredAt: "2026-09-25T00:10:00+09:00" })],
      })
    )
    expect(formatLastContactText(late)).toBe("마지막 연락 오늘 · 콜 기록 · 김지사")
  })

  it("basisAt 을 읽을 수 없는 옛 페이로드는 경과 일수로 물러선다", () => {
    const summary = buildCustomerContactSummary(input({ events: [event({ occurredAt: "2026-09-20T03:00:00.000Z" })] }))
    const legacy = { ...summary, basisAt: "" }
    expect(lastContactCalendarDaysAgo(legacy)).toBe(5)
    expect(formatLastContactText(legacy)).toBe("마지막 연락 5일 전 · 콜 기록 · 김지사")
    expect(lastContactCalendarDaysAgo(null)).toBeNull()
  })

  it("신호색은 경과 일수 축 — 표기가 '14일 전'이어도 경과 14일 미만이면 신호 없음(건강도 감점과 같다)", () => {
    // 14일 전 23:30 KST 연락을 오늘 08:00 KST 에 본다 — 달력 14일, 경과 13.35일.
    const morning = new Date("2026-09-25T08:00:00+09:00")
    const summary = buildCustomerContactSummary(
      input({ now: morning, events: [event({ occurredAt: "2026-09-11T23:30:00+09:00" })] })
    )
    expect(formatLastContactText(summary)).toBe("마지막 연락 14일 전 · 콜 기록 · 김지사")
    expect(summary.last?.daysAgo).toBe(13)
    expect(lastContactTone(summary)).toBeNull()
    expect(computeCustomerHealth({ lastContactDays: lastContactDaysForHealth(summary) }).score).toBe(100)
  })

  it("기록이 없으면 '기록 없음', 건강도 입력은 null(모름 — 감점 없음)", () => {
    const summary = buildCustomerContactSummary(input())
    expect(summary.last).toBeNull()
    expect(formatLastContactText(summary)).toBe("마지막 연락 기록 없음")
    expect(lastContactDaysForHealth(summary)).toBeNull()
    expect(lastContactTone(summary)).toBeNull()
  })

  it("신호색은 14일+ 경고, 21일+ 위험이고 건강도 감점 기준과 같다", () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
    const s13 = buildCustomerContactSummary(input({ events: [event({ occurredAt: at(13) })] }))
    const s14 = buildCustomerContactSummary(input({ events: [event({ occurredAt: at(14) })] }))
    const s21 = buildCustomerContactSummary(input({ events: [event({ occurredAt: at(21) })] }))
    expect(lastContactTone(s13)).toBeNull()
    expect(lastContactTone(s14)).toBe("warning")
    expect(lastContactTone(s21)).toBe("danger")
    const healthOf = (summary: typeof s13) => computeCustomerHealth({ lastContactDays: lastContactDaysForHealth(summary) }).score
    expect(healthOf(s13)).toBe(100)
    expect(healthOf(s14)).toBe(92)
    expect(healthOf(s21)).toBe(85)
  })

  it("Compass 가 끊기면 캡션으로 말하고, 일수는 Home 기록으로 계산한 값 그대로(통합 목록과 같은 처리)", () => {
    const summary = buildCustomerContactSummary(
      input({ compassDown: true, events: [event({ occurredAt: "2026-09-01T03:00:00.000Z" })] })
    )
    expect(summary.last?.daysAgo).toBe(24)
    expect(contactSummaryCaptions(summary)).toEqual([CONTACT_SUMMARY_COMPASS_DOWN_CAPTION])
    expect(CONTACT_SUMMARY_COMPASS_DOWN_CAPTION).toBe("Compass 연결 끊김 — Home 기록만")
    expect(lastContactDaysForHealth(summary)).toBe(24)
  })
})

describe("다음 연락", () => {
  it("할 일은 열림이면 기한, 미룸이면 미룬 날, 완료·취소는 후보가 아니다", () => {
    expect(taskNextContactAt({ title: "a", status: "open", dueAt: "2026-09-26T00:00:00.000Z", snoozedUntil: null })).toBe(
      "2026-09-26T00:00:00.000Z"
    )
    expect(
      taskNextContactAt({
        title: "a",
        status: "snoozed",
        dueAt: "2026-09-20T00:00:00.000Z",
        snoozedUntil: "2026-09-28T00:00:00.000Z",
      })
    ).toBe("2026-09-28T00:00:00.000Z")
    expect(taskNextContactAt({ title: "a", status: "done", dueAt: "2026-09-26T00:00:00.000Z", snoozedUntil: null })).toBeNull()
    expect(taskNextContactAt({ title: "a", status: "open", dueAt: null, snoozedUntil: null })).toBeNull()
  })

  it("팔로업·할 일·Compass 다음 액션 중 가장 이른 것을 원천과 함께 적는다", () => {
    const summary = buildCustomerContactSummary(
      input({
        followUpAt: "2026-09-30T00:00:00.000Z",
        tasks: [{ title: "견적 회신", status: "open", dueAt: "2026-09-27T01:00:00.000Z", snoozedUntil: null }],
        compassNextActionAts: ["2026-09-29T00:00:00.000Z"],
      })
    )
    expect(summary.next).toMatchObject({ kind: "task", title: "견적 회신", overdue: false, daysUntil: 2 })
    expect(formatNextContactText(summary)).toBe("다음 연락 9/27 · 할 일 · 견적 회신")
  })

  it("오늘·내일은 말로, 기한 지난 것은 '기한 지남' + 위험 톤", () => {
    const today = buildCustomerContactSummary(input({ followUpAt: "2026-09-25T08:00:00.000Z" }))
    expect(formatNextContactText(today)).toBe("다음 연락 오늘 · 팔로업")
    const tomorrow = buildCustomerContactSummary(input({ compassNextActionAts: ["2026-09-26T02:00:00.000Z"] }))
    expect(formatNextContactText(tomorrow)).toBe("다음 연락 내일 · Compass 다음 액션")
    const overdue = buildCustomerContactSummary(
      input({ tasks: [{ title: "콜백", status: "open", dueAt: "2026-09-20T00:00:00.000Z", snoozedUntil: null }] })
    )
    expect(overdue.next?.overdue).toBe(true)
    expect(formatNextContactText(overdue)).toBe("다음 연락 9/20 · 할 일 · 콜백 · 기한 지남")
    expect(nextContactTone(overdue)).toBe("danger")
    expect(nextContactTone(today)).toBeNull()
  })

  it("오늘 안의 이른 시각은 기한 지남이 아니다(KST 날 기준)", () => {
    const summary = buildCustomerContactSummary(input({ followUpAt: "2026-09-25T00:00:00.000Z" })) // 9/25 09:00 KST
    expect(summary.next?.overdue).toBe(false)
    expect(summary.next?.daysUntil).toBe(0)
  })

  it("동시각이면 팔로업 → 할 일 → Compass 순이고, 후보가 없으면 '일정 없음'", () => {
    const at = "2026-09-26T00:00:00.000Z"
    expect(
      pickNextContact([
        { at, kind: "compass_next_action", title: null },
        { at, kind: "follow_up", title: null },
      ])?.kind
    ).toBe("follow_up")
    expect(formatNextContactText(buildCustomerContactSummary(input()))).toBe("다음 연락 일정 없음")
  })
})
