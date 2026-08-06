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
    expect(item?.lane).toBe("sales")
    expect(item?.laneLabel).toBe("신규·추가 매출")
    expect(item?.bucket).toBe("today")
    // 오늘 처리 큐에는 남지만 critical 을 독점하지는 않는다 — 살아 있는 거래에 자리를 내준다.
    expect(item?.severity).toBe("high")
    expect(item?.reason).toContain("48시간")
    expect(item?.ownerKeys).toEqual([])
  })

  it("오래 방치된 미응답은 봉우리를 지나 식는다", () => {
    const twoDays = buildLeadPriorityItem(lead(), NOW)
    const twoWeeks = buildLeadPriorityItem(
      lead({ timestamp: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW
    )

    expect(twoWeeks!.score).toBeLessThan(twoDays!.score)
    expect(twoWeeks?.reason).toContain("식음")
  })

  it("연락에 반응한 리드가 방치된 미응답보다 위에 선다", () => {
    const neglected = buildLeadPriorityItem(
      lead({ timestamp: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() }),
      NOW
    )
    const responsive = buildLeadPriorityItem(
      lead({
        id: "responsive",
        status: "contacted",
        source: "demo_modal",
        size: "320",
        confirmed_at: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      NOW,
      {
        engagement: {
          authenticated: true,
          providers: ["google"],
          downloadCount: 2,
          eventCount: 11,
          contactLogCount: 3,
          lastContactAt: new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
          lastActivityAt: new Date(NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }
    )

    expect(responsive!.score).toBeGreaterThan(neglected!.score)
    expect(responsive?.reason).toBe("연락 후 재방문")
  })

  it("keeps converted and closed leads out of the queue", () => {
    expect(buildLeadPriorityItem(lead({ status: "converted" }), NOW)).toBeNull()
    expect(buildLeadPriorityItem(lead({ status: "closed" }), NOW)).toBeNull()
  })

  it("prioritizes accounts that expire within 30 days", () => {
    const item = buildNeoAccountPriorityItem(account(), NOW)

    expect(item?.action).toBe("renew_account")
    expect(item?.lane).toBe("renewal")
    expect(item?.bucket).toBe("today")
    expect(item?.reason).toContain("일 내 만료")
    expect(item?.score).toBeGreaterThanOrEqual(90)
    expect(item?.ownerKeys).toEqual(["담당자", "owner-1"])
  })

  it("만료 경과가 길수록 점수가 오르지 않는다 — 곧 만료될 계정이 두 달 전 만료를 이긴다", () => {
    const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString()
    const expiringSoon = buildNeoAccountPriorityItem(account({ expireAt: days(3) }), NOW)
    const justExpired = buildNeoAccountPriorityItem(account({ expireAt: days(-5) }), NOW)
    const longExpired = buildNeoAccountPriorityItem(account({ expireAt: days(-56) }), NOW)

    // 살릴 수 있는 건이 죽은 건보다 위 — 이전 곡선(82 + 경과일)에서는 사실상 동점이었다.
    expect(expiringSoon!.score).toBeGreaterThan(longExpired!.score)
    expect(justExpired!.score).toBeGreaterThan(longExpired!.score)
    expect(longExpired?.reason).toContain("식음")
  })

  it("moves very stale expired accounts into a separate recovery bucket with capped urgency", () => {
    const item = buildNeoAccountPriorityItem(account({ expireAt: "2026-03-01T00:00:00.000Z" }), NOW)

    expect(item?.action).toBe("recover_expired")
    expect(item?.bucket).toBe("stale_recovery")
    expect(item?.bucketLabel).toBe("장기 회복")
    expect(item?.severity).toBe("medium")
    expect(item?.score).toBeLessThan(70)
  })

  it("prioritizes depleted prepaid balance even when subscription expiry is not near", () => {
    const item = buildNeoAccountPriorityItem(
      account({
        balance: 0,
        expireAt: "2026-12-31T00:00:00.000Z",
        riskLevel: "soon",
        riskReasons: [{ code: "depleted_balance", label: "충전 잔액 소진" }],
      }),
      NOW
    )

    expect(item?.action).toBe("renew_account")
    expect(item?.actionLabel).toBe("충전 안내")
    expect(item?.lane).toBe("customer_care")
    expect(item?.bucket).toBe("today")
    expect(item?.reason).toContain("충전 잔액")
  })

  it("promotes a purchased customer's demo into the additional-sales lane", () => {
    const item = buildNeoAccountPriorityItem(account(), NOW, {
      demoIndex: {
        byName: new Map([
          [
            "classin학원",
            {
              title: "ClassIn 학원 데모",
              customerName: "ClassIn 학원",
              date: "2026-06-27",
              phase: "upcoming",
              daysFromNow: 1,
            },
          ],
        ]),
        unmatched: [],
        total: 1,
      },
    })

    expect(item?.lane).toBe("sales")
    expect(item?.laneLabel).toBe("신규·추가 매출")
    expect(item?.actionLabel).toBe("데모")
    expect(item?.reason).toBe("내일 데모")
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
