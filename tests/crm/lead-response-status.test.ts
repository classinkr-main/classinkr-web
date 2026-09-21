import { describe, expect, it } from "vitest"

import {
  isLeadAwaitingResponse,
  isReinflowAwaitingContact,
  summarizeLeadResponseStatus,
  type LeadResponseStatusRecord,
} from "@/lib/crm/lead-response-status"

const NOW = new Date("2026-08-27T12:00:00.000Z")

function lead(overrides: Partial<LeadResponseStatusRecord> = {}): LeadResponseStatusRecord {
  return {
    source: "contact_page",
    status: "new",
    name: "운영 리드",
    org: "운영 학원",
    email: "ops@example.com",
    timestamp: "2026-08-26T11:00:00.000Z",
    ...overrides,
  }
}

describe("lead response status", () => {
  it("treats new target-source records as a proxy and excludes test leads", () => {
    expect(isLeadAwaitingResponse(lead())).toBe(true)
    expect(isLeadAwaitingResponse(lead({ status: "contacted" }))).toBe(false)
    expect(isLeadAwaitingResponse(lead({ source: "newsletter" }))).toBe(false)
    expect(isLeadAwaitingResponse(lead({ email: "test@meta.com" }))).toBe(false)
    expect(isLeadAwaitingResponse(lead({ email: "test+e2e@example.com" }))).toBe(false)
    expect(isLeadAwaitingResponse(lead({ name: "<test lead: dummy data>" }))).toBe(false)
  })

  it("counts 24h and 48h boundaries from the same filtered operating set", () => {
    const summary = summarizeLeadResponseStatus(
      [
        lead({ timestamp: "2026-08-26T12:00:00.000Z" }),
        lead({ timestamp: "2026-08-25T12:00:00.000Z" }),
        lead({ timestamp: "2026-08-20T12:00:00.000Z", email: "test@meta.com" }),
      ],
      NOW
    )
    expect(summary).toEqual({ awaitingResponseCount: 2, over24hCount: 2, over48hCount: 1 })
  })
})

describe("reinflow-aware elapsed time", () => {
  it("uses the later of last_inflow_at and timestamp as the elapsed-time clock", () => {
    // 최초 유입은 NOW 기준 72h 전(48h 훌쩍 초과)이지만 last_inflow_at이 1h 전이면 "막
    // 재유입된" 것으로 세야 한다 — 최초 유입 시각만으로 방치 여부를 판단하면 안 된다.
    const summary = summarizeLeadResponseStatus(
      [
        lead({
          timestamp: "2026-08-24T12:00:00.000Z",
          last_inflow_at: "2026-08-27T11:00:00.000Z",
        }),
      ],
      NOW
    )
    expect(summary).toEqual({ awaitingResponseCount: 1, over24hCount: 0, over48hCount: 0 })
  })

  it("falls back to timestamp when last_inflow_at predates it or is missing", () => {
    const summary = summarizeLeadResponseStatus(
      [
        // last_inflow_at이 timestamp보다 이르다 — max는 timestamp(NOW 기준 30h 전)여야 한다.
        lead({ timestamp: "2026-08-26T06:00:00.000Z", last_inflow_at: "2026-08-25T20:00:00.000Z" }),
        // last_inflow_at 자체가 없다 — timestamp(NOW 기준 30h 전) 그대로 쓴다.
        lead({ timestamp: "2026-08-26T06:00:00.000Z", last_inflow_at: undefined }),
      ],
      NOW
    )
    expect(summary).toEqual({ awaitingResponseCount: 2, over24hCount: 2, over48hCount: 0 })
  })
})

describe("isReinflowAwaitingContact", () => {
  it("is false when status is not contacted or last_inflow_at is missing", () => {
    expect(
      isReinflowAwaitingContact(lead({ status: "new", last_inflow_at: "2026-08-27T00:00:00.000Z" }), null)
    ).toBe(false)
    expect(
      isReinflowAwaitingContact(lead({ status: "contacted", last_inflow_at: undefined }), null)
    ).toBe(false)
  })

  it("is true when there is no contact record at all after a reinflow", () => {
    const reinflowed = lead({ status: "contacted", last_inflow_at: "2026-08-27T00:00:00.000Z" })
    expect(isReinflowAwaitingContact(reinflowed, null)).toBe(true)
    expect(isReinflowAwaitingContact(reinflowed, undefined)).toBe(true)
  })

  it("compares the last contact time against last_inflow_at", () => {
    // Compass lib/leadFilter.ts UNCONTACTED 조건 이식 — "마지막 유입 이후 접촉 없음".
    const reinflowed = lead({ status: "contacted", last_inflow_at: "2026-08-27T00:00:00.000Z" })
    expect(isReinflowAwaitingContact(reinflowed, "2026-08-26T23:00:00.000Z")).toBe(true) // 재유입보다 이른 컨택 — 재유입 후 미접촉
    expect(isReinflowAwaitingContact(reinflowed, "2026-08-27T01:00:00.000Z")).toBe(false) // 재유입 후 컨택함
    expect(isReinflowAwaitingContact(reinflowed, "2026-08-27T00:00:00.000Z")).toBe(false) // 재유입과 동시 — 미접촉으로 보지 않는다
  })
})
