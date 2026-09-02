// CRM duplicate preflight — external_crm_records 페이지 스캔 제거 검증.
// (source_system, object_api_key, external_id)는 UNIQUE 제약 external_crm_records_unique_source
// (20260610_external_crm_snapshots.sql)가 DB에서 강제하고, 동기화 upsert 도 그 제약을 onConflict 로
// 쓴다. 5,000행 스캔(84K행 synced_at 정렬 5회 + exact count)은 중복을 찾을 수 없으므로 이 검사는
// 제약을 보증으로 ok 보고하고, crm_source_links 두 검사만 실제로 스캔한다.
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRecordingSupabaseClient, filterValue } from "../helpers/recording-supabase-client"

interface LinkRow {
  source_system: string
  source_object: string
  source_record_key: string
  target_type: string
  target_id: string
  status: string
}

function linkRow(overrides: Partial<LinkRow> = {}): LinkRow {
  return {
    source_system: "branch_rev_sheet",
    source_object: "branch_rev_deals",
    source_record_key: "rev:1:가나학원:2026-04-01:1000",
    target_type: "customer",
    target_id: "cust-1",
    status: "candidate",
    ...overrides,
  }
}

async function loadReport(linkRows: LinkRow[]) {
  vi.resetModules()
  const recorder = createRecordingSupabaseClient((query) => {
    if (query.table !== "crm_source_links") return { data: [], error: null, count: 0 }
    const status = filterValue(query, "status")
    const rows = status ? linkRows.filter((row) => row.status === status) : linkRows
    if (query.selectOptions?.head) return { data: null, error: null, count: rows.length }
    const range = query.range ?? { from: 0, to: rows.length - 1 }
    return { data: rows.slice(range.from, range.to + 1), error: null, count: null }
  })
  vi.doMock("next/cache", () => ({
    unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
    revalidateTag: vi.fn(),
  }))
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => recorder.client),
  }))

  const { getCrmDuplicatePreflightReport } = await import("@/lib/admin-crm-duplicate-preflight")
  const report = await getCrmDuplicatePreflightReport()
  return { report, queries: recorder.queries }
}

describe("getCrmDuplicatePreflightReport", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("external_crm_records 는 스캔하지 않고 UNIQUE 제약을 보증으로 ok 보고한다", async () => {
    const { report, queries } = await loadReport([linkRow()])

    expect(queries.map((query) => query.table)).not.toContain("external_crm_records")

    const external = report.checks.find((check) => check.key === "external_crm_records_duplicate_keys")
    expect(external).toMatchObject({ label: "External CRM snapshot duplicate keys", status: "ok" })
    expect(external?.detail).toContain("external_crm_records_unique_source")
    expect(external?.action).toBeUndefined()
    expect(report.ok).toBe(true)
  })

  it("검사 키 순서와 crm_source_links 두 검사(스캔 + exact count)는 그대로 유지한다", async () => {
    const { report, queries } = await loadReport([
      linkRow({ status: "confirmed" }),
      // 같은 source 가 다른 타깃에도 확정 → confirmed sources 중복, candidates(5필드)는 서로 다름.
      linkRow({ status: "confirmed", target_id: "cust-2" }),
    ])

    expect(report.checks.map((check) => check.key)).toEqual([
      "external_crm_records_duplicate_keys",
      "crm_source_links_duplicate_candidates",
      "crm_source_links_duplicate_confirmed_sources",
    ])

    const linkQueries = queries.filter((query) => query.table === "crm_source_links")
    expect(linkQueries.filter((query) => query.selectOptions?.head)).toHaveLength(2)
    expect(linkQueries.filter((query) => query.range)).toHaveLength(2)

    expect(report.checks[1]?.status).toBe("ok")
    expect(report.checks[2]?.status).toBe("blocked")
    expect(report.ok).toBe(false)
  })
})
