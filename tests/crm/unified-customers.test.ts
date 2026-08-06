import { afterEach, describe, expect, it, vi } from "vitest"

const NOW = new Date("2026-06-26T09:00:00.000Z")

type TestLeadStatus = "new" | "contacted" | "converted" | "closed"

function lead(overrides: {
  id: string
  status?: TestLeadStatus
  assigned_to?: string
  timestamp?: string
  source?: string
  branch?: string
  message?: string
  confirmed_at?: string | null
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
    branch: overrides.branch,
    message: overrides.message,
    confirmed_at: overrides.confirmed_at === null ? undefined : overrides.confirmed_at ?? "2026-06-23T09:00:00.000Z",
  }
}

function neoCustomer(overrides: {
  accountId: string
  ownerName?: string
  expireAt?: string | null
  updatedAt?: string | null
  regionLabel?: string | null
}) {
  return {
    accountId: overrides.accountId,
    name: `고객 ${overrides.accountId}`,
    ownerId: `owner-${overrides.ownerName ?? "미배정"}`,
    ownerName: overrides.ownerName ?? "담당자",
    phone: "010-1111-2222",
    regionLabel: overrides.regionLabel ?? null,
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

function portalCustomer(overrides: {
  id: string
  name?: string
  partnerAccountId?: string
  phone?: string | null
  activeDeals?: number
  outstanding?: number
  summary?: null
  regionLabel?: string | null
  address?: string | null
}) {
  const name = overrides.name ?? `전환 고객 ${overrides.id}`
  return {
    customer: {
      id: overrides.id,
      partner_account_id: overrides.partnerAccountId ?? "pa-1",
      name,
      contact_name: null,
      email: `${overrides.id}@portal.example.com`,
      phone: overrides.phone ?? null,
      address: overrides.address ?? null,
      business_number: null,
      campus_name: null,
      region_label: overrides.regionLabel ?? null,
      notes: null,
      created_by: null,
      created_at: "2026-06-01T00:00:00.000Z",
      updated_at: "2026-06-21T00:00:00.000Z",
    },
    summary:
      overrides.summary === null
        ? null
        : {
            customer_id: overrides.id,
            partner_account_id: overrides.partnerAccountId ?? "pa-1",
            customer_name: name,
            total_deals: 1,
            active_deals: overrides.activeDeals ?? 1,
            installation_deals: 0,
            unpaid_deals: 0,
            contracted_amount: 1_000_000,
            installed_amount: 0,
            paid_amount: 0,
            outstanding_amount: overrides.outstanding ?? 0,
            last_deal_updated_at: "2026-06-22T00:00:00.000Z",
          },
    insight: null,
    deal_previews: [],
  }
}

async function loadRepository(options?: {
  leads?: ReturnType<typeof lead>[]
  accounts?: ReturnType<typeof neoCustomer>[]
  portalCustomers?: ReturnType<typeof portalCustomer>[]
  convertedLinks?: Record<string, string>
  neoLinkedLeadIds?: string[]
  firstResponses?: Record<string, string>
  recentContacts?: Record<string, string>
  staleExternalCrm?: boolean
  portalCustomersFail?: boolean
  convertedLinksFail?: boolean
  neoLinksFail?: boolean
  firstResponsesFail?: boolean
}) {
  vi.resetModules()

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue(options?.leads ?? []),
  }))
  vi.doMock("@/lib/portal/repositories/customers", () => ({
    listAllCustomerListItemsLite: options?.portalCustomersFail
      ? vi.fn().mockRejectedValue(new Error("portal customers unavailable"))
      : vi.fn().mockResolvedValue(options?.portalCustomers ?? []),
  }))
  vi.doMock("@/lib/repositories/crm-source-links", () => ({
    listConfirmedLeadCustomerLinks: options?.convertedLinksFail
      ? vi.fn().mockRejectedValue(new Error("source links unavailable"))
      : vi.fn().mockResolvedValue(new Map(Object.entries(options?.convertedLinks ?? {}))),
    listConfirmedLeadNeoLinkLeadIds: options?.neoLinksFail
      ? vi.fn().mockRejectedValue(new Error("neo links unavailable"))
      : vi.fn().mockResolvedValue(new Set(options?.neoLinkedLeadIds ?? [])),
  }))
  vi.doMock("@/lib/repositories/crm-events", () => ({
    crmContactTargetKey: (targetType: string, targetId: string) => `${targetType}:${targetId}`,
    getCrmCustomerContactMaps: options?.firstResponsesFail
      ? vi.fn().mockRejectedValue(new Error("first responses unavailable"))
      : vi.fn().mockResolvedValue({
          firstResponseByLead: new Map(Object.entries(options?.firstResponses ?? {})),
          latestContactByTarget: new Map(Object.entries(options?.recentContacts ?? {})),
        }),
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

  it("keeps unconfirmed public leads in the lead inbox until they are confirmed or handled", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "unconfirmed-demo", source: "demo_modal", confirmed_at: null }),
        lead({ id: "confirmed-demo", source: "demo_modal" }),
        lead({ id: "confirmed-contact", source: "contact_page" }),
        lead({ id: "handled-meta", source: "meta_lead_ads", status: "contacted", confirmed_at: null }),
      ],
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const rowsByKey = new Map(result.rows.map((row) => [row.key, row]))

    expect(rowsByKey.has("lead:unconfirmed-demo")).toBe(false)
    expect(rowsByKey.get("lead:confirmed-demo")?.sourceLabel).toBe("데모 신청")
    expect(rowsByKey.get("lead:confirmed-contact")?.sourceLabel).toBe("문의")
    expect(rowsByKey.get("lead:handled-meta")?.sourceLabel).toBe("Meta 리드")
    expect(result.summary.leadCount).toBe(3)
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

  it("merges portal customers (lead conversion output) as a third source", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "1" })],
      accounts: [neoCustomer({ accountId: "acc-1" })],
      portalCustomers: [portalCustomer({ id: "cust-1", outstanding: 500_000 })],
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const customerRow = result.rows.find((row) => row.key === "customer:cust-1")

    expect(customerRow).toMatchObject({
      source: "customer",
      sourceLabel: "전환 고객",
      lifecycle: "active_account",
      nextActionLabel: "미수 확인",
    })
    expect(customerRow?.moneyLabel).toContain("미수")
    expect(result.summary.customerCount).toBe(1)
    expect(result.sources.portalCustomersOk).toBe(true)
    expect(result.sources.statuses.map((status) => status.key)).toContain("app_customers")
  })

  it("preserves region labels from lead, NEO, and converted customer sources and searches them", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "lead-region", branch: "부산광역시 해운대구" })],
      accounts: [neoCustomer({ accountId: "neo-region", regionLabel: "경기" })],
      portalCustomers: [portalCustomer({ id: "customer-region", address: "충청북도 청주시 상당구" })],
    })

    const all = await getCrmUnifiedCustomers({ now: NOW })
    expect(all.rows.find((row) => row.key === "lead:lead-region")?.regionLabel).toBe("부산")
    expect(all.rows.find((row) => row.key === "neo:neo-region")?.regionLabel).toBe("경기")
    expect(all.rows.find((row) => row.key === "customer:customer-region")?.regionLabel).toBe("충북")

    const searched = await getCrmUnifiedCustomers({ q: "충북", now: NOW })
    expect(searched.rows.map((row) => row.key)).toEqual(["customer:customer-region"])
  })

  it("filters by the customer source and keeps rows without confirmed links separate", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "1", status: "converted" })],
      portalCustomers: [portalCustomer({ id: "cust-1" })],
    })

    const onlyCustomers = await getCrmUnifiedCustomers({ source: "customer", now: NOW })
    expect(onlyCustomers.rows.map((row) => row.key)).toEqual(["customer:cust-1"])

    // 링크가 없으면 전환 완료 리드와 customer가 별개 행으로 공존한다.
    const all = await getCrmUnifiedCustomers({ now: NOW })
    expect(new Set(all.rows.map((row) => row.key))).toEqual(new Set(["lead:1", "customer:cust-1"]))
  })

  it("collapses a confirmed-linked converted lead into its portal customer row", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "converted-lead", status: "converted", assigned_to: "김담당" }),
        lead({ id: "other-lead" }),
      ],
      portalCustomers: [portalCustomer({ id: "cust-1", activeDeals: 0 })],
      convertedLinks: { "converted-lead": "cust-1" },
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const keys = result.rows.map((row) => row.key)

    expect(keys).not.toContain("lead:converted-lead")
    expect(keys).toContain("lead:other-lead")
    const customerRow = result.rows.find((row) => row.key === "customer:cust-1")
    // 접힌 리드의 담당이 customer 행으로 승계된다.
    expect(customerRow?.ownerName).toBe("김담당")
    expect(customerRow?.ownerKeys).toContain("김담당")
    expect(customerRow?.statusLabel).toBe("리드 전환 완료")
  })

  it("keeps the lead row when the linked customer row is missing", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "converted-lead", status: "converted" })],
      portalCustomers: [],
      convertedLinks: { "converted-lead": "cust-gone" },
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    expect(result.rows.map((row) => row.key)).toContain("lead:converted-lead")
  })

  it("degrades gracefully when the portal customer source fails", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "1" })],
      portalCustomersFail: true,
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const appCustomers = result.sources.statuses.find((status) => status.key === "app_customers")

    expect(result.sources.portalCustomersOk).toBe(false)
    expect(appCustomers).toMatchObject({ ok: false, partial: true })
    expect(result.rows.map((row) => row.key)).toEqual(["lead:1"])
    expect(result.sources.warnings.join(" ")).toContain("리드 전환 고객")
  })

  it("keeps duplicate rows instead of dropping leads when the link lookup fails", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "converted-lead", status: "converted" })],
      portalCustomers: [portalCustomer({ id: "cust-1" })],
      convertedLinksFail: true,
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    expect(new Set(result.rows.map((row) => row.key))).toEqual(
      new Set(["lead:converted-lead", "customer:cust-1"])
    )
    expect(result.sources.warnings.join(" ")).toContain("전환 링크")
  })

  it("wires lead-derived fields (origin·NEO등록·SLA·첫응답) and the provisional queue views", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "site-unconfirmed", source: "demo_modal", confirmed_at: null, assigned_to: "미확인담당" }),
        lead({ id: "site-confirmed", source: "contact_page", assigned_to: "김담당" }),
        lead({ id: "team-manual", source: "admin_manual" }),
      ],
      neoLinkedLeadIds: ["site-confirmed"],
      firstResponses: { "site-confirmed": "2026-06-24T00:00:00.000Z" },
      recentContacts: { "lead:site-confirmed": "2026-06-25T00:00:00.000Z" },
    })

    // 기본(all) 뷰 — 미확인 리드는 여전히 숨고, 파생 필드는 채워진다.
    const all = await getCrmUnifiedCustomers({ now: NOW })
    expect(all.rows.map((row) => row.key)).not.toContain("lead:site-unconfirmed")
    expect(all.rows.find((row) => row.key === "lead:site-confirmed")).toMatchObject({
      origin: "site",
      crmRegistered: true,
      provisional: false,
      slaTarget: true,
      firstResponseAt: "2026-06-24T00:00:00.000Z",
      lastContactAt: "2026-06-25T00:00:00.000Z",
    })
    expect(all.rows.find((row) => row.key === "lead:team-manual")).toMatchObject({
      origin: "team",
      slaTarget: false,
    })
    expect(all.summary.viewCounts.site_leads).toBe(1)
    expect(all.summary.viewCounts.unanswered).toBe(1)
    expect(all.summary.viewCounts.recent_contact).toBe(1)

    // provisional 리드의 담당자는 담당자 카운트에 새지 않는다(기본 뷰 배지·목록 정합).
    const ownerNames = all.owners.map((owner) => owner.ownerName)
    expect(ownerNames).toContain("김담당")
    expect(ownerNames).not.toContain("미확인담당")

    // 처리 큐 뷰 — 미확인 site 리드만 노출(NEO 등록·응답 완료 리드는 제외).
    const siteLeads = await getCrmUnifiedCustomers({ view: "site_leads", now: NOW })
    expect(siteLeads.rows.map((row) => row.key)).toEqual(["lead:site-unconfirmed"])
    const unanswered = await getCrmUnifiedCustomers({ view: "unanswered", now: NOW })
    expect(unanswered.rows.map((row) => row.key)).toEqual(["lead:site-unconfirmed"])
  })

  it("filters recent contacts and currently active Portal V2 deals", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "recent" }), lead({ id: "stale" })],
      portalCustomers: [
        portalCustomer({ id: "active", activeDeals: 2 }),
        portalCustomer({ id: "inactive", activeDeals: 0 }),
      ],
      recentContacts: {
        "lead:recent": "2026-06-25T00:00:00.000Z",
        "lead:stale": "2026-05-01T00:00:00.000Z",
      },
    })

    const recent = await getCrmUnifiedCustomers({ view: "recent_contact", now: NOW })
    expect(recent.rows.map((row) => row.key)).toEqual(["lead:recent"])

    const activeDeals = await getCrmUnifiedCustomers({ view: "active_deal", now: NOW })
    expect(activeDeals.rows.map((row) => row.key)).toEqual(["customer:active"])
    expect(activeDeals.rows[0]).toMatchObject({ activeDealCount: 2 })
  })

  it("degrades to empty derived inputs when neo-link/first-response lookups fail", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "1", source: "demo_modal" })],
      neoLinksFail: true,
      firstResponsesFail: true,
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    expect(result.rows.map((row) => row.key)).toEqual(["lead:1"])
    expect(result.rows[0]).toMatchObject({ crmRegistered: false, firstResponseAt: null })
    // 경고 문구는 화면 칩 라벨(홈페이지 유입/미응답)과 같은 이름을 쓴다.
    expect(result.sources.warnings.join(" ")).toContain("홈페이지 유입")
    expect(result.sources.warnings.join(" ")).toContain("미응답")
  })
})
