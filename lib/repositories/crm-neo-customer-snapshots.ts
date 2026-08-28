import "server-only"

import { deriveCustomerRegion, regionCandidatesFromPayload } from "@/lib/crm/region-label"
import { getBranchRevSourceRecordKey, normalizeCrmName } from "@/lib/crm-source-linking"
import { deriveServiceRisk, type ServiceRiskConfidence, type ServiceRiskLevel } from "@/lib/crm/service-risk"
import { deriveEeoBillingMode, readEeoBalance } from "@/lib/crm/eeo-account-fields"
import { deriveConsumptionForecast, type ConsumptionEvent } from "@/lib/crm/eeo-consumption"
import {
  getExcludedXiaoshouyiOwnerIds,
  getXiaoshouyiOwnerNameMap,
  resolveOwnerName,
} from "@/lib/external-crm/owner-names"
import { normalizeRegionLabel } from "@/lib/regions/korea-regions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmNeoCustomerSnapshot,
  CrmNeoCustomerSnapshotInsert,
} from "@/lib/supabase/database.types"
import { fetchSupabasePages, type SupabaseQueryError } from "@/lib/supabase/pagination"

const SOURCE_SYSTEM = "xiaoshouyi"
const SHROFF_OBJECT_API_KEY = "ShroffAccount__c"
const ACCOUNT_OBJECT_API_KEY = "account"
const OPPORTUNITY_OBJECT_API_KEY = "opportunity"
const FINANCIAL_OBJECT_API_KEY = "FinancialInformation__c"
const REFRESH_SCAN_LIMIT = 20_000
const LIST_LIMIT = 10_000
const UPSERT_CHUNK_SIZE = 500
const CUSTOMER_SYNC_FRESHNESS_HOURS = 24

export const CRM_NEO_CUSTOMER_SNAPSHOTS_NOT_READY_MESSAGE =
  "CRM NEO 고객 스냅샷 DB 마이그레이션이 아직 적용되지 않았습니다."

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

interface AccountSnapshotRow {
  external_id: string
  display_name: string | null
  owner_name: string | null
  occurred_at: string | null
  synced_at: string | null
  last_seen_run_id: string | null
  payload: Record<string, unknown> | null
}

interface ShroffSnapshotRow {
  external_id: string
  synced_at: string | null
  last_seen_run_id: string | null
  payload: Record<string, unknown> | null
}

interface FinancialSnapshotRow {
  external_id: string
  payload: Record<string, unknown> | null
}

interface OpportunitySnapshotRow {
  external_id: string
  amount: number | string | null
  synced_at: string | null
  last_seen_run_id: string | null
  payload: Record<string, unknown> | null
}

interface BranchRevRegionRow {
  sheet_row: number
  customer_name: string
  region: string | null
  product_version: string | null
  first_payment: string | null
  contract_target: number | string | null
}

interface SourceLinkRow {
  source_record_key: string
  target_type: string
  target_id: string
}

export interface CrmNeoCustomerRegionHint {
  /** 지역 라벨. 시트에 지역이 비어 있고 과금 유형만 있는 행도 있으므로 null 을 허용한다. */
  label: string | null
  source: "branch_rev_confirmed_link" | "branch_rev_exact_name"
  sourceRecordKey: string | null
  customerName: string | null
  /** 매출시트 J열 원문. 과금 유형(충전제/구독제) 판별의 유일한 원천. */
  productVersion: string | null
}

export interface CrmNeoCustomerRegionHints {
  byAccountId: Map<string, CrmNeoCustomerRegionHint>
  byNormalizedName: Map<string, CrmNeoCustomerRegionHint>
}

interface EeoAggregate {
  balance: number
  expireAt: string | null
  lastClassAt: string | null
  uid: string | null
  syncedAt: string | null
  runIds: string[]
  externalIds: string[]
}

interface OrderAggregate {
  amount: number
  count: number
  syncedAt: string | null
  runIds: string[]
  externalIds: string[]
}

export interface CrmNeoCustomerSnapshotRecord {
  sourceSystem: string
  accountId: string
  accountName: string
  ownerId: string | null
  ownerName: string
  phone: string | null
  uid: string | null
  regionLabel: string | null
  balance: number | null
  expireAt: string | null
  lastClassAt: string | null
  orderAmount: number
  orderCount: number
  hasEeo: boolean
  riskLevel: ServiceRiskLevel
  riskReasons: Array<{ code?: string; label?: string }>
  depletionInDays: number | null
  expireInDays: number | null
  riskConfidence: ServiceRiskConfidence
  freshnessLabel: string | null
  accountSyncedAt: string | null
  shroffSyncedAt: string | null
  opportunitySyncedAt: string | null
  sourceSyncedAt: string | null
  isPartial: boolean
  partialReason: string | null
  isStale: boolean
  staleAt: string | null
  calculatedAt: string
  createdAt: string
  updatedAt: string
}

