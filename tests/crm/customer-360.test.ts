import { describe, expect, it } from "vitest"

import {
  buildLeadContacts,
  buildLeadHeader,
  buildNeoHeader,
  computeCustomer360Risk,
  parseUnifiedCustomerKey,
  summarizeNeoMoney,
} from "@/lib/repositories/crm-customer-360"
import type { NeoCrmCustomerDetail } from "@/lib/admin-crm-customers-neo"
import type { LeadRecord } from "@/lib/repositories/leads"

const NOW = new Date("2026-06-27T00:00:00.000Z")

function makeLead(overrides: Partial<LeadRecord> = {}): LeadRecord {
  return {
    id: "lead-1",
    source: "demo_modal",
    name: "박원장",
    org: "테스트 학원",
    email: "owner@test.com",
    phone: "010-0000-0000",
    timestamp: "2026-06-20T00:00:00.000Z",
    status: "new",
    assigned_to: "김지사",
    ...overrides,
  }
}

function makeNeoDetail(overrides: Partial<NeoCrmCustomerDetail> = {}): NeoCrmCustomerDetail {
  return {
    ok: true,
    error: null,
    account: {
      accountId: "acc-9",
      name: "큰학원",
      ownerName: "이매니저",
      phone: "02-123-4567",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    eeoAccounts: [],
    orders: [],
    collections: [],
    performances: [],
    ...overrides,
  }
}

describe("parseUnifiedCustomerKey", () => {
  it("parses lead and neo keys", () => {
    expect(parseUnifiedCustomerKey("lead:abc")).toEqual({ source: "lead", entityId: "abc", targetType: "lead" })
    expect(parseUnifiedCustomerKey("neo:xyz")).toEqual({ source: "neo", entityId: "xyz", targetType: "neo_account" })
  })

  it("splits only on the first colon so account ids containing colons survive", () => {
    expect(parseUnifiedCustomerKey("neo:a:b:c")).toEqual({ source: "neo", entityId: "a:b:c", targetType: "neo_account" })
  })

  it("rejects malformed keys", () => {
    expect(parseUnifiedCustomerKey("")).toBeNull()
    expect(parseUnifiedCustomerKey(null)).toBeNull()
    expect(parseUnifiedCustomerKey("missingcolon")).toBeNull()
    expect(parseUnifiedCustomerKey(":leadingcolon")).toBeNull()
    expect(parseUnifiedCustomerKey("lead:")).toBeNull()
    expect(parseUnifiedCustomerKey("partner:1")).toBeNull()
  })
})

describe("lead header + contacts", () => {
  it("uses the org-first name fallback and maps status", () => {
    const header = buildLeadHeader("lead:lead-1", makeLead(), NOW)
    expect(header).toMatchObject({
      source: "lead",
      sourceLabel: "리드",
      name: "테스트 학원",
      statusLabel: "신규 리드",
      ownerName: "김지사",
      ownerKeys: ["김지사"],
    })
    expect(typeof header.score).toBe("number")
  })

  it("falls back through name/email/phone when org is missing", () => {
    expect(buildLeadHeader("lead:1", makeLead({ org: undefined }), NOW).name).toBe("박원장")
    expect(buildLeadHeader("lead:1", makeLead({ org: undefined, name: undefined }), NOW).name).toBe("owner@test.com")
  })

  it("collects optional contact fields without inventing empties", () => {
    const contacts = buildLeadContacts(makeLead({ role: "원장", message: "7월 도입 검토", size: undefined }))
    expect(contacts.phone).toBe("010-0000-0000")
    expect(contacts.email).toBe("owner@test.com")
    expect(contacts.extra).toEqual(
      expect.arrayContaining([
        { label: "기관", value: "테스트 학원" },
        { label: "역할", value: "원장" },
        { label: "메시지", value: "7월 도입 검토" },
      ])
    )
    expect(contacts.extra.find((field) => field.label === "규모")).toBeUndefined()
  })
})

describe("neo header + money", () => {
  it("flags 관리 필요 when an EEO account expires within 30 days", () => {
    const soon = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString()
    const detail = makeNeoDetail({
      eeoAccounts: [{ id: "e1", name: "EEO", uid: null, balance: 1000, expireAt: soon, lastClassAt: null, serviceStatus: "active" }],
    })
    expect(buildNeoHeader("neo:acc-9", detail, NOW).statusLabel).toBe("관리 필요")
  })

  it("shows 활성 고객 when EEO accounts exist but none expire soon", () => {
    const far = new Date(NOW.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString()
    const detail = makeNeoDetail({
      eeoAccounts: [{ id: "e1", name: "EEO", uid: null, balance: 1000, expireAt: far, lastClassAt: null, serviceStatus: "active" }],
    })
    expect(buildNeoHeader("neo:acc-9", detail, NOW).statusLabel).toBe("활성 고객")
  })

  it("aggregates neo money totals from eeo balances and orders", () => {
    const detail = makeNeoDetail({
      eeoAccounts: [
        { id: "e1", name: "EEO1", uid: null, balance: 1000, expireAt: null, lastClassAt: null, serviceStatus: null },
        { id: "e2", name: "EEO2", uid: null, balance: 500, expireAt: null, lastClassAt: null, serviceStatus: null },
      ],
      orders: [{ id: "o1", title: "주문", amount: 3000, occurredAt: null, ownerName: "이매니저", status: "완료" }],
    })
    const money = summarizeNeoMoney(detail)
    expect(money.available).toBe(true)
    expect(money.totalBalance).toBe(1500)
    expect(money.totalOrderAmount).toBe(3000)
  })

  it("reports no money when nothing is present", () => {
    const money = summarizeNeoMoney(makeNeoDetail())
    expect(money.available).toBe(false)
    expect(money.totalBalance).toBeNull()
  })
})

describe("computeCustomer360Risk", () => {
  it("stays low with no signals", () => {
    expect(computeCustomer360Risk({ overdueTaskCount: 0, riskEventCount: 0, nearestExpireAt: null, totalBalance: null, now: NOW }).severity).toBe("low")
  })

  it("escalates to critical when a contract is already expired with overdue tasks", () => {
    const expired = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    const risk = computeCustomer360Risk({ overdueTaskCount: 2, riskEventCount: 1, nearestExpireAt: expired, totalBalance: 500, now: NOW })
    expect(risk.severity).toBe("critical")
    expect(risk.reasons).toEqual(expect.arrayContaining([expect.stringContaining("지연된 할 일"), expect.stringContaining("만료")]))
  })

  it("maps a single overdue task to medium", () => {
    expect(computeCustomer360Risk({ overdueTaskCount: 1, riskEventCount: 0, nearestExpireAt: null, totalBalance: null, now: NOW }).severity).toBe("medium")
  })
})
