import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-06-26T09:00:00.000Z")

type TestLeadStatus = "new" | "contacted" | "converted" | "closed"

function lead(overrides: {
  id: string
  status?: TestLeadStatus
  assigned_to?: string
  timestamp?: string
  source?: string
}) {
  return {
    id: overrides.id,
    source: overrides.source ?? "contact_page",
    name: `리드 ${overrides.id}`,
    org: `테스트 학원 ${overrides.id}`,
    email: `${overrides.id}@example.com`,
    phone: `010-0000-${overrides.id.padStart(4, "0")}`,
    timestamp: overrides.timestamp ?? "2026-06-23T08:00:00.000Z",
    status: overrides.status ?? "new",
    assigned_to: overrides.assigned_to,
  }
}

function neoCustomer(overrides: {
  accountId: string
  ownerName?: string
  expireAt?: string | null
  updatedAt?: string | null
}) {
  return {
    accountId: overrides.accountId,
    name: `고객 ${overrides.accountId}`,
    ownerId: `owner-${overrides.ownerName ?? "미배정"}`,
    ownerName: overrides.ownerName ?? "담당자",
    phone: "010-1111-2222",
    balance: 120_000,
    expireAt: overrides.expireAt ?? "2026-07-05T00:00:00.000Z",
    lastClassAt: "2026-06-20T00:00:00.000Z",
    uid: `uid-${overrides.accountId}`,
    orderAmount: 1000,
    orderCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-20T00:00:00.000Z",
  }
}

async function loadRepository(options?: {
  leads?: ReturnType<typeof lead>[]
  accounts?: ReturnType<typeof neoCustomer>[]
  staleExternalCrm?: boolean
}) {
  vi.resetModules()

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue(options?.leads ?? []),
  }))
  vi.doMock("@/lib/admin-crm-customers-neo", () => ({
    getNeoCrmCustomers: vi.fn().mockResolvedValue({
      ok: true,
      error: null,
      latestSyncedAt: options?.staleExternalCrm ? "2026-06-20T00:00:00.000Z" : "2026-06-26T08:30:00.000Z",
      generatedAt: NOW.toISOString(),
      syncHealth: {
        shroffAccountSyncedAt: options?.staleExternalCrm
          ? "2026-06-20T00:00:00.000Z"
          : "2026-06-26T08:30:00.000Z",
        shroffAccountAgeHours: options?.staleExternalCrm ? 145 : 0.5,
        staleAfterHours: 24,
        isShroffAccountStale: Boolean(options?.staleExternalCrm),
      },
      summary: {
        totalCount: options?.accounts?.length ?? 0,
        withEeoCount: options?.accounts?.length ?? 0,
        expiringSoonCount: options?.accounts?.length ?? 0,
        totalBalance: 0,
        totalOrderAmount: 0,
      },
      owners: [],
      rows: options?.accounts ?? [],
    }),
  }))

  return import("@/lib/repositories/crm-unified-customers")
}

describe("getCrmUnifiedCustomers", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("returns bounded offset pagination metadata for the filtered customer DB", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "1" }),
        lead({ id: "2" }),
        lead({ id: "3" }),
        lead({ id: "4" }),
      ],
    })

    const result = await getCrmUnifiedCustomers({ limit: 2, offset: 1, now: NOW })

    expect(result.rows).toHaveLength(2)
    expect(result.pagination).toMatchObject({
      limit: 2,
      offset: 1,
      returned: 2,
      total: 4,
      hasMore: true,
      nextOffset: 3,
    })
  })

  it("applies practical saved views on existing customer fields", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "new", status: "new", assigned_to: "김담당" }),
        lead({ id: "contacted", status: "contacted", assigned_to: "김담당" }),
        lead({ id: "closed", status: "closed", assigned_to: "박담당" }),
      ],
      accounts: [
        neoCustomer({ accountId: "risk", ownerName: "김담당", expireAt: "2026-07-01T00:00:00.000Z" }),
        neoCustomer({ accountId: "steady", ownerName: "박담당", expireAt: "2027-07-01T00:00:00.000Z" }),
      ],
    })

    const newLeads = await getCrmUnifiedCustomers({ view: "new_leads", now: NOW })
    const needsCare = await getCrmUnifiedCustomers({ view: "needs_care", now: NOW })
    const mine = await getCrmUnifiedCustomers({ view: "my_owner", owner: "김담당", now: NOW })

    expect(newLeads.rows.map((row) => row.key)).toEqual(["lead:new"])
    expect(needsCare.rows.map((row) => row.key)).toEqual(["neo:risk"])
    expect(mine.rows.every((row) => row.ownerName === "김담당")).toBe(true)
  })

  it("collects my leads and customers through admin owner aliases", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "mine-lead", status: "new", assigned_to: "김담당" }),
        lead({ id: "other-lead", status: "new", assigned_to: "박담당" }),
      ],
      accounts: [
        neoCustomer({ accountId: "mine-account", ownerName: "neo-123", expireAt: "2026-07-01T00:00:00.000Z" }),
        neoCustomer({ accountId: "other-account", ownerName: "박담당", expireAt: "2026-07-01T00:00:00.000Z" }),
      ],
    })

    const result = await getCrmUnifiedCustomers({
      view: "my_owner",
      ownerKeys: ["김담당", "neo-123"],
      now: NOW,
    })

    expect(new Set(result.rows.map((row) => row.key))).toEqual(new Set(["lead:mine-lead", "neo:mine-account"]))
  })

  it("surfaces stale external CRM sync as a reference-source warning", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      accounts: [neoCustomer({ accountId: "risk" })],
      staleExternalCrm: true,
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const externalCrm = result.sources.statuses.find((status) => status.key === "external_crm")

    expect(externalCrm).toMatchObject({
      role: "reference",
      ok: true,
      partial: true,
    })
    expect(result.sources.warnings.join(" ")).toContain("외부 CRM 고객 동기화")
  })
})
