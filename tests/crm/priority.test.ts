import { describe, expect, it } from "vitest"

import { buildLeadPriorityItem, buildNeoAccountPriorityItem, sortPriorityItems } from "@/lib/crm/priority"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"

const NOW = new Date("2026-06-26T09:00:00.000Z")

function lead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    source: "contact_page",
    name: "홍길동",
    org: "테스트 학원",
    email: "lead@example.com",
    phone: "010-0000-0000",
    timestamp: "2026-06-24T08:00:00.000Z",
    status: "new",
    ...overrides,
  }
}

function account(overrides: Partial<NeoCrmCustomerRow> = {}): NeoCrmCustomerRow {
  return {
    accountId: "acc-1",
    name: "ClassIn 학원",
    ownerId: "owner-1",
    ownerName: "담당자",
    phone: "010-1111-1111",
    balance: 1200,
    expireAt: "2026-06-30T00:00:00.000Z",
    lastClassAt: "2026-06-20T00:00:00.000Z",
    uid: "u-1",
    orderAmount: 100,
    orderCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    ...overrides,
  }
}

describe("CRM priority rules", () => {
  it("prioritizes unresponded response-target leads after 48 hours", () => {
    const item = buildLeadPriorityItem(lead(), NOW)

    expect(item?.action).toBe("respond_lead")
    expect(item?.bucket).toBe("today")
    expect(item?.severity).toBe("critical")
    expect(item?.reason).toContain("48시간")
    expect(item?.ownerKeys).toEqual([])
  })

  it("keeps converted and closed leads out of the queue", () => {
    expect(buildLeadPriorityItem(lead({ status: "converted" }), NOW)).toBeNull()
    expect(buildLeadPriorityItem(lead({ status: "closed" }), NOW)).toBeNull()
  })

  it("prioritizes accounts that expire within 30 days", () => {
    const item = buildNeoAccountPriorityItem(account(), NOW)

    expect(item?.action).toBe("renew_account")
    expect(item?.bucket).toBe("today")
    expect(item?.reason).toContain("일 내 만료")
    expect(item?.score).toBeGreaterThanOrEqual(90)
    expect(item?.ownerKeys).toEqual(["담당자", "owner-1"])
  })

  it("moves very stale expired accounts into a separate recovery bucket with capped urgency", () => {
    const item = buildNeoAccountPriorityItem(account({ expireAt: "2026-03-01T00:00:00.000Z" }), NOW)

    expect(item?.action).toBe("recover_expired")
    expect(item?.bucket).toBe("stale_recovery")
    expect(item?.bucketLabel).toBe("장기 회복")
    expect(item?.severity).toBe("medium")
    expect(item?.score).toBeLessThan(70)
  })

  it("sorts higher score before older due date", () => {
    const low = buildLeadPriorityItem(
      lead({ id: "low", timestamp: "2026-06-26T08:00:00.000Z", source: "newsletter" }),
      NOW
    )
    const high = buildNeoAccountPriorityItem(account({ accountId: "high", expireAt: "2026-06-25T00:00:00.000Z" }), NOW)

    const sorted = sortPriorityItems([low, high].filter((item): item is NonNullable<typeof item> => Boolean(item)))

    expect(sorted[0]?.id).toBe("neo:high")
  })

  it("keeps today's operational work ahead of long-stale recovery", () => {
    const todayLead = buildLeadPriorityItem(
      lead({ id: "today", timestamp: "2026-06-26T08:00:00.000Z", source: "contact_page" }),
      NOW
    )
    const staleAccount = buildNeoAccountPriorityItem(
      account({ accountId: "stale", expireAt: "2026-01-01T00:00:00.000Z" }),
      NOW
    )

    const sorted = sortPriorityItems(
      [staleAccount, todayLead].filter((item): item is NonNullable<typeof item> => Boolean(item))
    )

    expect(sorted[0]?.id).toBe("lead:today")
    expect(sorted[1]?.bucket).toBe("stale_recovery")
  })
})
