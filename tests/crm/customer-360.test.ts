import { afterEach, describe, expect, it, vi } from "vitest"

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
      region: null,
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
    expect(contacts.message).toBe("7월 도입 검토")
    expect(contacts.extra).toEqual(
      expect.arrayContaining([
        { label: "기관", value: "테스트 학원" },
        { label: "역할", value: "원장" },
      ])
    )
    expect(contacts.extra.find((field) => field.label === "메시지")).toBeUndefined()
    expect(contacts.extra.find((field) => field.label === "규모")).toBeUndefined()
  })

  it("maps a structured branch and legacy Meta city into a region label", () => {
    expect(buildLeadHeader("lead:1", makeLead({ branch: "부산광역시 해운대구" }), NOW).region).toBe("부산")
    expect(
      buildLeadHeader("lead:1", makeLead({
        branch: undefined,
        message: "Meta Lead Ads\nfields=full_name: 홍길동 / city: Cheongju",
      }), NOW).region
    ).toBe("충북")
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

// ── getCrmCustomer360 오케스트레이터 (mocked harness) ────────────────────────
// unified-customers.test.ts의 vi.doMock 패턴 — 서버 의존만 목킹하고
// 순수 모듈(origin 분류·priority·service-risk)은 실물을 쓴다.

function okEventsResult() {
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
    pagination: { limit: 20, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

function okTasksResult() {
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
    pagination: { limit: 50, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

function okDealsResult() {
  return {
    generatedAt: NOW.toISOString(),
    health: { ok: true, message: null },
    summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0 },
    pagination: { limit: 20, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

async function loadCustomer360(options?: {
  lead?: ReturnType<typeof makeLead> | null
  neoLink?: { targetId: string } | null
  neoLinkFail?: boolean
}) {
  vi.resetModules()

  const findConfirmedLeadNeoLink = options?.neoLinkFail
    ? vi.fn().mockRejectedValue(new Error("neo link unavailable"))
    : vi.fn().mockResolvedValue(options?.neoLink ?? null)

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeadById: vi.fn().mockResolvedValue(options?.lead ?? null),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomerDetail: vi.fn().mockResolvedValue(makeNeoDetail()),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    findConfirmedLeadNeoLink,
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    listCrmCustomerEvents: vi.fn().mockResolvedValue(okEventsResult()),
  }))
  vi.doMock("@/lib/repositories/crm-tasks", () => ({
    listCrmTasks: vi.fn().mockResolvedValue(okTasksResult()),
  }))
  vi.doMock("@/lib/repositories/crm-deals", () => ({
    listCrmDeals: vi.fn().mockResolvedValue(okDealsResult()),
  }))
  vi.doMock("@/lib/repositories/crm-account-money", () => ({
    EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY: {
      swCumulativeCNY: null,
      hwCumulativeCNY: null,
      hwBoardCount: null,
      matched: false,
    },
    getCrmAccountProductSummary: vi.fn().mockResolvedValue({
      swCumulativeCNY: null,
      hwCumulativeCNY: null,
      hwBoardCount: null,
      matched: false,
    }),
  }))
  vi.doMock("@/lib/repositories/crm-customer-tags", () => ({
    getCustomerTags: vi.fn().mockResolvedValue([]),
  }))

  const loaded = await import("@/lib/repositories/crm-customer-360")
  return { getCrmCustomer360: loaded.getCrmCustomer360, findConfirmedLeadNeoLink }
}

const LEAD_KEY = { source: "lead", entityId: "lead-1", targetType: "lead" } as const

describe("getCrmCustomer360 (mocked harness)", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("wires origin/crmRegistered/neoAccountId for a site lead with a confirmed NEO link", async () => {
    const { getCrmCustomer360, findConfirmedLeadNeoLink } = await loadCustomer360({
      lead: makeLead({ source: "demo_modal" }),
      neoLink: { targetId: "neo-acc-77" },
    })

    const result = await getCrmCustomer360(LEAD_KEY, { now: NOW })

    expect(findConfirmedLeadNeoLink).toHaveBeenCalledWith("lead-1")
    expect(result.found).toBe(true)
    expect(result.header?.source).toBe("lead")
    expect(result.origin).toBe("site")
    expect(result.crmRegistered).toBe(true)
    expect(result.neoAccountId).toBe("neo-acc-77")
    expect(result.health.ok).toBe(true)
    // 수기 라벨은 360 페이로드에 additive로 동승한다(드로어 온-오픈 별도 fetch 제거).
    expect(result.tags).toEqual([])
  })

  it("classifies ad-click leads as origin ad and stays unregistered without a link", async () => {
    const { getCrmCustomer360 } = await loadCustomer360({
      lead: makeLead({ source: "contact_page", gclid: "g-123" }),
    })

    const result = await getCrmCustomer360(LEAD_KEY, { now: NOW })

    expect(result.origin).toBe("ad")
    expect(result.crmRegistered).toBe(false)
    expect(result.neoAccountId).toBeNull()
  })

  it("degrades to unregistered with a warning when the NEO-link lookup fails", async () => {
    const { getCrmCustomer360 } = await loadCustomer360({
      lead: makeLead(),
      neoLinkFail: true,
    })

    const result = await getCrmCustomer360(LEAD_KEY, { now: NOW })

    // 링크 조회 실패는 드로어 전체를 막지 않는다 — 페이로드는 그대로, 미등록 폴백 + 경고만.
    expect(result.found).toBe(true)
    expect(result.header).not.toBeNull()
    expect(result.crmRegistered).toBe(false)
    expect(result.neoAccountId).toBeNull()
    expect(result.health.ok).toBe(false)
    expect(result.health.warnings.join(" ")).toContain("NEO 등록 여부")
  })
})
