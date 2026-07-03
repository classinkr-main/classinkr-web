import "server-only"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import {
  getBranchRevSourceRecordKey,
  isInactiveSheetStatus,
  isPlaceholderCrmName,
} from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// ── 매출보유 계정 기준 커버리지 (스파인 키스톤 지표) ─────────────────────────
//
// 기존 getCrmSourceLinkCoverage는 crm_source_links "행 수" 기준이라, 후보조차
// 생성되지 않은 REV 고객(= 통합 집계에서 조용히 누락되는 매출)이 분모에 안 잡힌다.
// 이 모듈은 REV 원장(branch_rev_deals) 쪽에서 출발해 "매출을 가진 학원 중 몇 %가
// ClassIn 고객 DB와 연결됐는가"를 계정·금액 두 축으로 계산한다.
//
// 판정 규칙은 후보 생성기(generateBranchRevLinkCandidates)와 동일해야 한다:
//   - 취소/해지 행 제외(isInactiveSheetStatus), placeholder 고객(HW/SW/MKT 접두) 별도 버킷
//   - 행↔링크 매핑은 getBranchRevSourceRecordKey 정확 일치(생성기의 스킵 판정과 동일)
// 계정 그룹핑은 원장 워크벤치와 같은 normalizedAccountKey 규약을 쓴다.

interface RevCoverageSheetRow {
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
}

type RowLinkState = "linked" | "candidate" | "none"

export interface RevAccountCoverageAccount {
  accountKey: string
  name: string
  rows: number
  /** 미연결 행의 매출 합(CNY) — topUnlinked 정렬 기준 */
  unlinkedRevenue: number
}

export interface RevAccountCoverage {
  /** 집계에 포함된 활성 행 수 (취소/해지 제외) */
  scannedRows: number
  accounts: {
    total: number
    /** 전 행 확정 연결 */
    linked: number
    /** 일부 행만 연결 */
    partial: number
    /** 연결 0, 검토 대기 후보만 존재 */
    needsReview: number
    /** 연결도 후보도 없음 — 스파인에서 완전히 누락되는 계정 */
    unlinked: number
    /** HW/SW/MKT 접두 임시 고객 — 설계상 매칭 제외 */
    placeholder: number
  }
  /** 금액 축(CNY). linked/total로 "매출 커버리지"를 계산한다 */
  revenue: {
    total: number
    linked: number
    coveragePct: number
    placeholder: number
  }
  /** 미연결 매출 상위 계정 — 매칭 인박스로 보낼 우선순위 */
  topUnlinked: RevAccountCoverageAccount[]
}

const LINKED_STATUSES = new Set(["confirmed", "active"])
const TOP_UNLINKED_LIMIT = 8

function rowRevenue(row: RevCoverageSheetRow): number {
  const payments = row.monthly_payments ?? {}
  let sum = 0
  for (const value of Object.values(payments)) {
    const amount = Number(value)
    if (Number.isFinite(amount)) sum += amount
  }
  return sum
}

export async function getRevAccountCoverage(): Promise<RevAccountCoverage> {
  const sb = createSupabaseAdminClient()

  const [sheetResult, linksResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target, monthly_payments")
      .limit(1000),
    sb
      .from("crm_source_links")
      .select("source_record_key, status")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .neq("status", "rejected")
      .limit(5000),
  ])

  if (sheetResult.error) throw sheetResult.error
  if (linksResult.error) throw linksResult.error

  // 같은 source_record_key에 링크가 여러 개면 가장 강한 상태(확정 > 후보)를 취한다.
  const linkStateByKey = new Map<string, RowLinkState>()
  for (const link of (linksResult.data ?? []) as Array<{ source_record_key: string; status: string }>) {
    const state: RowLinkState = LINKED_STATUSES.has(link.status) ? "linked" : "candidate"
    const prev = linkStateByKey.get(link.source_record_key)
    if (prev === "linked") continue
    linkStateByKey.set(link.source_record_key, state)
  }

  interface AccountAgg {
    name: string
    rows: number
    revenue: number
    linkedRevenue: number
    linkedRows: number
    candidateRows: number
  }

  const accountsByKey = new Map<string, AccountAgg>()
  let scannedRows = 0
  const placeholderAccountKeys = new Set<string>()
  let placeholderRevenue = 0

  for (const row of (sheetResult.data ?? []) as RevCoverageSheetRow[]) {
    if (isInactiveSheetStatus(row.status)) continue
    scannedRows += 1

    const revenue = rowRevenue(row)

    if (isPlaceholderCrmName(row.customer_name)) {
      placeholderAccountKeys.add(normalizedAccountKey(row.customer_name))
      placeholderRevenue += revenue
      continue
    }

    const accountKey = normalizedAccountKey(row.customer_name)
    const sourceRecordKey = getBranchRevSourceRecordKey(row)
    const linkState: RowLinkState = linkStateByKey.get(sourceRecordKey) ?? "none"

    const agg = accountsByKey.get(accountKey) ?? {
      name: row.customer_name,
      rows: 0,
      revenue: 0,
      linkedRevenue: 0,
      linkedRows: 0,
      candidateRows: 0,
    }
    agg.rows += 1
    agg.revenue += revenue
    if (linkState === "linked") {
      agg.linkedRows += 1
      agg.linkedRevenue += revenue
    } else if (linkState === "candidate") {
      agg.candidateRows += 1
    }
    accountsByKey.set(accountKey, agg)
  }

  const accounts = {
    total: accountsByKey.size,
    linked: 0,
    partial: 0,
    needsReview: 0,
    unlinked: 0,
    placeholder: placeholderAccountKeys.size,
  }
  let revenueTotal = 0
  let revenueLinked = 0
  const unlinkedPool: RevAccountCoverageAccount[] = []

  for (const [accountKey, agg] of accountsByKey) {
    revenueTotal += agg.revenue
    revenueLinked += agg.linkedRevenue

    if (agg.linkedRows === agg.rows) accounts.linked += 1
    else if (agg.linkedRows > 0) accounts.partial += 1
    else if (agg.candidateRows > 0) accounts.needsReview += 1
    else accounts.unlinked += 1

    const unlinkedRevenue = agg.revenue - agg.linkedRevenue
    if (agg.linkedRows < agg.rows && unlinkedRevenue > 0) {
      unlinkedPool.push({ accountKey, name: agg.name, rows: agg.rows, unlinkedRevenue })
    }
  }

  unlinkedPool.sort((a, b) => b.unlinkedRevenue - a.unlinkedRevenue)

  return {
    scannedRows,
    accounts,
    revenue: {
      total: revenueTotal,
      linked: revenueLinked,
      coveragePct: revenueTotal > 0 ? Math.round((revenueLinked / revenueTotal) * 100) : 0,
      placeholder: placeholderRevenue,
    },
    topUnlinked: unlinkedPool.slice(0, TOP_UNLINKED_LIMIT),
  }
}
