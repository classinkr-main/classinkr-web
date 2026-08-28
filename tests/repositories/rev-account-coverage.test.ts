// getRevAccountCoverage — CRM 싱크 시각 요소용 additive 확장 필드 검증.
// (rows 행 축 / revenueCny / asOf / hygiene / health) 기존 필드(scannedRows·accounts·
// revenue·topUnlinked)는 값 무변경이어야 한다(하위호환). 판정 규칙은 기존 코드 재사용:
// 행 키 = getBranchRevSourceRecordKey, 플레이스홀더 = isPlaceholderCrmName,
// 활성 = !isInactiveSheetStatus. supabase 모킹 관례는 crm-source-links-neo-link.test.ts와 동일.
import { afterEach, describe, expect, it, vi } from "vitest"

import { getBranchRevSourceRecordKey } from "@/lib/crm-source-linking"

interface SheetRow {
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
  synced_at: string | null
}

interface LinkRow {
  source_record_key: string
  status: string
  normalized_name?: string | null
  target_type?: string | null
  target_id?: string | null
  metadata?: Record<string, unknown> | null
}

interface AliasRow {
  source_system: string | null
  normalized_alias: string
  target_type: string | null
  target_id: string | null
  normalized_manager_name: string | null
}

function tableClient<T>(rows: T[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    limit: () => builder,
    then(resolve: (value: { data: T[]; error: null; count: number }) => void) {
      resolve({ data: rows, error: null, count: rows.length })
    },
  }
  return builder
}

async function loadCoverage(sheetRows: SheetRow[], linkRows: LinkRow[], aliasRows: AliasRow[] = []) {
  vi.resetModules()
  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: vi.fn(() => ({
      from: vi.fn((table: string) =>
        table === "branch_rev_deals"
          ? tableClient(sheetRows)
          : table === "crm_source_links"
            ? tableClient(linkRows)
            : tableClient(aliasRows)
      ),
    })),
  }))
  const { getRevAccountCoverage } = await import("@/lib/repositories/rev-account-coverage")
  return getRevAccountCoverage()
}

const ROW_A: SheetRow = {
  sheet_row: 1,
  customer_name: "가나학원",
  team: "BD",
  manager: "BD Han",
  status: "진행",
  first_payment: "2026-04-01",
  contract_target: 1000,
  monthly_payments: { "2026-04": 1000 },
  synced_at: "2026-07-18T00:33:00.000Z",
}
const ROW_B: SheetRow = {
  sheet_row: 2,
  customer_name: "다라어학원",
  team: "MKT",
  manager: "MKT Gyusung",
  status: null,
  first_payment: null,
  contract_target: 500,
  monthly_payments: { "2026-05": 500 },
  synced_at: "2026-07-17T00:00:00.000Z",
}
const ROW_C: SheetRow = {
  sheet_row: 3,
  customer_name: "마바스쿨",
  team: null,
  manager: null,
  status: "진행",
  first_payment: null,
  contract_target: 300,
  monthly_payments: { "2026-06": 300 },
  synced_at: "2026-07-16T00:00:00.000Z",
}
// 플레이스홀더(SW 접두) — 매칭 대상 제외, 매출은 placeholder 버킷으로.
const ROW_D: SheetRow = {
  sheet_row: 4,
  customer_name: "SW 신규계약",
  team: null,
  manager: null,
  status: null,
  first_payment: null,
  contract_target: 200,
  monthly_payments: { "2026-04": 200 },
  synced_at: "2026-07-15T00:00:00.000Z",
}
// 비활성(취소) — scannedRows에서 제외되지만 행 키는 "현 시트에 있는" 키다(고아 판정 분모).
const ROW_E: SheetRow = {
  sheet_row: 5,
  customer_name: "취소학원",
  team: null,
  manager: null,
  status: "취소",
  first_payment: null,
  contract_target: 999,
  monthly_payments: { "2026-04": 999 },
  synced_at: "2026-07-14T00:00:00.000Z",
}

const LINKS: LinkRow[] = [
  { source_record_key: getBranchRevSourceRecordKey(ROW_A), status: "confirmed" },
  { source_record_key: getBranchRevSourceRecordKey(ROW_B), status: "candidate" },
  // 고아 후보 — 어떤 현 시트 행으로도 해석되지 않는 키.
  { source_record_key: "rev:99:유령학원:no-first-payment:0", status: "candidate" },
  // 비활성 행의 키를 가리키는 후보 — 시트에 존재하는 키이므로 고아가 아니다.
  { source_record_key: getBranchRevSourceRecordKey(ROW_E), status: "candidate" },
  // 스테일 링크 — 키 존재 여부와 무관하게 status로 센다.
  { source_record_key: getBranchRevSourceRecordKey(ROW_A), status: "stale" },
]

