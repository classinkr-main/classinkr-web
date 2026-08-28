import { describe, expect, it } from "vitest"

import {
  buildLeadAssignmentProfile,
  formatLeadAssignmentProfile,
} from "@/lib/crm/lead-assignment-profile"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = new Date("2026-08-27T12:00:00.000Z").getTime()

function lead(id: string, hoursAgo: number, overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id,
    source: "meta_lead_ads",
    status: "new",
    timestamp: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    name: id,
    ...overrides,
  }
}

describe("lead bulk assignment preflight profile", () => {
  it("splits confirmed state and SLA recovery age bands", () => {
    const profile = buildLeadAssignmentProfile(
      [
        lead("fresh", 12, { confirmed_at: "2026-08-27T01:00:00.000Z" }),
        lead("24h", 30),
        lead("2d", 72),
        lead("week", 24 * 10),
        lead("month", 24 * 31),
      ],
      NOW
    )

    expect(profile).toMatchObject({
      total: 5,
      confirmed: 1,
      unconfirmed: 4,
      ageBands: {
        under24h: 1,
        from24To48h: 1,
        from2To7d: 1,
        from7To30d: 1,
        over30d: 1,
        unknown: 0,
      },
    })
  })

  it("counts connected duplicate clusters once across phone and email", () => {
    const profile = buildLeadAssignmentProfile(
      [
        lead("a", 30, { phone: "010-1111-2222" }),
        lead("b", 40, { phone: "01011112222", email: "same@example.com" }),
        lead("c", 50, { email: "SAME@example.com" }),
        lead("d", 60, { phone: "010-9999-8888" }),
      ],
      NOW
    )

    expect(profile).toMatchObject({ duplicateClusters: 1, duplicateRows: 3 })
    expect(formatLeadAssignmentProfile(profile)).toContain("연락처 중복 1묶음 · 3행")
  })
})
