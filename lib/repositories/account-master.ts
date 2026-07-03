import "server-only"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import {
  getBranchRevSourceRecordKey,
  isInactiveSheetStatus,
  isPlaceholderCrmName,
} from "@/lib/crm-source-linking"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// ── Account 360 스파인 읽기 뷰 (TS 합성) ─────────────────────────────────────
//
// ERP 블루프린트의 `account_master`를 SQL 뷰가 아니라 TS 합성으로 구현한다.
// 이유: crm_source_links의 REV 링크 키(rev:{row}:{normalizeCrmName…})를 SQL에서
// 재구성하려면 normalizeCrmName의 SQL 쌍둥이가 또 필요해져 파리티 함정이 생긴다.
// TS 합성은 후보 생성기·커버리지와 같은 함수를 그대로 재사용하므로 판정이 어긋날 수 없다.
//
// 원칙(마스터플랜 §2): unmatched는 절대 0으로 합치지 않는다 — 별도 목록('needs link')으로
// 노출하고 매칭 인박스로 보낸다. 통화 규범: REV 매출은 CNY, 외부 CRM 오더는 USD일 수 있어
// (canon §5) 서로 다른 통화의 grand total을 만들지 않는다 — 외부 레코드는 건수만 요약한다.

export interface AccountMasterEntry {
  /** 링크 target 기준 식별자 */
  targetType: "customer" | "partner_account"
  targetId: string
  name: string
  campusName: string | null
  /** customer일 때 소속 파트너 계정명 */
  partnerName: string | null
  /** REV 원장 누적 매출(CNY, 확정 링크로 연결된 행만) */
  revenueCNY: number
  /** 연결된 REV 행 수 */
  revRows: number
  /** 확정 링크로 연결된 리드 수 */
  leadCount: number
  /** 확정 링크로 연결된 외부 CRM 레코드 수 (통화 혼재 위험 때문에 금액은 합산하지 않음) */
  externalCount: number
  /** 연결된 원천 종류 (branch_rev_sheet / lead / xiaoshouyi) */
  sources: string[]
}

export interface AccountMasterUnmatched {
  accountKey: string
  name: string
  rows: number
  revenueCNY: number
  /** 후보 링크가 하나라도 있으면 true(검토 대기), 없으면 완전 미연결 */
  hasCandidate: boolean
}

export interface AccountMasterResult {
  accounts: AccountMasterEntry[]
  /** REV 원장에 있으나 ClassIn 고객 DB와 확정 연결이 없는 계정 — 'needs link' */
  unmatched: AccountMasterUnmatched[]
  summary: {
    accountsWithRevenue: number
    linkedRevenueCNY: number
    unmatchedRevenueCNY: number
  }
}

interface CustomerRow {
  id: string
  partner_account_id: string | null
  name: string
  campus_name: string | null
}

interface PartnerAccountRow {
  id: string
  name: string
}

interface RevSheetRow {
  sheet_row: number
  customer_name: string
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
}

interface LinkRow {
  source_system: string
  source_object: string
  source_record_key: string
  target_type: string
  target_id: string
  status: string
}

function sumPayments(payments: Record<string, number> | null): number {
  let sum = 0
  for (const value of Object.values(payments ?? {})) {
    const amount = Number(value)
    if (Number.isFinite(amount)) sum += amount
  }
  return sum
}

