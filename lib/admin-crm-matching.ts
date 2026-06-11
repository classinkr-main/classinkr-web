import "server-only"

import { getBranchRevSourceRecordKey, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"
import { getKoreaTeamManagerSet, isKoreaScopedOwner, isKoreaTeamLabel } from "@/lib/admin-crm-scope"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type CrmMatchingSourceSystem = "branch_rev_sheet" | "xiaoshouyi" | "lead"

export interface CrmMatchingRow {
  key: string
  linkId: string | null
  sourceSystem: CrmMatchingSourceSystem
  sourceObject: string
  sourceRecordKey: string
  sourceLabel: string
  sourceDetail: string | null
  sourceOwner: string | null
  sourceStatus: string | null
  amount: number | null
  linkStatus: CrmSourceLinkStatus | null
  targetType: string | null
  targetId: string | null
  targetLabel: string | null
  confidence: number | null
  autoConfirmed: boolean
  confirmedAt: string | null
  updatedAt: string | null
  placeholder: boolean
}

export interface CrmMatchingSourceSummary {
  reviewCount: number
  confirmedCount: number
  autoConfirmedCount: number
  unmatchedCount: number
  unmatchedAmount: number
}

export interface AdminCrmMatchingInbox {
  generatedAt: string
  rows: CrmMatchingRow[]
  summary: Record<CrmMatchingSourceSystem, CrmMatchingSourceSummary>
  totals: {
    reviewCount: number
    confirmedCount: number
    autoConfirmedCount: number
    unmatchedCount: number
    sheetMatchedRatio: number | null
  }
  warnings: string[]
}

interface SheetDealRow {
  sheet_row: number
  customer_name: string
  team: string | null
  manager: string | null
  status: string | null
  first_payment: string | null
  contract_target: number | null
  monthly_payments: Record<string, number> | null
}

interface SourceLinkRow {
  id: string
  source_system: string
  source_object: string
  source_record_key: string
  normalized_name: string | null
  target_type: string
  target_id: string
  confidence: number | null
  status: CrmSourceLinkStatus
  metadata: Record<string, unknown> | null
  confirmed_at: string | null
  updated_at: string
}

const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const SOURCE_SYSTEMS: CrmMatchingSourceSystem[] = ["branch_rev_sheet", "xiaoshouyi", "lead"]

function getMetadataString(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" && value.trim() ? value : null
}

function getMetadataNumber(metadata: Record<string, unknown> | null, key: string) {
  const value = metadata?.[key]
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function isAutoConfirmed(metadata: Record<string, unknown> | null) {
  return metadata?.auto_confirmed === true
}

function getSheetDealAmount(deal: SheetDealRow) {
  if (deal.contract_target != null && Number(deal.contract_target) > 0) return Number(deal.contract_target)
  return Object.values(deal.monthly_payments ?? {}).reduce((total, value) => total + (Number(value) || 0), 0)
}

function emptySummary(): CrmMatchingSourceSummary {
  return { reviewCount: 0, confirmedCount: 0, autoConfirmedCount: 0, unmatchedCount: 0, unmatchedAmount: 0 }
}

function statusRank(status: CrmSourceLinkStatus | null) {
  if (status === null) return 0
  if (status === "candidate") return 1
  if (status === "stale") return 2
  if (status === "confirmed") return 3
  return 4
}

export async function getAdminCrmMatchingInbox(): Promise<AdminCrmMatchingInbox> {
  const sb = createSupabaseAdminClient()
  const warnings: string[] = []

  const [sheetResult, linksResult, accountsResult, customersResult, dealsResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, team, manager, status, first_payment, contract_target, monthly_payments")
      .limit(1000),
    sb
      .from("crm_source_links")
      .select(
        "id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at"
      )
      .in("source_system", SOURCE_SYSTEMS)
      .order("updated_at", { ascending: false })
      .limit(5000),
    sb.from("partner_accounts").select("id, name").limit(2000),
    sb.from("customers").select("id, name, campus_name").limit(2000),
    sb.from("deals").select("id, deal_code, title").limit(2000),
  ])

  if (sheetResult.error) warnings.push(`REV 시트 데이터를 읽지 못했습니다: ${sheetResult.error.message}`)
  if (linksResult.error) warnings.push(`source link 데이터를 읽지 못했습니다: ${linksResult.error.message}`)

  const rawSheetDeals = (sheetResult.data ?? []) as SheetDealRow[]
  const koreaManagers = getKoreaTeamManagerSet(rawSheetDeals)
  const sheetDeals = rawSheetDeals.filter(
    (deal) => !SHEET_INACTIVE_PATTERN.test(deal.status ?? "") && isKoreaTeamLabel(deal.team)
  )
  const links = (linksResult.data ?? []) as SourceLinkRow[]

  const accountNameById = new Map(
    ((accountsResult.data ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name])
  )
  const customerNameById = new Map(
    ((customersResult.data ?? []) as Array<{ id: string; name: string; campus_name: string | null }>).map((row) => [
      row.id,
      [row.name, row.campus_name].filter(Boolean).join(" · "),
    ])
  )
  const dealNameById = new Map(
    ((dealsResult.data ?? []) as Array<{ id: string; deal_code: string; title: string }>).map((row) => [
      row.id,
      `${row.deal_code} · ${row.title}`,
    ])
  )

  function resolveTargetLabel(link: SourceLinkRow) {
    return (
      getMetadataString(link.metadata, "target_label") ??
      (link.target_type === "partner_account"
        ? accountNameById.get(link.target_id)
        : link.target_type === "customer"
          ? customerNameById.get(link.target_id)
          : link.target_type === "deal"
            ? dealNameById.get(link.target_id)
            : null) ??
      null
    )
  }

  function toRow(link: SourceLinkRow, sourceSystem: CrmMatchingSourceSystem, overrides?: Partial<CrmMatchingRow>): CrmMatchingRow {
    return {
      key: `link:${link.id}`,
      linkId: link.id,
      sourceSystem,
      sourceObject: link.source_object,
      sourceRecordKey: link.source_record_key,
      sourceLabel:
        getMetadataString(link.metadata, "source_label") ??
        getMetadataString(link.metadata, "source_customer_name") ??
        link.normalized_name ??
        link.source_record_key,
      sourceDetail: `${link.source_object} · ${link.source_record_key.slice(0, 40)}`,
      sourceOwner:
        getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
      sourceStatus: getMetadataString(link.metadata, "source_status"),
      amount: getMetadataNumber(link.metadata, "source_amount"),
      linkStatus: link.status,
      targetType: link.target_type,
      targetId: link.target_id,
      targetLabel: resolveTargetLabel(link),
      confidence: link.confidence,
      autoConfirmed: isAutoConfirmed(link.metadata),
      confirmedAt: link.confirmed_at,
      updatedAt: link.updated_at,
      placeholder: false,
      ...overrides,
    }
  }

  const rows: CrmMatchingRow[] = []
  const summary: Record<CrmMatchingSourceSystem, CrmMatchingSourceSummary> = {
    branch_rev_sheet: emptySummary(),
    xiaoshouyi: emptySummary(),
    lead: emptySummary(),
  }

  // REV sheet rows: enumerate every active row so unmatched rows are visible.
  const sheetLinksByKey = new Map<string, SourceLinkRow[]>()
  for (const link of links) {
    if (link.source_system !== "branch_rev_sheet") continue
    const list = sheetLinksByKey.get(link.source_record_key) ?? []
    list.push(link)
    sheetLinksByKey.set(link.source_record_key, list)
  }

  let sheetConfirmedRows = 0
  let sheetMatchableRows = 0
  for (const deal of sheetDeals) {
    const recordKey = getBranchRevSourceRecordKey(deal)
    const dealLinks = sheetLinksByKey.get(recordKey) ?? []
    const owner = [deal.team, deal.manager].filter(Boolean).join(" · ") || null
    const amount = getSheetDealAmount(deal)
    // HW/SW/MKT 접두 임시 고객은 후순위 — KPI/매칭률에서 제외하고 표시만 남긴다.
    const placeholder = isPlaceholderCrmName(deal.customer_name)
    const hasConfirmed = dealLinks.some((link) => link.status === "confirmed")
    if (!placeholder) {
      sheetMatchableRows += 1
      if (hasConfirmed) {
        sheetConfirmedRows += 1
      } else {
        // "미매칭" = 확정 링크가 없는 행. 후보만 있는 행도 아직 따로 노는 금액이다.
        summary.branch_rev_sheet.unmatchedCount += 1
        summary.branch_rev_sheet.unmatchedAmount += amount
      }
    }

    if (dealLinks.length === 0) {
      rows.push({
        key: `sheet:${recordKey}`,
        linkId: null,
        sourceSystem: "branch_rev_sheet",
        sourceObject: "branch_rev_deals",
        sourceRecordKey: recordKey,
        sourceLabel: deal.customer_name,
        sourceDetail: `row ${deal.sheet_row} · ${deal.status ?? "-"}`,
        sourceOwner: owner,
        sourceStatus: deal.status,
        amount,
        linkStatus: null,
        targetType: null,
        targetId: null,
        targetLabel: null,
        confidence: null,
        autoConfirmed: false,
        confirmedAt: null,
        updatedAt: null,
        placeholder,
      })
      continue
    }

    for (const link of dealLinks) {
      rows.push(
        toRow(link, "branch_rev_sheet", {
          sourceLabel: deal.customer_name,
          sourceDetail: `row ${deal.sheet_row} · ${deal.status ?? "-"}`,
          sourceOwner: owner,
          sourceStatus: deal.status,
          amount,
          placeholder,
        })
      )
    }
  }

  // Xiaoshouyi/lead links: review queue comes from generated link rows.
  for (const link of links) {
    if (link.source_system !== "xiaoshouyi" && link.source_system !== "lead") continue
    if (
      link.source_system === "xiaoshouyi" &&
      !isKoreaScopedOwner(
        getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
        koreaManagers
      )
    ) {
      continue
    }
    rows.push(toRow(link, link.source_system as CrmMatchingSourceSystem))
  }

  for (const row of rows) {
    if (row.placeholder) continue
    const bucket = summary[row.sourceSystem]
    if (row.linkStatus === "candidate" || row.linkStatus === "stale") bucket.reviewCount += 1
    if (row.linkStatus === "confirmed") {
      bucket.confirmedCount += 1
      if (row.autoConfirmed) bucket.autoConfirmedCount += 1
    }
  }

  rows.sort((a, b) => {
    if (a.placeholder !== b.placeholder) return a.placeholder ? 1 : -1
    const rankGap = statusRank(a.linkStatus) - statusRank(b.linkStatus)
    if (rankGap !== 0) return rankGap
    const amountGap = (b.amount ?? 0) - (a.amount ?? 0)
    if (amountGap !== 0) return amountGap
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })

  const totals = {
    reviewCount: SOURCE_SYSTEMS.reduce((sum, system) => sum + summary[system].reviewCount, 0),
    confirmedCount: SOURCE_SYSTEMS.reduce((sum, system) => sum + summary[system].confirmedCount, 0),
    autoConfirmedCount: SOURCE_SYSTEMS.reduce((sum, system) => sum + summary[system].autoConfirmedCount, 0),
    unmatchedCount: SOURCE_SYSTEMS.reduce((sum, system) => sum + summary[system].unmatchedCount, 0),
    sheetMatchedRatio: sheetMatchableRows > 0 ? sheetConfirmedRows / sheetMatchableRows : null,
  }

  return {
    generatedAt: new Date().toISOString(),
    rows,
    summary,
    totals,
    warnings,
  }
}
