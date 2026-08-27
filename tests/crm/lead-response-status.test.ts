import { describe, expect, it } from "vitest"

import {
  isLeadAwaitingResponse,
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