export interface ListCrmNeoCustomerSnapshotsOptions {
  q?: string
  ownerKeys?: string[]
  sourceSystem?: string
  includeStale?: boolean
  limit?: number
  offset?: number
}

export interface ListCrmNeoCustomerSnapshotsResult {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  generatedAt: string
  syncHealth: {
    shroffAccountSyncedAt: string | null
    shroffAccountAgeHours: number | null
    staleAfterHours: number
    isShroffAccountStale: boolean
  }
  summary: {
    totalCount: number
    withEeoCount: number
    expiringSoonCount: number
    totalBalance: number
    totalOrderAmount: number
  }
  owners: Array<{ ownerId: string; ownerName: string; count: number }>
  rows: CrmNeoCustomerSnapshotRecord[]
}

export interface RefreshCrmNeoCustomerSnapshotsResult {
  ok: boolean
  generatedAt: string
  sourceSystem: string
  scanned: {
    accounts: number
    shroffAccounts: number
    opportunities: number
  }
  upserted: number
  staleMarked: number
  latestSyncedAt: string | null
  partial: boolean
  partialReason: string | null
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null
  const date = numeric == null ? new Date(String(value)) : new Date(numeric)
  if (Number.isNaN(date.getTime())) return null
  if (date.getTime() <= 0) return null
  return date.toISOString()
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key]
  return value == null || value === "" ? null : String(value)
}


function rowNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function payloadIsActivePaidEeo(payload: Record<string, unknown> | null) {
  const serviceVersion = payloadString(payload, "service_version__c")
  if (serviceVersion === "1") return false

  const serviceState = payloadString(payload, "serviceState__c")
  if (serviceState && serviceState !== "1") return false

  return true
}

function payloadExpireAt(payload: Record<string, unknown> | null): string | null {
  return (
    toIso(payload?.["expireTime__c"]) ??
    toIso(payload?.["DateBack__c"]) ??
    toIso(payload?.["ContractEndDate__c"])
  )
}

