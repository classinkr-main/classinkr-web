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
  /** null = 스냅샷 미조인(EEO/Shroff), 0 = 조인됐지만 0원. undefined면 기본 12만. */
  balance?: number | null
  orderAmount?: number
}) {
  return {
    accountId: overrides.accountId,
    name: `고객 ${overrides.accountId}`,
    ownerId: `owner-${overrides.ownerName ?? "미배정"}`,
    ownerName: overrides.ownerName ?? "담당자",
    phone: "010-1111-2222",
    regionLabel: overrides.regionLabel ?? null,
    balance: overrides.balance === undefined ? 120_000 : overrides.balance,
    expireAt: overrides.expireAt ?? "2026-07-05T00:00:00.000Z",
    lastClassAt: "2026-06-20T00:00:00.000Z",
    uid: `uid-${overrides.accountId}`,
    orderAmount: overrides.orderAmount === undefined ? 1000 : overrides.orderAmount,
    orderCount: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-06-20T00:00:00.000Z",
  }
}

/** 홈 큐와 같은 반응 축 입력(LeadEngagement) — 기본은 신호 전무. */
function engagement(partial: {
  authenticated?: boolean
  downloadCount?: number
  contactLogCount?: number
  lastActivityAt?: string | null
  lastContactAt?: string | null
}) {
  return {
    authenticated: partial.authenticated ?? false,
    providers: [],
    downloadCount: partial.downloadCount ?? 0,
    eventCount: 0,
    contactLogCount: partial.contactLogCount ?? 0,
    lastActivityAt: partial.lastActivityAt ?? null,
    lastContactAt: partial.lastContactAt ?? null,
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
  engagements?: Record<string, ReturnType<typeof engagement>>
  demoEvents?: Array<{ id: string; title: string; date: string; type: string }>
  /** 반응 축·데모 캘린더(보조 신호) 동시 실패 시나리오 */
  activitySignalsFail?: boolean
}) {
  vi.resetModules()

  vi.doMock("@/lib/repositories/leads", () => ({
    getLeads: vi.fn().mockResolvedValue(options?.leads ?? []),
  }))
  vi.doMock("@/lib/repositories/lead-activity", () => ({
    getLeadsActivitySummary: options?.activitySignalsFail
      ? vi.fn().mockRejectedValue(new Error("lead activity unavailable"))
      : vi.fn().mockResolvedValue(options?.engagements ?? {}),
  }))
  vi.doMock("@/lib/showroom-ics-calendar", () => ({
    getShowroomCalendarEvents: options?.activitySignalsFail
      ? vi.fn().mockRejectedValue(new Error("showroom calendar unavailable"))
      : vi.fn().mockResolvedValue(options?.demoEvents ?? []),
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

  it("allows internal capture matching to read beyond the public 200-row page cap", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: Array.from({ length: 250 }, (_, index) => lead({ id: `lead-${index}` })),
    })

    const result = await getCrmUnifiedCustomers({ limit: 250, now: NOW })

    expect(result.rows).toHaveLength(250)
    expect(result.pagination.limit).toBe(250)
    expect(result.pagination.total).toBe(250)
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

  // ── 결함 A 회귀: 엔진 버킷 보존 정렬 ─────────────────────────────────────────

  it("sorts by the engine bucket: a today expired-recovery account outranks today leads and watch leads", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        // 25시간 미응답 신규 문의 — 엔진 버킷 today.
        lead({ id: "fresh", timestamp: "2026-06-25T08:00:00.000Z" }),
        // 7일(168h) 미응답 — 엔진이 식었다고 보고 watch로 내린 리드.
        lead({ id: "cooled", timestamp: "2026-06-19T09:00:00.000Z" }),
      ],
      // 나흘 전 만료 — 회복 골든타임, 엔진 버킷 today · 고점수(88+).
      accounts: [neoCustomer({ accountId: "expired-golden", expireAt: "2026-06-23T00:00:00.000Z" })],
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const rowsByKey = new Map(result.rows.map((row) => [row.key, row]))

    // 엔진 판단이 행에 그대로 저장된다 — 라벨 문자열 재파생 없음.
    expect(rowsByKey.get("neo:expired-golden")?.bucket).toBe("today")
    expect(rowsByKey.get("neo:expired-golden")?.nextActionLabel).toBe("만료 회복")
    expect(rowsByKey.get("lead:fresh")?.bucket).toBe("today")
    expect(rowsByKey.get("lead:cooled")?.bucket).toBe("watch")

    // today 버킷 안에서는 점수순(계정 88+ > 리드), watch 리드는 today 계정 아래.
    expect(result.rows.map((row) => row.key)).toEqual([
      "neo:expired-golden",
      "lead:fresh",
      "lead:cooled",
    ])
  })

  it("keeps engine-watch cooled leads (120h+ unanswered) below today rows even at a higher score", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        // 2시간 미응답 신규 문의 — today 버킷, 점수는 아래 리드보다 낮다.
        lead({ id: "fresh2h", timestamp: "2026-06-26T07:00:00.000Z" }),
        // 7일 미응답(식음) — 자료 다운로드·로그인 신호로 점수는 높지만 엔진 버킷은 watch.
        lead({ id: "cooled120h", timestamp: "2026-06-19T09:00:00.000Z" }),
      ],
      engagements: {
        cooled120h: engagement({ downloadCount: 1, authenticated: true }),
      },
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const cooled = result.rows.find((row) => row.key === "lead:cooled120h")
    const fresh = result.rows.find((row) => row.key === "lead:fresh2h")

    expect(cooled?.bucket).toBe("watch")
    expect(fresh?.bucket).toBe("today")
    // 점수만 보면 cooled가 위 — 버킷이 정렬을 지배해야 today가 먼저 온다.
    expect((cooled?.score ?? 0) > (fresh?.score ?? 0)).toBe(true)
    expect(result.rows.map((row) => row.key)).toEqual(["lead:fresh2h", "lead:cooled120h"])
  })

  // ── 결함 B 회귀: 홈 큐와 같은 반응 축·데모 신호 입력 ─────────────────────────

  it("feeds engagement and showroom demo signals into row scores like the home queue", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [
        lead({ id: "revisit", status: "contacted" }),
        lead({ id: "plain", status: "contacted" }),
      ],
      // 데모 신호가 없으면 우선순위가 서지 않는 정상 계정(만료 1년 뒤).
      accounts: [neoCustomer({ accountId: "acc-demo", expireAt: "2027-07-01T00:00:00.000Z" })],
      engagements: {
        revisit: engagement({
          lastContactAt: "2026-06-24T00:00:00.000Z",
          lastActivityAt: "2026-06-25T00:00:00.000Z",
        }),
      },
      demoEvents: [{ id: "demo-1", title: "고객 acc-demo 데모", date: "2026-06-28", type: "showroom" }],
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const revisit = result.rows.find((row) => row.key === "lead:revisit")
    const plain = result.rows.find((row) => row.key === "lead:plain")
    const demoAccount = result.rows.find((row) => row.key === "neo:acc-demo")

    // 연락 후 재방문(+16)이 이 화면에서도 살아 있다 — 이유·버킷·점수 모두 반영.
    expect(revisit?.priorityReason).toBe("연락 후 재방문")
    expect(revisit?.bucket).toBe("today")
    expect((revisit?.score ?? 0) > (plain?.score ?? 0)).toBe(true)

    // 쇼룸 데모가 잡힌 계정은 다른 사유 없이도 today로 올라온다.
    expect(demoAccount?.bucket).toBe("today")
    expect(demoAccount?.nextActionLabel).toBe("데모")
    expect(demoAccount?.priorityReason).toContain("데모")
    expect(demoAccount?.statusLabel).toBe("관리 필요")
  })

  it("silently degrades when auxiliary signal sources (activity·calendar) fail", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "1" })],
      accounts: [neoCustomer({ accountId: "acc-1" })],
      activitySignalsFail: true,
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })

    // 행은 그대로 서고(반응 축만 조용히 빠짐) 경고도 추가되지 않는다 — 홈 큐와 동일 규약.
    expect(new Set(result.rows.map((row) => row.key))).toEqual(new Set(["lead:1", "neo:acc-1"]))
    expect(result.sources.warnings).toEqual([])
  })

  // ── 결함 C 회귀: 돈흐름 "-"의 세 가지 이유 구분 ──────────────────────────────

  it("distinguishes moneyState: lead none, unjoined account unsynced, all-zero account zero, valued rows value", async () => {
    const { getCrmUnifiedCustomers } = await loadRepository({
      leads: [lead({ id: "plain" })],
      accounts: [
        // EEO/Shroff 미조인 — balance null(스냅샷 규약) + 주문액 0.
        neoCustomer({ accountId: "unjoined", balance: null, orderAmount: 0 }),
        // 조인은 됐지만 전부 0원.
        neoCustomer({ accountId: "zeroed", balance: 0, orderAmount: 0 }),
        // 값 있음.
        neoCustomer({ accountId: "funded" }),
      ],
      portalCustomers: [
        portalCustomer({ id: "valued" }),
        portalCustomer({ id: "no-money", summary: null }),
      ],
    })

    const result = await getCrmUnifiedCustomers({ now: NOW })
    const rowsByKey = new Map(result.rows.map((row) => [row.key, row]))

    expect(rowsByKey.get("lead:plain")).toMatchObject({ moneyState: "none", moneyLabel: null })
    expect(rowsByKey.get("neo:unjoined")).toMatchObject({ moneyState: "unsynced", moneyLabel: null })
    expect(rowsByKey.get("neo:zeroed")).toMatchObject({ moneyState: "zero", moneyLabel: null })
    expect(rowsByKey.get("neo:funded")?.moneyState).toBe("value")
    expect(rowsByKey.get("neo:funded")?.moneyLabel).toContain("잔액")
    expect(rowsByKey.get("customer:valued")?.moneyState).toBe("value")
    expect(rowsByKey.get("customer:no-money")).toMatchObject({ moneyState: "zero", moneyLabel: null })
  })
})
