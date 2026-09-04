import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import { getBranchRevSourceRecordKey, isPlaceholderCrmName } from "@/lib/crm-source-linking"
import {
  classifyCrmSourceLinkReviewValidation,
  getCrmSourceLinkIdentity,
  LEGACY_ALIAS_VALIDATION_MESSAGE,
  RETIRED_SIBLING_VALIDATION_MESSAGE,
  UNSAFE_MATCHING_EVIDENCE_MESSAGE,
  type CrmMatchAliasValidationRow,
  type CrmSourceLinkValidationState,
} from "@/lib/crm/source-link-validation"
import {
  buildMatchingAccountServiceIndex,
  resolveMatchingAccountService,
  type MatchingAccountServiceIndex,
  type MatchingAccountServiceRow,
} from "@/lib/crm/matching-account-service"
import type { CrmSourceLinkStatus } from "@/lib/admin-crm-revenue-types"
import { EXTERNAL_CRM_KOREA_ONLY, getKoreaTeamManagerSet, isKoreaScopedOwner, isKoreaTeamLabel } from "@/lib/admin-crm-scope"
import { resolveOwnerName } from "@/lib/external-crm/owner-names"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePagedResult } from "@/lib/supabase/pagination"

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
  validationState: CrmSourceLinkValidationState
  validationMessage: string | null
  /**
   * 연결 확정 전에 확인해야 하는 EEO 계정 두 값 — 서비스 기간과 계정 잔액.
   * 링크가 EEO 계정까지 이어지지 않는 행은 null 이며, 화면은 값을 지어내지 않는다.
   * accountSyncedAt 은 이 두 값이 언제 찍힌 것인지 — 외부 CRM 동기화는 수동이라
   * 며칠 묵은 값일 수 있어 신선도를 함께 노출한다.
   */
  accountBalance: number | null
  accountExpireAt: string | null
  accountSyncedAt: string | null
}

export interface CrmMatchingSourceSummary {
  reviewCount: number
  invalidReviewCount: number
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
    invalidReviewCount: number
    confirmedCount: number
    autoConfirmedCount: number
    unmatchedCount: number
    sheetMatchedRatio: number | null
  }
  warnings: string[]
  page: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
    hasPrevious: boolean
  }
}

export type CrmMatchingSourceFilter = "all" | CrmMatchingSourceSystem
export type CrmMatchingStatusFilter = "review" | "invalid" | "auto" | "confirmed" | "rejected" | "all"

export interface AdminCrmMatchingInboxQuery {
  source?: CrmMatchingSourceFilter
  status?: CrmMatchingStatusFilter
  name?: string
  limit?: number
  offset?: number
  fresh?: boolean
}

export type AdminCrmMatchingSnapshot = Omit<AdminCrmMatchingInbox, "rows" | "page"> & {
  rows: CrmMatchingRow[]
}