function latestIso(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

function uniquePush(target: string[], value: string | null | undefined) {
  if (value && !target.includes(value)) target.push(value)
}

function hoursSince(value: string | null, nowMs = Date.now()) {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return null
  return Math.max(0, (nowMs - timestamp) / (60 * 60 * 1000))
}

function buildSyncHealth(shroffAccountSyncedAt: string | null) {
  const shroffAccountAgeHours = hoursSince(shroffAccountSyncedAt)
  return {
    shroffAccountSyncedAt,
    shroffAccountAgeHours,
    staleAfterHours: CUSTOMER_SYNC_FRESHNESS_HOURS,
    isShroffAccountStale:
      shroffAccountAgeHours === null || shroffAccountAgeHours > CUSTOMER_SYNC_FRESHNESS_HOURS,
  }
}

function isMissingSnapshotsTableError(error: SupabaseQueryError) {
  const haystack = [error?.code, error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("crm_neo_customer_snapshots") &&
      (haystack.includes("does not exist") ||
        haystack.includes("could not find") ||
        haystack.includes("schema cache")))
  )
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function safeSearch(value: string | null | undefined) {
  return value?.trim().replace(/[%,()\\]/g, " ").replace(/\s+/g, " ") ?? ""
}

function fetchExternalRows<T>(
  sb: SupabaseAdminClient,
  objectApiKey: string,
  select: string,
  sourceSystem: string
) {
  return fetchSupabasePages<T>({
    maxRows: REFRESH_SCAN_LIMIT,
    fetchPage: async (from, to) => {
      const { data, error, count } = await sb
        .from("external_crm_records")
        .select(select, { count: "exact" })
        .eq("source_system", sourceSystem)
        .eq("object_api_key", objectApiKey)
        .eq("is_stale", false)
        .range(from, to)
      return { data, error, count }
    },
  })
}

/**
 * 입출금 원장을 EEO(ShroffAccount) 단위로 모은다.
 * 소진 예상일의 유일한 돈 단위 원천 — ResourceInformation__c 는 단위가 뒤섞여 쓸 수 없다.
 */
function aggregateFinancialEvents(rows: FinancialSnapshotRow[]) {
  const byShroff = new Map<string, ConsumptionEvent[]>()
  for (const row of rows) {
    const shroffId = payloadString(row.payload, "ShroffAccInfor__c")
    if (!shroffId) continue
    const amount = row.payload?.["AmountReal__c"]
    const occurredAt = row.payload?.["GetDate__c"]
    const list = byShroff.get(shroffId)
    const event: ConsumptionEvent = {
      amount: typeof amount === "number" ? amount : Number(amount ?? Number.NaN),
      occurredAt: typeof occurredAt === "number" || typeof occurredAt === "string" ? occurredAt : null,
    }
    if (list) list.push(event)
    else byShroff.set(shroffId, [event])
  }
  return byShroff
}

function aggregateEeo(rows: ShroffSnapshotRow[]) {
  const byAccount = new Map<string, EeoAggregate>()
  for (const row of rows) {
    const accountId = payloadString(row.payload, "Account__c")
    if (!accountId) continue
    // 잔액은 여신이 섞이지 않은 표시 정본에서 읽는다 — lib/crm/eeo-account-fields 참고.
    const balance = readEeoBalance(row.payload) ?? 0
    const expireAt = payloadIsActivePaidEeo(row.payload) ? payloadExpireAt(row.payload) : null
    const lastClassAt = toIso(row.payload?.["LastClassDate__c"])
    const uid = payloadString(row.payload, "uid__c")
    const existing = byAccount.get(accountId)
    if (!existing) {
      byAccount.set(accountId, {
        balance,
        expireAt,
        lastClassAt,
        uid,
        syncedAt: row.synced_at,
        runIds: row.last_seen_run_id ? [row.last_seen_run_id] : [],
        externalIds: row.external_id ? [row.external_id] : [],
      })
      continue
    }

    existing.balance += balance
    // 고객 단위 연장 창은 활성 유료 EEO 중 마지막 만료일을 기준으로 잡는다.
    // 일부 서비스만 먼저 끝나는 다중 EEO 고객을 고객 전체 연장 대상으로 오인하지 않는다.
    existing.expireAt = latestIso(existing.expireAt, expireAt)
    if (lastClassAt && (!existing.lastClassAt || lastClassAt > existing.lastClassAt)) existing.lastClassAt = lastClassAt
    if (!existing.uid && uid) existing.uid = uid
    existing.syncedAt = latestIso(existing.syncedAt, row.synced_at)
    uniquePush(existing.runIds, row.last_seen_run_id)
    uniquePush(existing.externalIds, row.external_id)
  }
  return byAccount
}

function aggregateOrders(rows: OpportunitySnapshotRow[]) {
  const byAccount = new Map<string, OrderAggregate>()
  for (const row of rows) {
    const accountId = payloadString(row.payload, "accountId")
    if (!accountId) continue
    const existing = byAccount.get(accountId) ?? {
      amount: 0,
      count: 0,
      syncedAt: null,
      runIds: [],
      externalIds: [],
    }
    existing.amount += rowNumber(row.amount)
    existing.count += 1
    existing.syncedAt = latestIso(existing.syncedAt, row.synced_at)
    uniquePush(existing.runIds, row.last_seen_run_id)
    uniquePush(existing.externalIds, row.external_id)
    byAccount.set(accountId, existing)
  }
  return byAccount
}

function partialReasonFor(parts: string[]) {
  return parts.length > 0 ? `${parts.join(", ")} 스냅샷 일부가 누락되어 읽기 모델이 부분 갱신되었습니다.` : null
}

function emptyRegionHints(): CrmNeoCustomerRegionHints {
  return { byAccountId: new Map(), byNormalizedName: new Map() }
}

function targetKey(row: Pick<SourceLinkRow, "target_type" | "target_id">) {
  return `${row.target_type}:${row.target_id}`
}

function resolveSingleRegionHint(hints: CrmNeoCustomerRegionHint[]) {
  if (hints.length === 0) return null
  const labels = new Set(hints.map((hint) => hint.label))
  if (labels.size !== 1) return null
  return (
    hints.find((hint) => hint.source === "branch_rev_confirmed_link") ??
    hints[0]
  )
}

function buildResolvedRegionHintMap(entries: Array<[string, CrmNeoCustomerRegionHint]>) {
  const grouped = new Map<string, CrmNeoCustomerRegionHint[]>()
  for (const [key, hint] of entries) {
    const list = grouped.get(key) ?? []
    list.push(hint)
    grouped.set(key, list)
  }

  const resolved = new Map<string, CrmNeoCustomerRegionHint>()
  for (const [key, hints] of grouped) {
    const hint = resolveSingleRegionHint(hints)
    if (hint) resolved.set(key, hint)
  }
  return resolved
}

export async function loadBranchRevRegionHints(sb: SupabaseAdminClient): Promise<CrmNeoCustomerRegionHints> {
  const [revResult, branchLinksResult, neoLinksResult] = await Promise.all([
    sb
      .from("branch_rev_deals")
      .select("sheet_row, customer_name, region, product_version, first_payment, contract_target")
      .limit(5000),
    sb
      .from("crm_source_links")
      .select("source_record_key, target_type, target_id")
      .eq("source_system", "branch_rev_sheet")
      .eq("source_object", "branch_rev_deals")
      .eq("status", "confirmed")
      .limit(5000),
    sb
      .from("crm_source_links")
      .select("source_record_key, target_type, target_id")
      .eq("source_system", SOURCE_SYSTEM)
      .eq("source_object", ACCOUNT_OBJECT_API_KEY)
      .eq("status", "confirmed")
      .limit(5000),
  ])

  if (revResult.error || branchLinksResult.error || neoLinksResult.error) {
    return emptyRegionHints()
  }

  const revHintsBySourceKey = new Map<string, CrmNeoCustomerRegionHint>()
  const exactNameEntries: Array<[string, CrmNeoCustomerRegionHint]> = []

  for (const row of (revResult.data ?? []) as BranchRevRegionRow[]) {
    const label = normalizeRegionLabel(row.region)
    const productVersion = row.product_version?.trim() || null
    // 지역만 보던 시절엔 지역 없는 행을 버렸다. 이제 과금 유형도 실어 나르므로
    // 둘 중 하나라도 있으면 힌트를 만든다.
    if (!label && !productVersion) continue

    const sourceRecordKey = getBranchRevSourceRecordKey({
      sheet_row: row.sheet_row,
      customer_name: row.customer_name,
      first_payment: row.first_payment,
      contract_target: rowNumber(row.contract_target),
    })
    const baseHint: Omit<CrmNeoCustomerRegionHint, "source"> = {
      label,
      sourceRecordKey,
      customerName: row.customer_name,
      productVersion,
    }
    revHintsBySourceKey.set(sourceRecordKey, { ...baseHint, source: "branch_rev_confirmed_link" })

    const normalizedName = normalizeCrmName(row.customer_name)
    if (normalizedName) {
      exactNameEntries.push([normalizedName, { ...baseHint, source: "branch_rev_exact_name" }])
    }
  }

  const branchHintsByTarget: Array<[string, CrmNeoCustomerRegionHint]> = []
  for (const link of (branchLinksResult.data ?? []) as SourceLinkRow[]) {
    const hint = revHintsBySourceKey.get(link.source_record_key)
    if (!hint) continue
    branchHintsByTarget.push([targetKey(link), hint])
  }

  const resolvedBranchHintsByTarget = buildResolvedRegionHintMap(branchHintsByTarget)
  const accountEntries: Array<[string, CrmNeoCustomerRegionHint]> = []
  for (const link of (neoLinksResult.data ?? []) as SourceLinkRow[]) {
    const hint = resolvedBranchHintsByTarget.get(targetKey(link))
    if (!hint) continue
    accountEntries.push([link.source_record_key, hint])
  }

  return {
    byAccountId: buildResolvedRegionHintMap(accountEntries),
    byNormalizedName: buildResolvedRegionHintMap(exactNameEntries),
  }
}

export function buildCrmNeoCustomerSnapshotInserts(input: {
  accounts: AccountSnapshotRow[]
  shroffAccounts: ShroffSnapshotRow[]
  opportunities: OpportunitySnapshotRow[]
  ownerNames: Map<string, string>
  excludedOwnerIds: Set<string>
  regionHints?: CrmNeoCustomerRegionHints
  /** ShroffAccount external_id → 입출금 원장 이벤트. 없으면 소진 예상일을 내지 않는다. */
  financialEvents?: Map<string, ConsumptionEvent[]>
  now?: Date
  sourceSystem?: string
  partialReason?: string | null
}): CrmNeoCustomerSnapshotInsert[] {
  const now = input.now ?? new Date()
  const calculatedAt = now.toISOString()
  const sourceSystem = input.sourceSystem ?? SOURCE_SYSTEM
  const eeoByAccount = aggregateEeo(input.shroffAccounts)
  const orderByAccount = aggregateOrders(input.opportunities)
  const regionHints = input.regionHints ?? emptyRegionHints()
  const inserts: CrmNeoCustomerSnapshotInsert[] = []

  for (const account of input.accounts) {
    const ownerId = account.owner_name?.trim() || null
    if (ownerId && input.excludedOwnerIds.has(ownerId)) continue

    const accountId = account.external_id
    const eeo = eeoByAccount.get(accountId)
    const order = orderByAccount.get(accountId)
    const ownerName = resolveOwnerName(ownerId, input.ownerNames)
    const accountName = account.display_name ?? payloadString(account.payload, "accountName") ?? accountId
    const payloadRegion = deriveCustomerRegion(regionCandidatesFromPayload(account.payload))
    const revRegionHint =
      regionHints.byAccountId.get(accountId) ??
      regionHints.byNormalizedName.get(normalizeCrmName(accountName))
    const regionLabel = revRegionHint?.label ?? (payloadRegion.source === "unspecified" ? null : payloadRegion.label)
    const regionSource = revRegionHint?.source ?? (payloadRegion.source === "unspecified" ? null : `neo_payload_${payloadRegion.source}`)
    const accountSyncedAt = account.synced_at ?? account.occurred_at ?? null
    const sourceSyncedAt = latestIso(accountSyncedAt, eeo?.syncedAt, order?.syncedAt)
    const billingMode = deriveEeoBillingMode(revRegionHint?.productVersion)
    // 한 고객이 EEO 계정을 여럿 가질 수 있어, 소속 계정의 원장을 합쳐 하나의 소비 흐름으로 본다.
    const ledgerEvents: ConsumptionEvent[] = []
    if (input.financialEvents && eeo) {
      for (const shroffId of eeo.externalIds) {
        const events = input.financialEvents.get(shroffId)
        if (events) ledgerEvents.push(...events)
      }
    }
    const forecast = deriveConsumptionForecast({
      balance: eeo ? eeo.balance : null,
      events: ledgerEvents,
      now,
    })
    const risk = deriveServiceRisk({
      hasNeoData: Boolean(eeo),
      expireAt: eeo?.expireAt ?? null,
      balance: eeo ? eeo.balance : null,
      lastClassAt: eeo?.lastClassAt ?? null,
      syncedAt: eeo?.syncedAt ?? accountSyncedAt,
      billingMode,
      depletionInDays: forecast.daysLeft,
      now,
    })

    inserts.push({
      source_system: sourceSystem,
      account_id: accountId,
      account_name: accountName,
      owner_id: ownerId,
      owner_name: ownerName,
      phone: payloadString(account.payload, "phone"),
      uid: eeo?.uid ?? null,
      region_label: regionLabel,
      billing_mode: billingMode,
      balance: eeo ? eeo.balance : null,
      daily_burn: forecast.dailyBurn,
      depletion_in_days: forecast.daysLeft,
      burn_event_count: forecast.eventCount,
      burn_confidence: forecast.confidence,
      expire_at: eeo?.expireAt ?? null,
      last_class_at: eeo?.lastClassAt ?? null,
      order_amount: order?.amount ?? 0,
      order_count: order?.count ?? 0,
      has_eeo: Boolean(eeo),
      risk_level: risk.level,
      risk_reasons: risk.reasons.map((reason) => ({ code: reason.code, label: reason.label })),
      expire_in_days: risk.expireInDays,
      risk_confidence: risk.confidence,
      freshness_label: risk.freshnessLabel,
      account_synced_at: accountSyncedAt,
      shroff_synced_at: eeo?.syncedAt ?? null,
      opportunity_synced_at: order?.syncedAt ?? null,
      source_synced_at: sourceSyncedAt,
      source_run_ids: {
        account: account.last_seen_run_id ?? null,
        shroffAccounts: eeo?.runIds ?? [],
        opportunities: order?.runIds ?? [],
      },
      source_refs: {
        accountExternalId: account.external_id,
        shroffAccountExternalIds: eeo?.externalIds.slice(0, 20) ?? [],
        opportunityExternalIds: order?.externalIds.slice(0, 20) ?? [],
        regionSource,
        regionSourceRecordKey: revRegionHint?.sourceRecordKey ?? null,
        regionSourceCustomerName: revRegionHint?.customerName ?? null,
      },
      is_partial: Boolean(input.partialReason),
      partial_reason: input.partialReason ?? null,
      is_stale: false,
      stale_at: null,
      calculated_at: calculatedAt,
    })
  }

  return inserts
}

async function upsertInChunks(sb: SupabaseAdminClient, rows: CrmNeoCustomerSnapshotInsert[]) {
  let upserted = 0
  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE)
    const { error } = await sb
      .from("crm_neo_customer_snapshots")
      .upsert(chunk, { onConflict: "source_system,account_id" })
    if (error) {
      if (isMissingSnapshotsTableError(error)) throw new Error(CRM_NEO_CUSTOMER_SNAPSHOTS_NOT_READY_MESSAGE)
      throw new Error(`[crm-neo-customer-snapshots] 저장 실패: ${error.message}`)
    }
    upserted += chunk.length
  }
  return upserted
}

