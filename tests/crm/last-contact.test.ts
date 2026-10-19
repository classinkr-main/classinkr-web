import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  COMPASS_CONTACT_EXCLUDED_ACTORS,
  COMPASS_CONTACT_KINDS,
  HOME_CONTACT_EVENT_SOURCE_TYPES,
  buildCompassContactIndex,
  buildHomeContactIndex,
  contactPhoneKey,
  contactTargetKey,
  describeLastContact,
  lastContactCalendarDays,
  lastContactChannelLabel,
  lastContactDays,
  pickLatestContact,
  type LastContactFact,
} from "@/lib/crm/last-contact"
import { COMPASS_AUTOMATED_ACTORS, COMPASS_HUMAN_ACTIVITY_KINDS } from "@/lib/compass/lead-contact-sync"
import { unifiedRowHealthInput } from "@/lib/crm/customer-health"

const NOW = new Date("2026-09-25T03:00:00.000Z").getTime()
const DAY = 86_400_000
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()

describe("원천 목록 계약 — 복제 대신 같은 목록을 쓴다", () => {
  it("Home 연락 기록 종류는 crm-events 의 RESPONSE_SOURCE_TYPES 와 같다(내부 메모 제외)", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/repositories/crm-events.ts"), "utf8")
    const match = /const RESPONSE_SOURCE_TYPES = \[([^\]]+)\] as const/.exec(source)
    expect(match).not.toBeNull()
    const values = [...(match?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((item) => item[1])
    expect([...HOME_CONTACT_EVENT_SOURCE_TYPES]).toEqual(values)
    expect(HOME_CONTACT_EVENT_SOURCE_TYPES).not.toContain("manual_note")
  })

  it("대상 키 형식은 crm-events crmContactTargetKey(`${type}:${id}`)와 같다", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/repositories/crm-events.ts"), "utf8")
    expect(source).toContain("return `${targetType}:${targetId}`")
    expect(contactTargetKey("neo_account", "A1")).toBe("neo_account:A1")
  })

  it("Compass 사람 활동 kind·자동 작성자 목록은 리드 상태 자동 반영과 같은 것을 재사용한다", () => {
    expect(COMPASS_CONTACT_KINDS).toBe(COMPASS_HUMAN_ACTIVITY_KINDS)
    expect(COMPASS_CONTACT_EXCLUDED_ACTORS).toBe(COMPASS_AUTOMATED_ACTORS)
  })
})

describe("pickLatestContact — 고객별 max", () => {
  const log: LastContactFact = { at: iso(3), source: "home_log", channel: "call", actor: "김담당" }
  const compass: LastContactFact = { at: iso(1), source: "compass", channel: "call", actor: "진소망" }

  it("가장 최근 연락을 고른다(원천 무관)", () => {
    expect(pickLatestContact(log, compass)).toBe(compass)
    expect(pickLatestContact(null, undefined, log)).toBe(log)
    expect(pickLatestContact()).toBeNull()
  })

  it("같은 시각이면 세부가 많은 원천(로그 > Compass > 기록 > 시각만)을 남긴다", () => {
    const at = iso(2)
    const homeOnly: LastContactFact = { at, source: "home", channel: null, actor: null }
    const event: LastContactFact = { at, source: "home_event", channel: "call", actor: "김" }
    expect(pickLatestContact(homeOnly, event)).toBe(event)
    expect(pickLatestContact(event, { ...log, at })?.source).toBe("home_log")
  })

  it("해석할 수 없는 시각은 버린다", () => {
    expect(pickLatestContact({ at: "not-a-date", source: "compass", channel: null, actor: null }, log)).toBe(log)
  })
})

describe("buildHomeContactIndex — 로그 + 사람 기록 이벤트", () => {
  it("대상별 최신 연락, 접촉 아닌 종류(manual_note·site_inflow)와 대상 없는 기록은 버린다", () => {
    const index = buildHomeContactIndex(
      [
        { lead_id: "L1", type: "sms", contacted_at: iso(5), contacted_by: "김담당" },
        { lead_id: "L1", type: "call", contacted_at: iso(2), contacted_by: " 박담당 " },
      ],
      [
        { target_type: "lead", target_id: "L1", source_type: "manual_note", occurred_at: iso(0.5), created_by: "X", owner_name: null },
        { target_type: "neo_account", target_id: "N1", source_type: "meeting_minutes", occurred_at: iso(4), created_by: null, owner_name: "이담당" },
        { target_type: "customer", target_id: null, source_type: "call", occurred_at: iso(1), created_by: "Y", owner_name: null },
        { target_type: "neo_account", target_id: "N2", source_type: "site_inflow", occurred_at: iso(1), created_by: "Z", owner_name: null },
      ]
    )
    expect(index.get("lead:L1")).toEqual({ at: iso(2), source: "home_log", channel: "call", actor: "박담당" })
    expect(index.get("neo_account:N1")).toEqual({ at: iso(4), source: "home_event", channel: "meeting_minutes", actor: "이담당" })
    expect(index.has("neo_account:N2")).toBe(false)
    expect(index.size).toBe(2)
  })
})