describe("getRevAccountCoverage — CRM 싱크 additive 확장", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("행 축(rows)·hygiene·asOf·health를 추가로 계산하고 기존 필드는 무변경", async () => {
    const coverage = await loadCoverage([ROW_A, ROW_B, ROW_C, ROW_D, ROW_E], LINKS)

    // 기존 필드 하위호환 — 값 자체가 기존 로직 그대로여야 한다.
    expect(coverage.scannedRows).toBe(4) // 취소(E) 제외, 플레이스홀더(D) 포함
    expect(coverage.accounts).toEqual({
      total: 3,
      linked: 1,
      partial: 0,
      needsReview: 1,
      unlinked: 1,
      placeholder: 1,
    })
    expect(coverage.revenue).toEqual({
      total: 1800,
      linked: 1000,
      coveragePct: 56,
      placeholder: 200,
    })

    // 행 축 — 매칭 대상(활성·비플레이스홀더) 3행의 상태 분해.
    expect(coverage.rows).toEqual({ matchable: 3, linked: 1, review: 1, unlinked: 1 })

    // 금액 축 별칭 — revenue와 동일 값(CNY 명시 네이밍).
    expect(coverage.revenueCny).toEqual(coverage.revenue)

    // 기준 시각 — synced_at 최댓값.
    expect(coverage.asOf).toBe("2026-07-18T00:33:00.000Z")

    // 위생 — 고아 후보 1(유령 키), 스테일 1. 비활성 행 키 후보는 고아가 아니다.
    expect(coverage.hygiene).toEqual({
      orphanCandidates: 1,
      orphanCandidateNames: 1,
      staleLinks: 1,
      staleLinkNames: 1,
    })

    // health — 연결 계정(전행+부분) 1 / 전체 3 = 33.3% → partial.
    expect(coverage.health).toBe("partial")
  })

  it("topUnlinked에 시트 담당자(manager)를 함께 싣는다", async () => {
    const coverage = await loadCoverage([ROW_A, ROW_B, ROW_C, ROW_D, ROW_E], LINKS)
    expect(coverage.topUnlinked).toEqual([
      { accountKey: expect.any(String), name: "다라어학원", rows: 1, unlinkedRevenue: 500, manager: "MKT Gyusung" },
      { accountKey: expect.any(String), name: "마바스쿨", rows: 1, unlinkedRevenue: 300, manager: null },
    ])
  })

  it("현재 원천의 활성 별칭으로 입증되지 않은 과거 alias 후보를 미연결로 되돌린다", async () => {
    const invalidAliasCandidate: LinkRow = {
      source_record_key: getBranchRevSourceRecordKey(ROW_B),
      status: "candidate",
      target_type: "partner_account",
      target_id: "internal-test-account",
      metadata: {
        source_owner: "MKT · MKT Gyusung",
        match_strategy: "alias",
        match_evidence: ["name:char_overlap:0.38", "alias:class"],
      },
    }

    const coverage = await loadCoverage([ROW_B], [invalidAliasCandidate])

    expect(coverage.accounts).toMatchObject({ total: 1, needsReview: 0, unlinked: 1 })
    expect(coverage.rows).toEqual({ matchable: 1, linked: 0, review: 0, unlinked: 1 })
    expect(coverage.topUnlinked).toEqual([
      expect.objectContaining({ name: "다라어학원", unlinkedRevenue: 500 }),
    ])
  })

  it("같은 원천·타깃·담당 범위의 활성 별칭이 남은 후보만 현재 검토로 센다", async () => {
    const aliasCandidate: LinkRow = {
      source_record_key: getBranchRevSourceRecordKey(ROW_B),
      status: "candidate",
      target_type: "partner_account",
      target_id: "account-1",
      metadata: {
        source_owner: "MKT Gyusung",
        match_strategy: "alias",
        match_evidence: ["alias:class"],
      },
    }
    const alias: AliasRow = {
      source_system: "branch_rev_sheet",
      normalized_alias: "class",
      target_type: "partner_account",
      target_id: "account-1",
      normalized_manager_name: "mktgyusung",
    }

    const coverage = await loadCoverage([ROW_B], [aliasCandidate], [alias])

    expect(coverage.accounts).toMatchObject({ total: 1, needsReview: 1, unlinked: 0 })
    expect(coverage.rows).toEqual({ matchable: 1, linked: 0, review: 1, unlinked: 0 })
  })

  it("확정 sibling이 있는 stale 후보는 은퇴 이력으로 보고 actionable 검토에서 제외한다", async () => {
    const sourceRecordKey = getBranchRevSourceRecordKey(ROW_A)
    const coverage = await loadCoverage(
      [ROW_A],
      [
        { source_record_key: sourceRecordKey, status: "stale", target_type: "customer", target_id: "old" },
        { source_record_key: sourceRecordKey, status: "confirmed", target_type: "customer", target_id: "current" },
      ]
    )

    expect(coverage.accounts).toMatchObject({ total: 1, linked: 1, needsReview: 0, unlinked: 0 })
    expect(coverage.rows).toEqual({ matchable: 1, linked: 1, review: 0, unlinked: 0 })
    expect(coverage.hygiene.staleLinks).toBe(1)
  })

  it("링크가 하나도 없으면 low — 분모가 있어도 연결 0", async () => {
    const coverage = await loadCoverage([ROW_A, ROW_B, ROW_C], [])
    expect(coverage.health).toBe("low")
    expect(coverage.rows).toEqual({ matchable: 3, linked: 0, review: 0, unlinked: 3 })
    expect(coverage.hygiene).toEqual({
      orphanCandidates: 0,
      orphanCandidateNames: 0,
      staleLinks: 0,
      staleLinkNames: 0,
    })
  })

  it("시트가 비어 있으면 asOf null·health low로 접힌다", async () => {
    const coverage = await loadCoverage([], [])
    expect(coverage.asOf).toBeNull()
    expect(coverage.health).toBe("low")
    expect(coverage.rows).toEqual({ matchable: 0, linked: 0, review: 0, unlinked: 0 })
  })
})
