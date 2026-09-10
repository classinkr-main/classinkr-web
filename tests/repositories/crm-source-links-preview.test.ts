import { afterEach, describe, expect, it, vi } from "vitest"

type Filter = { op: string; column: string; value: unknown }

const writes: Array<{ table: string; operation: string }> = []
const reads: Array<{ table: string; filters: Filter[] }> = []

function rowsFor(table: string, filters: Filter[]) {
  if (table === "leads") {
    return [{
      id: "lead-1",
      name: "Alpha Academy",
      org: "Alpha Academy",
      phone: null,
      email: "alpha@example.com",
      status: "new",
      assigned_to: null,
      created_at: "2026-08-27T00:00:00.000Z",
    }]
  }
  if (table === "customers") {
    return [{
      id: "customer-1",
      partner_account_id: null,
      name: "Alpha Academy",
      campus_name: null,
      contact_name: null,
    }]
  }
  if (table === "crm_source_priorities") {
    return [{
      source_system: "lead",
      auto_confirm_enabled: true,
      auto_confirm_min_confidence: 0.92,
      auto_confirm_min_gap: 0.15,
    }]
  }
  if (table === "crm_source_links") {
    // aliases와 기존 후보/확정 링크 모두 없는 초기 상태.
    return []
  }
  if (
    table === "partner_accounts" ||
    table === "deals" ||
    table === "branch_rev_deals" ||
    table === "external_crm_records" ||
    table === "crm_xiaoshouyi_owner_names" ||
    table === "crm_match_aliases"
  ) {
    return []
  }
  throw new Error(`unexpected read table: ${table} ${JSON.stringify(filters)}`)
}

function queryBuilder(table: string) {
  const filters: Filter[] = []
  const builder = {
    select() { return builder },
    eq(column: string, value: unknown) {
      filters.push({ op: "eq", column, value })
      return builder
    },
    neq(column: string, value: unknown) {
      filters.push({ op: "neq", column, value })
      return builder
    },
    in(column: string, value: unknown) {
      filters.push({ op: "in", column, value })
      return builder
    },
    is(column: string, value: unknown) {
      filters.push({ op: "is", column, value })
      return builder
    },
    order() { return builder },
    limit() { return builder },
    range() { return builder },
    insert() {
      writes.push({ table, operation: "insert" })
      return builder
    },
    update() {
      writes.push({ table, operation: "update" })
      return builder
    },
    upsert() {
      writes.push({ table, operation: "upsert" })
      return builder
    },
    delete() {
      writes.push({ table, operation: "delete" })
      return builder
    },
    then(resolve: (value: { data: unknown[]; error: null }) => void) {
      reads.push({ table, filters: [...filters] })
      resolve({ data: rowsFor(table, filters), error: null })
    },
  }
  return builder
}

async function loadRepository() {
  vi.resetModules()
  writes.length = 0
  reads.length = 0
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) => queryBuilder(table)),
    })),
  }))
  return import("@/lib/repositories/crm-source-links")
}

describe("CRM source-link candidate preview", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("uses live scoring/auto-confirm policy but never calls a mutation builder", async () => {
    const { previewAllCrmLinkCandidates } = await loadRepository()

    const preview = await previewAllCrmLinkCandidates()

    expect(preview.leads).toEqual({
      scannedLeads: 1,
      generatedCandidates: 1,
      wouldInsertCandidates: 1,
      skippedExisting: 0,
      wouldAutoConfirm: 1,
    })
    expect(preview.branchRev.wouldInsertCandidates).toBe(0)
    expect(preview.xiaoshouyi.wouldInsertCandidates).toBe(0)
    expect(writes).toEqual([])
    expect(preview.leads).not.toHaveProperty("insertedCandidates")
    expect(preview.leads).not.toHaveProperty("autoConfirmed")

    const aliasSourceSystems = reads
      .filter((read) => read.table === "crm_match_aliases")
      .map((read) => read.filters.find((filter) => filter.op === "eq" && filter.column === "source_system")?.value)
      .sort()
    expect(aliasSourceSystems).toEqual(["branch_rev_sheet", "lead", "xiaoshouyi"])

    const confirmedLeadAliasReads = reads.filter(
      (read) =>
        read.table === "crm_source_links" &&
        read.filters.some(
          (filter) => filter.op === "eq" && filter.column === "source_system" && filter.value === "lead"
        ) &&
        read.filters.some(
          (filter) => filter.op === "eq" && filter.column === "status" && filter.value === "confirmed"
        )
    )
    expect(confirmedLeadAliasReads).toHaveLength(1)
  })
})