describe("buildCompassContactIndex — 전화 키별, 자동 작성자 제외", () => {
  it("자동 작성자('BD시트' 등)는 연락이 아니다", () => {
    const index = buildCompassContactIndex([
      { phone_key: "01011112222", occurred_at: iso(1), kind: "note", actor: "BD시트" },
      { phone_key: "01011112222", occurred_at: iso(6), kind: "call", actor: "진소망" },
      { phone_key: "01033334444", occurred_at: iso(2), kind: "sms", actor: null },
    ])
    expect(index.get("01011112222")).toEqual({ at: iso(6), source: "compass", channel: "call", actor: "진소망" })
    expect(index.get("01033334444")?.channel).toBe("sms")
  })

  it("전화 조인 키 — Compass normPhone 과 같게, 9자리 미만은 조인하지 않는다", () => {
    expect(contactPhoneKey("+82 10-1234-5678")).toBe("01012345678")
    expect(contactPhoneKey("010-1234-5678")).toBe("01012345678")
    expect(contactPhoneKey("1234")).toBeNull()
    expect(contactPhoneKey(null)).toBeNull()
  })
})

describe("표시 — '3일 전 · Compass 콜 · 담당명', 없으면 '기록 없음'", () => {
  it("원천·채널 → 표시 이름", () => {
    expect(lastContactChannelLabel("compass", "call")).toBe("Compass 콜")
    expect(lastContactChannelLabel("compass", "stage_change")).toBe("Compass 단계 변경")
    expect(lastContactChannelLabel("home_log", "kakao")).toBe("카톡")
    expect(lastContactChannelLabel("home_event", "meeting_minutes")).toBe("미팅 기록")
    expect(lastContactChannelLabel("home", null)).toBe("Home 기록")
  })

  it("표시 문구는 KST 달력일 — 자정 경계에서 24시간 내림과 갈린다(경과일 의미는 그대로)", () => {
    // 오늘 08:00 KST 에 어제 23:30 KST 연락을 본다 — 경과 8.5시간이지만 "어제".
    const morning = Date.parse("2026-09-25T08:00:00+09:00")
    const lateLastNight = "2026-09-24T23:30:00+09:00"
    expect(lastContactDays(lateLastNight, morning)).toBe(0)
    expect(lastContactCalendarDays(lateLastNight, morning)).toBe(1)
    expect(describeLastContact({ lastContactAt: lateLastNight, lastContactSource: "home_log", lastContactChannel: "call" }, morning).text).toBe(
      "어제 · 콜"
    )
    // 같은 KST 날짜 안이면 23시간 넘게 지났어도 "오늘".
    const nearMidnight = Date.parse("2026-09-25T23:50:00+09:00")
    expect(describeLastContact({ lastContactAt: "2026-09-25T00:10:00+09:00" }, nearMidnight).when).toBe("오늘")
    // 이틀 전 23:59 → 오늘 00:01: 경과 1일(24시간 남짓)이지만 달력으로 "2일 전".
    const justAfterMidnight = Date.parse("2026-09-25T00:01:00+09:00")
    expect(lastContactDays("2026-09-23T23:59:00+09:00", justAfterMidnight)).toBe(1)
    expect(describeLastContact({ lastContactAt: "2026-09-23T23:59:00+09:00" }, justAfterMidnight).when).toBe("2일 전")
    // UTC 날짜로 자르지 않는다 — 09-24 15:30Z = 09-25 00:30 KST 는 09-25 12:00 KST 기준 "오늘".
    expect(lastContactCalendarDays("2026-09-24T15:30:00.000Z", NOW)).toBe(0)
    // 미래 시각(시계 오차)은 0, 기록 없음은 null.
    expect(lastContactCalendarDays(iso(-0.5), NOW)).toBe(0)
    expect(lastContactCalendarDays(null, NOW)).toBeNull()
  })

  it("경과일 — 내림, 기록 없음은 null(0 이 아니다)", () => {
    expect(lastContactDays(iso(3.4), NOW)).toBe(3)
    expect(lastContactDays(iso(0.2), NOW)).toBe(0)
    expect(lastContactDays(null, NOW)).toBeNull()
  })

  it("셀 문구", () => {
    expect(
      describeLastContact(
        { lastContactAt: iso(3), lastContactSource: "compass", lastContactChannel: "call", lastContactActor: "김담당" },
        NOW
      ).text
    ).toBe("3일 전 · Compass 콜 · 김담당")
    expect(describeLastContact({ lastContactAt: iso(0.1), lastContactSource: "home_log", lastContactChannel: "sms" }, NOW).text).toBe(
      "오늘 · 문자"
    )
    expect(describeLastContact({ lastContactAt: null }, NOW)).toEqual({
      hasRecord: false,
      when: "기록 없음",
      detail: null,
      text: "기록 없음",
    })
  })
})

describe("건강도 입력(F3) — 통합 행", () => {
  it("스냅샷 riskLevel 우선, NEO 충전 잔액은 미수가 아니다, 마지막 연락 경과일을 넣는다", () => {
    const input = unifiedRowHealthInput(
      { score: 50, lifecycle: "account_risk", expireAt: null, riskLevel: "watch", lastContactAt: iso(22) },
      NOW
    )
    expect(input.serviceLevel).toBe("watch")
    expect(input.hasOutstanding).toBe(false)
    expect(input.lastContactDays).toBe(22)
    expect(input.riskSeverity).toBe("medium")
  })

  it("riskLevel 이 없으면 라이프사이클로 근사, 연락 기록 없음은 감점 입력 없음", () => {
    const input = unifiedRowHealthInput({ score: 10, lifecycle: "account_risk", expireAt: null }, NOW)
    expect(input.serviceLevel).toBe("soon")
    expect(input.lastContactDays).toBeNull()
  })
})
