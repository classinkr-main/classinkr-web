import { describe, expect, it } from "vitest"

import {
  buildLeadContactEventInput,
  leadContactEventTitle,
  leadContactNextActions,
} from "@/lib/crm/lead-contact-event"
import type { ContactLogRecord } from "@/lib/repositories/contact-logs"

function makeLog(overrides: Partial<ContactLogRecord> = {}): ContactLogRecord {
  return {
    id: "log-1",
    lead_id: "lead-7",
    type: "call",
    result: "answered",
    notes: "도입 일정 논의",
    contacted_at: "2026-06-27T01:00:00.000Z",
    contacted_by: "김지사",
    ...overrides,
  }
}

describe("leadContactEventTitle", () => {
  it("combines type and result labels", () => {
    expect(leadContactEventTitle({ type: "call", result: "no_answer" })).toBe("전화 · 부재")
    expect(leadContactEventTitle({ type: "kakao", result: "meeting_set" })).toBe("카카오 · 미팅 확정")
    expect(leadContactEventTitle({ type: "email", result: null })).toBe("이메일")
  })
})

describe("leadContactNextActions", () => {
  it("promotes only callback and meeting commitments", () => {
    expect(leadContactNextActions({ result: "callback", contacted_by: "김지사" })).toEqual([
      { title: "콜백 약속 이행", ownerName: "김지사", dueAt: null, done: false },
    ])
    expect(leadContactNextActions({ result: "meeting_set", contacted_by: null })[0]?.title).toBe("미팅 준비 및 진행")
    expect(leadContactNextActions({ result: "no_answer", contacted_by: "김지사" })).toEqual([])
    expect(leadContactNextActions({ result: "answered", contacted_by: "김지사" })).toEqual([])
  })
})

describe("buildLeadContactEventInput", () => {
  it("mirrors a contact log into a lead-targeted CRM event", () => {
    const input = buildLeadContactEventInput(makeLog({ result: "meeting_set" }), "테스트 학원")
    expect(input).toMatchObject({
      targetType: "lead",
      targetId: "lead-7",
      targetLabel: "테스트 학원",
      sourceType: "lead_contact_log",
      sourceId: "log-1",
      occurredAt: "2026-06-27T01:00:00.000Z",
      title: "전화 · 미팅 확정",
      body: "도입 일정 논의",
      ownerName: "김지사",
      sentiment: "positive",
    })
    expect(input.nextActions).toHaveLength(1)
  })

  it("keeps no_answer neutral with no follow-up task", () => {
    const input = buildLeadContactEventInput(makeLog({ result: "no_answer", notes: null }), null)
    expect(input.sentiment).toBe("neutral")
    expect(input.nextActions).toEqual([])
    expect(input.body).toBeNull()
    expect(input.targetLabel).toBeNull()
  })
})