export async function refreshCrmNeoCustomerSnapshotsFromExternalRecords(options: {
  now?: Date
  sourceSystem?: string
} = {}): Promise<RefreshCrmNeoCustomerSnapshotsResult> {
  const sb = createSupabaseAdminClient()
  const now = options.now ?? new Date()
  const generatedAt = now.toISOString()
  const sourceSystem = options.sourceSystem ?? SOURCE_SYSTEM

  const [accountResult, shroffResult, opportunityResult, financialResult, ownerNames, excludedOwnerIds, regionHints] = await Promise.all([
    fetchExternalRows<AccountSnapshotRow>(
      sb,
      ACCOUNT_OBJECT_API_KEY,
      "external_id, display_name, owner_name, occurred_at, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<ShroffSnapshotRow>(
      sb,
      SHROFF_OBJECT_API_KEY,
      "external_id, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<OpportunitySnapshotRow>(
      sb,
      OPPORTUNITY_OBJECT_API_KEY,
      "external_id, amount, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<FinancialSnapshotRow>(
      sb,
      FINANCIAL_OBJECT_API_KEY,
      "external_id, payload",
      sourceSystem
    ),
    getXiaoshouyiOwnerNameMap(sb),
    getExcludedXiaoshouyiOwnerIds(sb),
    loadBranchRevRegionHints(sb),
  ])

  if (accountResult.error) {
    throw new Error(`[crm-neo-customer-snapshots] account 스냅샷 조회 실패: ${accountResult.error.message}`)
  }

  const partialParts: string[] = []
  if (accountResult.truncated) partialParts.push("account")
  if (shroffResult.error || shroffResult.truncated) partialParts.push(SHROFF_OBJECT_API_KEY)
  if (opportunityResult.error || opportunityResult.truncated) partialParts.push(OPPORTUNITY_OBJECT_API_KEY)
  const partialReason = partialReasonFor(partialParts)

  const rows = buildCrmNeoCustomerSnapshotInserts({
    // 원장은 소진 예상일에만 쓰는 보조 신호다. 읽지 못해도 스냅샷 자체는 만든다.
    financialEvents: aggregateFinancialEvents(financialResult.error ? [] : financialResult.data),
    accounts: accountResult.data,
    shroffAccounts: shroffResult.error ? [] : shroffResult.data,
    opportunities: opportunityResult.error ? [] : opportunityResult.data,
    ownerNames,
    excludedOwnerIds,
    regionHints,
    now,
    sourceSystem,
    partialReason,
  })

  const upserted = await upsertInChunks(sb, rows)
  let staleMarked = 0

  if (!accountResult.truncated) {
    const { data, error } = await sb
      .from("crm_neo_customer_snapshots")
      .update({ is_stale: true, stale_at: generatedAt })
      .eq("source_system", sourceSystem)
      .neq("calculated_at", generatedAt)
      .select("account_id")
    if (error) {
      if (isMissingSnapshotsTableError(error)) throw new Error(CRM_NEO_CUSTOMER_SNAPSHOTS_NOT_READY_MESSAGE)
      throw new Error(`[crm-neo-customer-snapshots] stale 표시 실패: ${error.message}`)
    }
    staleMarked = data?.length ?? 0
  }

  return {
    ok: true,
    generatedAt,
    sourceSystem,
    scanned: {
      accounts: accountResult.data.length,
      shroffAccounts: shroffResult.error ? 0 : shroffResult.data.length,
      opportunities: opportunityResult.error ? 0 : opportunityResult.data.length,
    },
    upserted,
    staleMarked,
    latestSyncedAt: rows.map((row) => row.source_synced_at).filter(Boolean).sort().at(-1) ?? null,
    partial: Boolean(partialReason),
    partialReason,
  }
}

