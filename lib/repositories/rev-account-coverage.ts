import "server-only"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import {
  getBranchRevSourceRecordKey,
  isInactiveSheetStatus,
  isPlaceholderCrmName,
} from "@/lib/crm-source-linking"
import {
  revSyncHealth,
  type RevSyncHealth,
  type RevSyncHygiene,
  type RevSyncRevenueCny,
  type RevSyncRowsCoverage,
} from "@/lib/crm/rev-sync-health"
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
  synced_at: string | null
}

type RowLinkState = "linked" | "candidate" | "none"

export interface RevAccountCoverageAccount {
  accountKey: string
  name: string
  rows: number
  /** 미연결 행의 매출 합(CNY) — topUnlinked 정렬 기준 */
  unlinkedRevenue: number
  /** 시트 담당자(계정 내 첫 비어 있지 않은 값) — CRM 싱크 스트립 미연결 상위 표시용 */
  manager: string | null
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

  // ── CRM 싱크 시각 요소 additive 확장 (2026-07-18 시안) ──────────────────
  // 기존 소비자(CrmCoverageStrip·matching 밴드·os-summary)와의 하위호환을 위해
  // 전부 새 키로만 얹는다 — 기존 필드의 의미·값은 무변경.
  /** 시트 행 축 — 활성(취소/해지 제외)·플레이스홀더 제외 매칭 대상의 링크 상태 분해 */
  rows: RevSyncRowsCoverage
  /** 금액 축(CNY) — 기존 revenue와 동일 값. 통화를 이름에 명시한 확장 소비자용 별칭 */
  revenueCny: RevSyncRevenueCny
  /** 기준 시각 — branch_rev_deals.synced_at 최댓값(시트 동기화 시각) */
  asOf: string | null
  /** 링크 위생 — 고아 후보(현 시트에 없는 행 키)·스테일 링크 */
  hygiene: RevSyncHygiene
  /** 계정 커버리지(전행+부분 확정 계정 / 전체) 기준 3단계 — 문턱 10%/60% */
  health: RevSyncHealth
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
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target, monthly_payments, synced_at")
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

  const linkRows = (linksResult.data ?? []) as Array<{ source_record_key: string; status: string }>

  // 같은 source_record_key에 링크가 여러 개면 가장 강한 상태(확정 > 후보)를 취한다.
  const linkStateByKey = new Map<string, RowLinkState>()
  for (const link of linkRows) {
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
    manager: string | null
  }

  const accountsByKey = new Map<string, AccountAgg>()
  let scannedRows = 0
  const placeholderAccountKeys = new Set<string>()
  let placeholderRevenue = 0
  // 고아 판정용 현 시트 행 키 전집 — 비활성(취소/해지)·플레이스홀더 행도 "현 시트에 있는"
  // 키이므로 포함한다. 고아 = 어떤 현 행으로도 해석되지 않는 키(행 이동/셀 수정으로 발생).
  const sheetKeys = new Set<string>()
  const rowsAxis: RevSyncRowsCoverage = { matchable: 0, linked: 0, review: 0, unlinked: 0 }
  let asOfMs = Number.NEGATIVE_INFINITY
  let asOf: string | null = null

  for (const row of (sheetResult.data ?? []) as RevCoverageSheetRow[]) {
    sheetKeys.add(getBranchRevSourceRecordKey(row))
    if (row.synced_at) {
      const syncedMs = Date.parse(row.synced_at)
      if (Number.isFinite(syncedMs) && syncedMs > asOfMs) {
        asOfMs = syncedMs
        asOf = row.synced_at
      }
    }

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

    rowsAxis.matchable += 1
    if (linkState === "linked") rowsAxis.linked += 1
    else if (linkState === "candidate") rowsAxis.review += 1
    else rowsAxis.unlinked += 1

    const agg = accountsByKey.get(accountKey) ?? {
      name: row.customer_name,
      rows: 0,
      revenue: 0,
      linkedRevenue: 0,
      linkedRows: 0,
      candidateRows: 0,
      manager: null,
    }
    agg.rows += 1
    agg.revenue += revenue
    if (!agg.manager && row.manager?.trim()) agg.manager = row.manager.trim()
    if (linkState === "linked") {
      agg.linkedRows += 1
      agg.linkedRevenue += revenue
    } else if (linkState === "candidate") {
      agg.candidateRows += 1
    }
    accountsByKey.set(accountKey, agg)
  }

  // 링크 위생 — 집계 로직과 독립인 카운트 전용(같은 fetch 재사용, 추가 쿼리 없음).
  const hygiene: RevSyncHygiene = { orphanCandidates: 0, staleLinks: 0 }
  for (const link of linkRows) {
    if (link.status === "stale") hygiene.staleLinks += 1
    else if (link.status === "candidate" && !sheetKeys.has(link.source_record_key)) {
      hygiene.orphanCandidates += 1
    }
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
      unlinkedPool.push({ accountKey, name: agg.name, rows: agg.rows, unlinkedRevenue, manager: agg.manager })
    }
  }

  unlinkedPool.sort((a, b) => b.unlinkedRevenue - a.unlinkedRevenue)

  const revenueAxis: RevSyncRevenueCny = {
    total: revenueTotal,
    linked: revenueLinked,
    coveragePct: revenueTotal > 0 ? Math.round((revenueLinked / revenueTotal) * 100) : 0,
    placeholder: placeholderRevenue,
  }

  return {
    scannedRows,
    accounts,
    revenue: revenueAxis,
    topUnlinked: unlinkedPool.slice(0, TOP_UNLINKED_LIMIT),
    rows: rowsAxis,
    revenueCny: revenueAxis,
    asOf,
    hygiene,
    // 연결 계정 = 전행 확정 + 부분 확정(확정 링크가 1행이라도 있으면 스파인에 잡힌다).
    health: revSyncHealth(accounts.linked + accounts.partial, accounts.total),
  }
}