export async function getAccountMaster(): Promise<AccountMasterResult> {
  const sb = createSupabaseAdminClient()

  const [customersRes, partnersRes, revRes, linksRes] = await Promise.all([
    sb.from("customers").select("id, partner_account_id, name, campus_name").limit(2000),
    sb.from("partner_accounts").select("id, name").limit(2000),
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, status, first_payment, contract_target, monthly_payments")
      .limit(1000),
    sb
      .from("crm_source_links")
      .select("source_system, source_object, source_record_key, target_type, target_id, status")
      .neq("status", "rejected")
      .limit(5000),
  ])

  if (customersRes.error) throw customersRes.error
  if (partnersRes.error) throw partnersRes.error
  if (revRes.error) throw revRes.error
  if (linksRes.error) throw linksRes.error

  const customers = (customersRes.data ?? []) as CustomerRow[]
  const partners = (partnersRes.data ?? []) as PartnerAccountRow[]
  const revRows = ((revRes.data ?? []) as RevSheetRow[]).filter(
    (row) => !isInactiveSheetStatus(row.status) && !isPlaceholderCrmName(row.customer_name)
  )
  const links = (linksRes.data ?? []) as LinkRow[]

  const partnerNameById = new Map(partners.map((p) => [p.id, p.name]))

  // REV 행 → 매출, 그리고 확정 링크가 가리키는 record_key 집합
  const revByRecordKey = new Map<string, { revenue: number; row: RevSheetRow }>()
  for (const row of revRows) {
    revByRecordKey.set(getBranchRevSourceRecordKey(row), { revenue: sumPayments(row.monthly_payments), row })
  }

  interface TargetAgg {
    revenueCNY: number
    revRows: number
    leadCount: number
    externalCount: number
    sources: Set<string>
  }
  const aggByTarget = new Map<string, TargetAgg>()
  const targetKey = (type: string, id: string) => `${type}:${id}`
  const linkedRevRecordKeys = new Set<string>()
  const candidateRevRecordKeys = new Set<string>()

  for (const link of links) {
    if (link.source_system === "branch_rev_sheet" && link.status !== "confirmed") {
      candidateRevRecordKeys.add(link.source_record_key)
    }
    if (link.status !== "confirmed") continue
    if (link.target_type !== "customer" && link.target_type !== "partner_account") continue

    const key = targetKey(link.target_type, link.target_id)
    const agg = aggByTarget.get(key) ?? {
      revenueCNY: 0,
      revRows: 0,
      leadCount: 0,
      externalCount: 0,
      sources: new Set<string>(),
    }

    if (link.source_system === "branch_rev_sheet") {
      const rev = revByRecordKey.get(link.source_record_key)
      // 링크 키가 현재 행과 어긋나면(시트 재동기화 드리프트) 매출 없이 연결 표식만 남는다 —
      // 커버리지(rev-account-coverage)도 같은 행을 미연결로 집계하므로 두 화면이 일치한다.
      if (rev) {
        agg.revenueCNY += rev.revenue
        agg.revRows += 1
        linkedRevRecordKeys.add(link.source_record_key)
      }
    } else if (link.source_system === "lead") {
      agg.leadCount += 1
    } else if (link.source_system === "xiaoshouyi") {
      agg.externalCount += 1
    }
    agg.sources.add(link.source_system)
    aggByTarget.set(key, agg)
  }

  // target 상세(이름) 붙이기 — 링크가 하나라도 있는 계정만 노출(전 고객 나열은 unified 몫)
  const accounts: AccountMasterEntry[] = []
  for (const [key, agg] of aggByTarget) {
    const sepIndex = key.indexOf(":")
    const type = key.slice(0, sepIndex)
    const id = key.slice(sepIndex + 1)
    if (type === "customer") {
      const customer = customers.find((c) => c.id === id)
      if (!customer) continue
      accounts.push({
        targetType: "customer",
        targetId: id,
        name: customer.name,
        campusName: customer.campus_name,
        partnerName: customer.partner_account_id
          ? (partnerNameById.get(customer.partner_account_id) ?? null)
          : null,
        revenueCNY: agg.revenueCNY,
        revRows: agg.revRows,
        leadCount: agg.leadCount,
        externalCount: agg.externalCount,
        sources: Array.from(agg.sources).sort(),
      })
    } else {
      const partner = partnerNameById.get(id)
      if (!partner) continue
      accounts.push({
        targetType: "partner_account",
        targetId: id,
        name: partner,
        campusName: null,
        partnerName: null,
        revenueCNY: agg.revenueCNY,
        revRows: agg.revRows,
        leadCount: agg.leadCount,
        externalCount: agg.externalCount,
        sources: Array.from(agg.sources).sort(),
      })
    }
  }
  accounts.sort((a, b) => b.revenueCNY - a.revenueCNY || a.name.localeCompare(b.name, "ko"))

  // unmatched: 확정 링크로 이어지지 않은 REV 행을 계정 키로 묶어 'needs link' 노출
  const unmatchedByKey = new Map<string, AccountMasterUnmatched>()
  for (const [recordKey, { revenue, row }] of revByRecordKey) {
    if (linkedRevRecordKeys.has(recordKey)) continue
    const key = normalizedAccountKey(row.customer_name)
    const entry = unmatchedByKey.get(key) ?? {
      accountKey: key,
      name: row.customer_name,
      rows: 0,
      revenueCNY: 0,
      hasCandidate: false,
    }
    entry.rows += 1
    entry.revenueCNY += revenue
    entry.hasCandidate = entry.hasCandidate || candidateRevRecordKeys.has(recordKey)
    unmatchedByKey.set(key, entry)
  }
  const unmatched = Array.from(unmatchedByKey.values()).sort((a, b) => b.revenueCNY - a.revenueCNY)

  const linkedRevenueCNY = accounts.reduce((sum, account) => sum + account.revenueCNY, 0)
  const unmatchedRevenueCNY = unmatched.reduce((sum, entry) => sum + entry.revenueCNY, 0)

  return {
    accounts,
    unmatched,
    summary: {
      accountsWithRevenue: accounts.filter((a) => a.revenueCNY > 0).length + unmatched.length,
      linkedRevenueCNY,
      unmatchedRevenueCNY,
    },
  }
}