export function toCrmNeoCustomerSnapshotRecord(row: CrmNeoCustomerSnapshot): CrmNeoCustomerSnapshotRecord {
  return {
    sourceSystem: row.source_system,
    accountId: row.account_id,
    accountName: row.account_name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    phone: row.phone,
    uid: row.uid,
    regionLabel: row.region_label,
    balance: row.balance,
    expireAt: row.expire_at,
    lastClassAt: row.last_class_at,
    orderAmount: row.order_amount,
    orderCount: row.order_count,
    hasEeo: row.has_eeo,
    riskLevel: row.risk_level,
    riskReasons: row.risk_reasons as Array<{ code?: string; label?: string }>,
    depletionInDays: row.depletion_in_days,
    expireInDays: row.expire_in_days,
    riskConfidence: row.risk_confidence,
    freshnessLabel: row.freshness_label,
    accountSyncedAt: row.account_synced_at,
    shroffSyncedAt: row.shroff_synced_at,
    opportunitySyncedAt: row.opportunity_synced_at,
    sourceSyncedAt: row.source_synced_at,
    isPartial: row.is_partial,
    partialReason: row.partial_reason,
    isStale: row.is_stale,
    staleAt: row.stale_at,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function emptyListResult(message: string | null): ListCrmNeoCustomerSnapshotsResult {
  return {
    ok: !message,
    error: message,
    latestSyncedAt: null,
    generatedAt: new Date().toISOString(),
    syncHealth: buildSyncHealth(null),
    summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
    owners: [],
    rows: [],
  }
}

function snapshotInsertToRecord(
  row: CrmNeoCustomerSnapshotInsert,
  fallbackIso: string
): CrmNeoCustomerSnapshotRecord {
  return {
    sourceSystem: row.source_system,
    accountId: row.account_id,
    accountName: row.account_name,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    phone: row.phone,
    uid: row.uid,
    regionLabel: row.region_label,
    balance: row.balance,
    expireAt: row.expire_at,
    lastClassAt: row.last_class_at,
    orderAmount: row.order_amount,
    orderCount: row.order_count,
    hasEeo: row.has_eeo,
    riskLevel: row.risk_level,
    riskReasons: row.risk_reasons as Array<{ code?: string; label?: string }>,
    depletionInDays: row.depletion_in_days,
    expireInDays: row.expire_in_days,
    riskConfidence: row.risk_confidence,
    freshnessLabel: row.freshness_label,
    accountSyncedAt: row.account_synced_at,
    shroffSyncedAt: row.shroff_synced_at,
    opportunitySyncedAt: row.opportunity_synced_at,
    sourceSyncedAt: row.source_synced_at,
    isPartial: row.is_partial,
    partialReason: row.partial_reason,
    isStale: row.is_stale,
    staleAt: row.stale_at,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at ?? fallbackIso,
    updatedAt: row.updated_at ?? fallbackIso,
  }
}

function snapshotMatchesSearch(row: CrmNeoCustomerSnapshotRecord, search: string) {
  if (!search) return true
  const normalized = search.toLowerCase()
  return [
    row.accountName,
    row.phone,
    row.uid,
    row.ownerName,
    row.regionLabel,
  ]
    .filter(Boolean)
    .some((value) => value!.toLowerCase().includes(normalized))
}

function buildSnapshotListResult(
  rows: CrmNeoCustomerSnapshotRecord[],
  totalCount: number
): ListCrmNeoCustomerSnapshotsResult {
  const nowMs = Date.now()
  const expiringThresholdMs = nowMs + 60 * 24 * 60 * 60 * 1000
  const ownerCounts = new Map<string, { ownerName: string; count: number }>()
  let withEeoCount = 0
  let expiringSoonCount = 0
  let totalBalance = 0
  let totalOrderAmount = 0

  for (const row of rows) {
    if (row.hasEeo) withEeoCount += 1
    if (row.expireAt) {
      const expMs = new Date(row.expireAt).getTime()
      if (expMs >= nowMs && expMs <= expiringThresholdMs) expiringSoonCount += 1
    }
    totalBalance += row.balance ?? 0
    totalOrderAmount += row.orderAmount
    if (row.ownerId) {
      const oc = ownerCounts.get(row.ownerId) ?? { ownerName: row.ownerName, count: 0 }
      oc.count += 1
      ownerCounts.set(row.ownerId, oc)
    }
  }

  const latestSyncedAt = rows.map((row) => row.shroffSyncedAt ?? row.sourceSyncedAt).filter(Boolean).sort().at(-1) ?? null

  return {
    ok: true,
    error: null,
    latestSyncedAt,
    generatedAt: new Date().toISOString(),
    syncHealth: buildSyncHealth(latestSyncedAt),
    summary: {
      totalCount,
      withEeoCount,
      expiringSoonCount,
      totalBalance,
      totalOrderAmount,
    },
    owners: Array.from(ownerCounts.entries())
      .map(([ownerId, value]) => ({ ownerId, ownerName: value.ownerName, count: value.count }))
      .sort((a, b) => b.count - a.count || a.ownerName.localeCompare(b.ownerName, "ko")),
    rows,
  }
}

async function listCrmNeoCustomerSnapshotsFromExternalRecords(
  options: ListCrmNeoCustomerSnapshotsOptions = {}
): Promise<ListCrmNeoCustomerSnapshotsResult> {
  const sb = createSupabaseAdminClient()
  const now = new Date()
  const sourceSystem = options.sourceSystem ?? SOURCE_SYSTEM
  const limit = clampInteger(options.limit, LIST_LIMIT, 1, LIST_LIMIT)
  const offset = clampInteger(options.offset, 0, 0, 100_000)

  const [accountResult, shroffResult, opportunityResult, financialResult, ownerNames, excludedOwnerIds, regionHints] = await Promise.all([
    fetchExternalRows<AccountSnapshotRow>(
      sb,
      ACCOUNT_OBJECT_API_KEY,
      "external_id, display_name, owner_name, occurred_at, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<ShroffSnapshotRow>(
      sb,
      SHROFF_OBJECT_API_KEY,
      "external_id, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<OpportunitySnapshotRow>(
      sb,
      OPPORTUNITY_OBJECT_API_KEY,
      "external_id, amount, synced_at, last_seen_run_id, payload",
      sourceSystem
    ),
    fetchExternalRows<FinancialSnapshotRow>(
      sb,
      FINANCIAL_OBJECT_API_KEY,
      "external_id, payload",
      sourceSystem
    ),
    getXiaoshouyiOwnerNameMap(sb),
    getExcludedXiaoshouyiOwnerIds(sb),
    loadBranchRevRegionHints(sb),
  ])

  if (accountResult.error) {
    return emptyListResult(`external_crm_records(account): ${accountResult.error.message}`)
  }

  const partialParts: string[] = ["crm_neo_customer_snapshots 미적용"]
  if (accountResult.truncated) partialParts.push("account")
  if (shroffResult.error || shroffResult.truncated) partialParts.push(SHROFF_OBJECT_API_KEY)
  if (opportunityResult.error || opportunityResult.truncated) partialParts.push(OPPORTUNITY_OBJECT_API_KEY)
  const partialReason = partialReasonFor(partialParts)

  const fallbackIso = now.toISOString()
  const ownerFilter = new Set(options.ownerKeys ?? [])
  const search = safeSearch(options.q)
  const rows = buildCrmNeoCustomerSnapshotInserts({
    // 원장은 소진 예상일에만 쓰는 보조 신호다. 읽지 못해도 스냅샷 자체는 만든다.
    financialEvents: aggregateFinancialEvents(financialResult.error ? [] : financialResult.data),
    accounts: accountResult.data,
    shroffAccounts: shroffResult.error ? [] : shroffResult.data,
    opportunities: opportunityResult.error ? [] : opportunityResult.data,
    ownerNames,
    excludedOwnerIds,
    regionHints,
    now,
    sourceSystem,
    partialReason,
  })
    .map((row) => snapshotInsertToRecord(row, fallbackIso))
    .filter((row) => options.includeStale || !row.isStale)
    .filter((row) => ownerFilter.size === 0 || (row.ownerId != null && ownerFilter.has(row.ownerId)))
    .filter((row) => snapshotMatchesSearch(row, search))
    .sort((a, b) => {
      const riskOrder: Record<ServiceRiskLevel, number> = { urgent: 0, soon: 1, watch: 2, normal: 3 }
      const riskDelta = riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
      if (riskDelta !== 0) return riskDelta
      const aExpire = a.expireAt ? new Date(a.expireAt).getTime() : Number.MAX_SAFE_INTEGER
      const bExpire = b.expireAt ? new Date(b.expireAt).getTime() : Number.MAX_SAFE_INTEGER
      if (aExpire !== bExpire) return aExpire - bExpire
      return (b.sourceSyncedAt ?? "").localeCompare(a.sourceSyncedAt ?? "")
    })

  return buildSnapshotListResult(rows.slice(offset, offset + limit), rows.length)
}

export async function listCrmNeoCustomerSnapshots(
  options: ListCrmNeoCustomerSnapshotsOptions = {}
): Promise<ListCrmNeoCustomerSnapshotsResult> {
  const sb = createSupabaseAdminClient()
  const sourceSystem = options.sourceSystem ?? SOURCE_SYSTEM
  const limit = clampInteger(options.limit, LIST_LIMIT, 1, LIST_LIMIT)
  const offset = clampInteger(options.offset, 0, 0, 100_000)

  let query = sb
    .from("crm_neo_customer_snapshots")
    .select("*", { count: "exact" })
    .eq("source_system", sourceSystem)
    .order("risk_level", { ascending: true })
    .order("expire_at", { ascending: true, nullsFirst: false })
    .order("source_synced_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (!options.includeStale) query = query.eq("is_stale", false)
  if (options.ownerKeys && options.ownerKeys.length > 0) query = query.in("owner_id", options.ownerKeys)
  const search = safeSearch(options.q)
  if (search) {
    query = query.or(
      `account_name.ilike.%${search}%,phone.ilike.%${search}%,uid.ilike.%${search}%,owner_name.ilike.%${search}%,region_label.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query
  if (error) {
    if (isMissingSnapshotsTableError(error)) return listCrmNeoCustomerSnapshotsFromExternalRecords(options)
    throw new Error(`[crm-neo-customer-snapshots] 조회 실패: ${error.message}`)
  }

  const rows = ((data ?? []) as CrmNeoCustomerSnapshot[]).map(toCrmNeoCustomerSnapshotRecord)
  const totalCount = count ?? rows.length
  return buildSnapshotListResult(rows, totalCount)
}
