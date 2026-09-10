import { afterEach, describe, expect, it, vi } from "vitest"

type QueryResult = {
  data: unknown[] | null
  error: { message: string } | null
  count?: number | null
}

function query(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  for (const method of ["select", "eq", "neq", "in", "order"]) {
    builder[method] = vi.fn(() => builder)
  }
  builder.range = vi.fn(async () => result)
  return builder
}

function mockCoverageTables(input?: {
  links?: QueryResult
  branches?: QueryResult
  aliases?: QueryResult
}) {
  const defaults: Record<string, QueryResult> = {
    crm_source_links: { data: [], error: null, count: 0 },
    branch_rev_deals: { data: [], error: null, count: 0 },
    crm_match_aliases: { data: [], error: null, count: 0 },
  }
  const results: Record<string, QueryResult> = {
    ...defaults,
    ...(input?.links ? { crm_source_links: input.links } : {}),
    ...(input?.branches ? { branch_rev_deals: input.branches } : {}),
    ...(input?.aliases ? { crm_match_aliases: input.aliases } : {}),
  }
  const from = vi.fn((table: string) => query(results[table] ?? { data: [], error: null, count: 0 }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({ from })),
  }))
}

const currentBranches = [
  {
    id: "sheet-1",
    sheet_row: 1,
    customer_name: "테스트학원",
    team: "KR Team",
    manager: "Choi",
    status: "active",
    first_payment: "2026-01-01",
    contract_target: 100,
  },
  {
    id: "sheet-2",
    sheet_row: 2,
    customer_name: "현재학원",
    team: "KR Team",
    manager: "Kim",
    status: "active",
    first_payment: "2026-02-01",
    contract_target: 200,
  },
]

const currentKey1 = "rev:1:테스트:2026-01-01:100"
const currentKey2 = "rev:2:현재:2026-02-01:200"

function coverageLinks() {
  return [
    {
      id: "branch-invalid-alias",
      source_system: "branch_rev_sheet",
      source_object: "branch_rev_deals",
      source_record_key: currentKey1,
      target_type: "customer",
      target_id: "customer-1",
      status: "candidate",
      metadata: { source_owner: "Choi", match_evidence: ["alias:class"] },
    },
    {
      id: "branch-orphan",
      source_system: "branch_rev_sheet",
      source_object: "branch_rev_deals",
      source_record_key: "rev:99:과거:2025-01-01:100",
      target_type: "customer",
      target_id: "customer-old",
      status: "candidate",
      metadata: { manual: true },
    },
    {
      id: "branch-confirmed",
      source_system: "branch_rev_sheet",
      source_object: "branch_rev_deals",
      source_record_key: currentKey2,
      target_type: "customer",
      target_id: "customer-2",
      status: "confirmed",
      metadata: null,
    },
    {
      id: "branch-retired-sibling",
      source_system: "branch_rev_sheet",
      source_object: "branch_rev_deals",
      source_record_key: currentKey2,
      target_type: "customer",
      target_id: "customer-other",
      status: "stale",
      metadata: null,
    },
    {
      id: "xia-review",
      source_system: "xiaoshouyi",
      source_object: "account",
      source_record_key: "xia-1",
      target_type: "customer",
      target_id: "customer-3",
      status: "candidate",
      metadata: null,
    },
    {
      id: "lead-review",
      source_system: "lead",
      source_object: "leads",
      source_record_key: "lead-1",
      target_type: "customer",
      target_id: "customer-4",
      status: "candidate",
      metadata: null,
    },
    {
      id: "other-confirmed",
      source_system: "naver_shared_map",
      source_object: "place",
      source_record_key: "place-1",
      target_type: "customer",
      target_id: "customer-5",
      status: "confirmed",
      metadata: null,
    },
  ]
}

describe("getCrmSourceLinkCoverage actionable semantics", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("separates current actionable review from invalid, orphan and retired history", async () => {
    const links = coverageLinks()
    mockCoverageTables({
      links: { data: links, error: null, count: links.length },
      branches: { data: currentBranches, error: null, count: currentBranches.length },
    })
    const { getCrmSourceLinkCoverage } = await import("@/lib/repositories/crm-source-links")

    await expect(getCrmSourceLinkCoverage()).resolves.toEqual({
      total: 3,
      linked: 1,
      needsReview: 2,
      coveragePct: 33,
      diagnostics: {
        stored: { total: 7, confirmed: 2, candidate: 4, stale: 1 },
        excluded: { reviewHistory: 3, confirmedHistory: 0, outOfScope: 1 },
        validation: {
          aliasCatalog: "verified",
          branchSource: "verified",
          externalSource: "fail_open",
          warnings: [],
        },
      },
    })
  })

  it("accepts a current alias candidate only when the active source/target/manager scope matches", async () => {
    const links = coverageLinks()
    links[0].metadata = { source_owner: "Choi", match_evidence: ["alias:distinct-academy"] }
    mockCoverageTables({
      links: { data: links, error: null, count: links.length },
      branches: { data: currentBranches, error: null, count: currentBranches.length },
      aliases: {
        data: [
          {
            id: "alias-1",
            source_system: "branch_rev_sheet",
            normalized_alias: "distinctacademy",
            target_type: "customer",
            target_id: "customer-1",
            normalized_manager_name: "choi",
          },
        ],
        error: null,
        count: 1,
      },
    })
    const { getCrmSourceLinkCoverage } = await import("@/lib/repositories/crm-source-links")

    const coverage = await getCrmSourceLinkCoverage()
    expect(coverage).toMatchObject({ total: 4, linked: 1, needsReview: 3, coveragePct: 25 })
    expect(coverage.diagnostics.excluded.reviewHistory).toBe(2)
  })

  it("fails open for an unavailable alias catalog but keeps generic-alias safety fail-closed", async () => {
    const links = coverageLinks()
    mockCoverageTables({
      links: { data: links, error: null, count: links.length },
      branches: { data: currentBranches, error: null, count: currentBranches.length },
      aliases: { data: null, error: { message: "alias unavailable" }, count: null },
    })
    const { getCrmSourceLinkCoverage } = await import("@/lib/repositories/crm-source-links")

    const coverage = await getCrmSourceLinkCoverage()
    expect(coverage).toMatchObject({ total: 3, linked: 1, needsReview: 2, coveragePct: 33 })
    expect(coverage.diagnostics.excluded.reviewHistory).toBe(3)
    expect(coverage.diagnostics.validation.aliasCatalog).toBe("fail_open")
    expect(coverage.diagnostics.validation.warnings[0]).toContain("alias unavailable")
  })

  it("keeps graceful zero for a core link read error and exposes it as diagnostics", async () => {
    mockCoverageTables({ links: { data: null, error: { message: "coverage unavailable" }, count: null } })
    const { getCrmSourceLinkCoverage } = await import("@/lib/repositories/crm-source-links")

    const coverage = await getCrmSourceLinkCoverage()
    expect(coverage).toMatchObject({ total: 0, linked: 0, needsReview: 0, coveragePct: 0 })
    expect(coverage.diagnostics.validation.warnings).toEqual(["coverage unavailable"])
  })

  it("truth-sensitive consumers receive core source errors instead of a real zero", async () => {
    mockCoverageTables({ branches: { data: null, error: { message: "branch unavailable" }, count: null } })
    const { getCrmSourceLinkCoverage } = await import("@/lib/repositories/crm-source-links")

    await expect(getCrmSourceLinkCoverage({ throwOnError: true })).rejects.toThrow("branch unavailable")
  })
})