interface SheetDealRow {
  id: string
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

interface MatchingOwnerRow {
  external_id: string
  display_name: string | null
  korean_name?: string | null
  is_excluded?: boolean | null
}

export interface CrmMatchingLookupPlan {
  ownerIds: string[]
  missingTargetTypes: string[]
}

const SHEET_INACTIVE_PATTERN = /취소|해지|드랍|드롭|중단|보류|cancel|drop|lost/i
const SOURCE_SYSTEMS: CrmMatchingSourceSystem[] = ["branch_rev_sheet", "xiaoshouyi", "lead"]
const MATCHING_PAGE_DEFAULT = 50
const MATCHING_PAGE_MAX = 100
const MATCHING_SNAPSHOT_REVALIDATE_SECONDS = 30
const MATCHING_SOURCE_ROW_LIMIT = 50_000
const MATCHING_LOOKUP_ROW_LIMIT = 20_000

// getAdminCrmMatchingInbox가 쓰는 unstable_cache 태그(하단 getCachedAdminCrmMatchingSnapshot).
// 낮은 우선순위 레버(T4) — Vercel Fluid 인스턴스가 콜드일 때마다 비어 있던 인스턴스 모듈
// 메모(matchingSnapshotMemo, 30초 TTL)를 대체한다.
export const ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG = "admin-crm-matching-snapshot"

function emptyPagedResult<T>(): SupabasePagedResult<T> {
  return { data: [], error: null, count: 0, truncated: false, pages: 0 }
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

export function getCrmMatchingLookupPlan(
  links: Array<
    Pick<SourceLinkRow, "source_system" | "target_type" | "metadata">
  >
): CrmMatchingLookupPlan {
  const ownerIds = new Set<string>()
  const missingTargetTypes = new Set<string>()

  for (const link of links) {
    if (!getMetadataString(link.metadata, "target_label")) {
      missingTargetTypes.add(link.target_type)
    }
    if (link.source_system !== "xiaoshouyi") continue
    const ownerId =
      getMetadataString(link.metadata, "owner_name") ??
      getMetadataString(link.metadata, "source_owner")
    if (ownerId) ownerIds.add(ownerId)
  }

  return {
    ownerIds: Array.from(ownerIds),
    missingTargetTypes: Array.from(missingTargetTypes),
  }
}

async function fetchMatchingOwnerRows(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  ownerIds: string[],
  source: "external" | "override"
) {
  const rows: MatchingOwnerRow[] = []
  let error: { message?: string } | null = null

  // PostgREST의 URL 길이를 제한하면서도 여러 소유자 배치를 직렬 waterfall로 만들지 않는다.
  const batches = chunkValues(ownerIds, 100)
  for (let index = 0; index < batches.length; index += 4) {
    const results = await Promise.all(
      batches.slice(index, index + 4).map((ids) => {
        if (source === "external") {
          return sb
            .from("external_crm_records")
            .select("external_id, display_name")
            .eq("source_system", "xiaoshouyi")
            .eq("object_api_key", "User")
            .in("external_id", ids)
        }
        return sb
          .from("crm_xiaoshouyi_owner_names")
          .select("external_id, display_name, korean_name, is_excluded")
          .in("external_id", ids)
      })
    )

    for (const result of results) {
      if (result.error) {
        error = result.error
        continue
      }
      rows.push(...((result.data ?? []) as MatchingOwnerRow[]))
    }
  }

  return { rows, error }
}

async function loadMatchingOwnerDirectory(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  ownerIds: string[]
) {
  if (ownerIds.length === 0) {
    return {
      ownerNames: new Map<string, string>(),
      excludedOwnerIds: new Set<string>(),
      warning: null,
    }
  }

  const [external, overrides] = await Promise.all([
    fetchMatchingOwnerRows(sb, ownerIds, "external"),
    fetchMatchingOwnerRows(sb, ownerIds, "override"),
  ])
  const ownerNames = new Map<string, string>()
  const excludedOwnerIds = new Set<string>()

  for (const row of external.rows) {
    if (row.external_id && row.display_name) ownerNames.set(String(row.external_id), row.display_name)
  }
  for (const row of overrides.rows) {
    const ownerId = String(row.external_id)
    const name = row.korean_name?.trim() || row.display_name
    if (name) ownerNames.set(ownerId, name)
    if (row.is_excluded) excludedOwnerIds.add(ownerId)
  }

  return {
    ownerNames,
    excludedOwnerIds,
    warning:
      external.error || overrides.error
        ? "일부 Neo CRM 담당자 이름을 읽지 못해 원본 ID로 표시합니다."
        : null,
  }
}

async function loadFallbackTargetNames(
  sb: ReturnType<typeof createSupabaseAdminClient>,
  missingTargetTypes: string[]
) {
  const missingTargetTypeSet = new Set(missingTargetTypes)

  // 신규 링크는 target_label을 저장한다. 과거 링크에만 필요한 전체 이름표 조회를
  // 첫 로드의 공통 경로에서 제거하고 실제 폴백이 필요한 테이블만 늦게 읽는다.
  return Promise.all([
    missingTargetTypeSet.has("partner_account")
      ? fetchSupabasePages<{ id: string; name: string }>({
          maxRows: MATCHING_LOOKUP_ROW_LIMIT,
          fetchPage: (from, to) =>
            sb
              .from("partner_accounts")
              .select("id, name", from === 0 ? { count: "exact" } : undefined)
              .order("id", { ascending: true })
              .range(from, to),
        })
      : Promise.resolve(emptyPagedResult<{ id: string; name: string }>()),
    missingTargetTypeSet.has("customer")
      ? fetchSupabasePages<{ id: string; name: string; campus_name: string | null }>({
          maxRows: MATCHING_LOOKUP_ROW_LIMIT,
          fetchPage: (from, to) =>
            sb
              .from("customers")
              .select("id, name, campus_name", from === 0 ? { count: "exact" } : undefined)
              .order("id", { ascending: true })
              .range(from, to),
        })
      : Promise.resolve(
          emptyPagedResult<{ id: string; name: string; campus_name: string | null }>()
        ),
    missingTargetTypeSet.has("deal")
      ? fetchSupabasePages<{ id: string; deal_code: string; title: string }>({
          maxRows: MATCHING_LOOKUP_ROW_LIMIT,
          fetchPage: (from, to) =>
            sb
              .from("deals")
              .select("id, deal_code, title", from === 0 ? { count: "exact" } : undefined)
              .order("id", { ascending: true })
              .range(from, to),
        })
      : Promise.resolve(emptyPagedResult<{ id: string; deal_code: string; title: string }>()),
  ])
}

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
  return {
    reviewCount: 0,
    invalidReviewCount: 0,
    confirmedCount: 0,
    autoConfirmedCount: 0,
    unmatchedCount: 0,
    unmatchedAmount: 0,
  }
}

function statusRank(status: CrmSourceLinkStatus | null) {
  if (status === null) return 0
  if (status === "candidate") return 1
  if (status === "stale") return 2
  if (status === "confirmed") return 3
  return 4
}

/**
 * 저장 링크가 있어도 현재 확정이나 유효 검토 후보가 하나도 없으면 원천 행은 여전히
 * 미매칭 작업이다. 무효/제외 링크는 이력 탭에 남기되 현재 원천을 기본 큐에서 숨기지 않는다.
 */
export function needsSyntheticUnmatchedRow(rows: CrmMatchingRow[]) {
  const hasConfirmed = rows.some((row) => row.linkStatus === "confirmed")
  const hasActionableReview = rows.some(
    (row) =>
      row.validationState === "valid" &&
      (row.linkStatus === "candidate" || row.linkStatus === "stale")
  )
  return !hasConfirmed && !hasActionableReview
}

async function buildAdminCrmMatchingSnapshot(): Promise<AdminCrmMatchingSnapshot> {
  const sb = createSupabaseAdminClient()
  const warnings: string[] = []

  const [sheetResult, linksResult, aliasesResult, accountServiceResult] = await Promise.all([
    fetchSupabasePages<SheetDealRow>({
      maxRows: MATCHING_SOURCE_ROW_LIMIT,
      fetchPage: (from, to) =>
        sb
          .from("branch_rev_deals")
          .select(
            "id, sheet_row, customer_name, team, manager, status, first_payment, contract_target, monthly_payments",
            from === 0 ? { count: "exact" } : undefined
          )
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchSupabasePages<SourceLinkRow>({
      maxRows: MATCHING_SOURCE_ROW_LIMIT,
      fetchPage: (from, to) =>
        sb
          .from("crm_source_links")
          .select(
            "id, source_system, source_object, source_record_key, normalized_name, target_type, target_id, confidence, status, metadata, confirmed_at, updated_at",
            from === 0 ? { count: "exact" } : undefined
          )
          .in("source_system", SOURCE_SYSTEMS)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
    }),
    fetchSupabasePages<CrmMatchAliasValidationRow & { id: string }>({
      maxRows: MATCHING_LOOKUP_ROW_LIMIT,
      fetchPage: (from, to) =>
        sb
          .from("crm_match_aliases")
          .select(
            "id, source_system, normalized_alias, target_type, target_id, normalized_manager_name",
            from === 0 ? { count: "exact" } : undefined
          )
          .eq("status", "active")
          .in("source_system", ["branch_rev_sheet", "xiaoshouyi"])
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchSupabasePages<MatchingAccountServiceRow>({
      maxRows: MATCHING_LOOKUP_ROW_LIMIT,
      fetchPage: (from, to) =>
        sb
          .from("crm_neo_customer_snapshots")
          .select(
            "account_id, balance, expire_at, source_synced_at, source_refs",
            from === 0 ? { count: "exact" } : undefined
          )
          .order("account_id", { ascending: true })
          .range(from, to),
    }),
  ])

  // 핵심 모수·링크가 잘리거나 실패하면 0건으로 위장하지 않고 라우트 오류로 올린다.
  if (sheetResult.error) throw new Error(`REV 시트 데이터를 읽지 못했습니다: ${sheetResult.error.message}`)
  if (linksResult.error) throw new Error(`source link 데이터를 읽지 못했습니다: ${linksResult.error.message}`)
  if (sheetResult.truncated) throw new Error(`REV 시트 데이터가 ${MATCHING_SOURCE_ROW_LIMIT}건 상한에서 잘렸습니다.`)
  if (linksResult.truncated) throw new Error(`source link 데이터가 ${MATCHING_SOURCE_ROW_LIMIT}건 상한에서 잘렸습니다.`)

  const links = linksResult.data
  const lookupPlan = getCrmMatchingLookupPlan(links)
  const [ownerDirectory, targetNameResults] = await Promise.all([
    loadMatchingOwnerDirectory(sb, lookupPlan.ownerIds),
    loadFallbackTargetNames(sb, lookupPlan.missingTargetTypes),
  ])
  const [accountsResult, customersResult, dealsResult] = targetNameResults
  const { ownerNames, excludedOwnerIds } = ownerDirectory
  if (ownerDirectory.warning) warnings.push(ownerDirectory.warning)

  const lookupResults: Array<[string, SupabasePagedResult<unknown>]> = [
    ["별칭 검증", aliasesResult],
    ["파트너", accountsResult],
    ["고객", customersResult],
    ["거래", dealsResult],
  ]
  for (const [label, result] of lookupResults) {
    if (result.error) warnings.push(`${label} 표시명을 읽지 못해 ID로 표시합니다.`)
    else if (result.truncated) warnings.push(`${label} 표시명이 ${MATCHING_LOOKUP_ROW_LIMIT}건 상한에서 잘렸습니다.`)
  }

  // 잔액·서비스 기간은 검수 보조 정보라, 읽지 못해도 매칭 자체를 막지 않는다.
  // 다만 "값이 없는 것"과 "못 읽은 것"을 구별해야 하므로 경고로 남긴다.
  if (accountServiceResult.error) {
    warnings.push("EEO 계정 잔액·서비스 기간을 읽지 못해 연결 확정 화면에서 생략합니다.")
  } else if (accountServiceResult.truncated) {
    warnings.push(`EEO 계정 잔액·서비스 기간이 ${MATCHING_LOOKUP_ROW_LIMIT}건 상한에서 잘렸습니다.`)
  }
  const accountServiceIndex: MatchingAccountServiceIndex = buildMatchingAccountServiceIndex(
    accountServiceResult.error ? [] : accountServiceResult.data
  )

  const rawSheetDeals = sheetResult.data
  const koreaManagers = getKoreaTeamManagerSet(rawSheetDeals)
  const sheetDeals = rawSheetDeals.filter(
    (deal) => !SHEET_INACTIVE_PATTERN.test(deal.status ?? "") && isKoreaTeamLabel(deal.team)
  )
  // 별칭 카탈로그가 완전하게 읽힌 경우에만 과거 후보를 무효 판정한다.
  // 조회 장애에서 정상 후보를 숨기는 것보다 경고와 함께 검수를 계속하는 편이 안전하다.
  const canValidateAliases = !aliasesResult.error && !aliasesResult.truncated
  const activeAliases = canValidateAliases ? aliasesResult.data : []
  const confirmedSourceIdentities = new Set(
    links
      .filter((link) => link.status === "confirmed")
      .map((link) =>
        getCrmSourceLinkIdentity({
          sourceSystem: link.source_system,
          sourceObject: link.source_object,
          sourceRecordKey: link.source_record_key,
        })
      )
  )

  const accountNameById = new Map(
    accountsResult.data.map((row) => [row.id, row.name])
  )
  const customerNameById = new Map(
    customersResult.data.map((row) => [
      row.id,
      [row.name, row.campus_name].filter(Boolean).join(" · "),
    ])
  )
  const dealNameById = new Map(
    dealsResult.data.map((row) => [
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
    const accountService = resolveMatchingAccountService(accountServiceIndex, {
      sourceSystem,
      sourceObject: link.source_object,
      sourceRecordKey: link.source_record_key,
      targetType: link.target_type,
      targetId: link.target_id,
    })
    const validationState = classifyCrmSourceLinkReviewValidation(
      {
        sourceSystem,
        sourceObject: link.source_object,
        sourceRecordKey: link.source_record_key,
        targetType: link.target_type,
        targetId: link.target_id,
        linkStatus: link.status,
        metadata: link.metadata,
      },
      {
        confirmedSourceIdentities,
        activeAliases,
        canValidateAliases,
        excludedXiaoshouyiOwnerIds: excludedOwnerIds,
      }
    )
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
      // Xiaoshouyi owner_name is a numeric ownerId — resolve to a person name.
      sourceOwner:
        sourceSystem === "xiaoshouyi"
          ? resolveOwnerName(
              getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
              ownerNames
            )
          : getMetadataString(link.metadata, "owner_name") ?? getMetadataString(link.metadata, "source_owner"),
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
      validationState,
      validationMessage:
        validationState === "legacy_unscoped_alias"
          ? LEGACY_ALIAS_VALIDATION_MESSAGE
          : validationState === "unsafe_matching_evidence"
            ? UNSAFE_MATCHING_EVIDENCE_MESSAGE
          : validationState === "retired_confirmed_sibling"
            ? RETIRED_SIBLING_VALIDATION_MESSAGE
            : null,
      accountBalance: accountService?.balance ?? null,
      accountExpireAt: accountService?.expireAt ?? null,
      accountSyncedAt: accountService?.syncedAt ?? null,
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

    const unmatchedRow: CrmMatchingRow = {
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
        validationState: "valid",
        validationMessage: null,
        // 시트 단독(미매칭) 행은 아직 어떤 EEO 계정에도 닿지 않았다.
        accountBalance: null,
        accountExpireAt: null,
        accountSyncedAt: null,
      }

    if (dealLinks.length === 0) {
      rows.push(unmatchedRow)
      continue
    }

    const mappedDealRows = dealLinks.map((link) =>
        toRow(link, "branch_rev_sheet", {
          sourceLabel: deal.customer_name,
          sourceDetail: `row ${deal.sheet_row} · ${deal.status ?? "-"}`,
          sourceOwner: owner,
          sourceStatus: deal.status,
          amount,
          placeholder,
        })
    )
    rows.push(...mappedDealRows)
    if (needsSyntheticUnmatchedRow(mappedDealRows)) {
      rows.push(unmatchedRow)
    }
  }

  // Xiaoshouyi/lead links: review queue comes from generated link rows.
  for (const link of links) {
    if (link.source_system !== "xiaoshouyi" && link.source_system !== "lead") continue
    if (
      link.source_system === "xiaoshouyi" &&
      !EXTERNAL_CRM_KOREA_ONLY &&
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
    if (row.validationState !== "valid") bucket.invalidReviewCount += 1
    else if (row.linkStatus === "candidate" || row.linkStatus === "stale") bucket.reviewCount += 1
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

  const invalidReviewCount = SOURCE_SYSTEMS.reduce(
    (sum, system) => sum + summary[system].invalidReviewCount,
    0
  )
  if (invalidReviewCount > 0) {
    warnings.push(
      `현재 확정 근거가 없는 후보·은퇴 이력 ${invalidReviewCount.toLocaleString("ko-KR")}건을 처리 필요에서 분리했습니다. 검증 제외 탭에서 근거를 확인해 주세요.`
    )
  }

  const totals = {
    reviewCount: SOURCE_SYSTEMS.reduce((sum, system) => sum + summary[system].reviewCount, 0),
    invalidReviewCount,
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

function matchesInboxStatus(row: CrmMatchingRow, status: CrmMatchingStatusFilter) {
  if (status === "all") return true
  // 임시(HW/SW/MKT) 고객은 기존 UI 계약처럼 전체 보기에서만 노출한다.
  if (row.placeholder) return false
  if (status === "invalid") return row.validationState !== "valid"
  if (status === "review") {
    return (
      row.validationState === "valid" &&
      (row.linkStatus === null || row.linkStatus === "candidate" || row.linkStatus === "stale")
    )
  }
  if (status === "auto") return row.linkStatus === "confirmed" && row.autoConfirmed
  if (status === "confirmed") return row.linkStatus === "confirmed"
  return row.linkStatus === "rejected"
}

/**
 * 같은 30초 스냅샷 위에서 필터링·페이징하므로 offset 페이지 경계가 요청 사이에
 * 흔들리지 않는다. 이름 딥링크는 기존 UI와 같게 상태 필터를 우회한다.
 */
export function paginateAdminCrmMatchingInbox(
  snapshot: AdminCrmMatchingSnapshot,
  query: AdminCrmMatchingInboxQuery = {}
): AdminCrmMatchingInbox {
  const source = query.source ?? "all"
  const status = query.status ?? "review"
  const name = (query.name ?? "").trim().toLowerCase()
  const limit = Math.min(MATCHING_PAGE_MAX, Math.max(1, Math.floor(query.limit ?? MATCHING_PAGE_DEFAULT)))

  const filtered = snapshot.rows.filter((row) => {
    if (source !== "all" && row.sourceSystem !== source) return false
    if (name) return row.sourceLabel.toLowerCase().includes(name)
    return matchesInboxStatus(row, status)
  })

  const requestedOffset = Math.max(0, Math.floor(query.offset ?? 0))
  const lastPageOffset = filtered.length === 0 ? 0 : Math.floor((filtered.length - 1) / limit) * limit
  const offset = Math.min(requestedOffset, lastPageOffset)
  const rows = filtered.slice(offset, offset + limit)

  return {
    ...snapshot,
    rows,
    page: {
      limit,
      offset,
      total: filtered.length,
      hasMore: offset + rows.length < filtered.length,
      hasPrevious: offset > 0,
    },
  }
}

// 9-테이블 스냅샷을 unstable_cache(30초)로 감싼다. buildAdminCrmMatchingSnapshot는 요청 무관
// 서비스 롤 클라이언트(createSupabaseAdminClient)만 쓰는 순수 함수라 캐시 안에서 안전하다
// (lib/admin-crm-overview.ts·lib/admin-crm-revenue.ts와 동일 논리). 예전 인스턴스 모듈
// 메모(matchingSnapshotMemo)는 실패한 빌드를 자체적으로 캐시에서 지웠는데, unstable_cache는
// throw한 호출을 애초에 캐시에 쓰지 않으므로(성공 값만 저장) 별도 처리가 필요 없다.
const getCachedAdminCrmMatchingSnapshot = unstable_cache(
  buildAdminCrmMatchingSnapshot,
  [ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG],
  { revalidate: MATCHING_SNAPSHOT_REVALIDATE_SECONDS, tags: [ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG] }
)

async function getAdminCrmMatchingSnapshot(fresh: boolean) {
  if (fresh) {
    const value = await buildAdminCrmMatchingSnapshot()
    // 새로고침 직후 다음 읽기는 반드시 새 값을 봐야 한다 — T1의 force와 같은 컨벤션:
    // revalidateTag(tag, { expire: 0 })로 태그를 즉시 하드 만료해 다음
    // getCachedAdminCrmMatchingSnapshot() 호출이 재계산하게 한다
    // (docs/active/admin-performance-plan-2026-09-02.md §4.4).
    revalidateTag(ADMIN_CRM_MATCHING_SNAPSHOT_CACHE_TAG, { expire: 0 })
    return value
  }

  return getCachedAdminCrmMatchingSnapshot()
}

export async function getAdminCrmMatchingInbox(
  query: AdminCrmMatchingInboxQuery = {}
): Promise<AdminCrmMatchingInbox> {
  const snapshot = await getAdminCrmMatchingSnapshot(query.fresh === true)
  return paginateAdminCrmMatchingInbox(snapshot, query)
}
