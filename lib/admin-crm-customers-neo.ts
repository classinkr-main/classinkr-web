import "server-only"

import { deriveCustomerRegion, regionCandidatesFromPayload } from "@/lib/crm/region-label"
import { getXiaoshouyiOwnerNameMap, resolveOwnerName } from "@/lib/external-crm/owner-names"
import { listCrmNeoCustomerSnapshots } from "@/lib/repositories/crm-neo-customer-snapshots"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export interface NeoCrmCustomerRow {
  accountId: string
  name: string
  ownerId: string | null
  ownerName: string
  phone: string | null
  regionLabel?: string | null
  balance: number | null
  expireAt: string | null
  lastClassAt: string | null
  uid: string | null
  orderAmount: number
  orderCount: number
  createdAt: string | null
  updatedAt: string | null
  riskLevel?: "urgent" | "soon" | "watch" | "normal"
  riskReasons?: Array<{ code?: string; label?: string }>
  riskConfidence?: "high" | "medium" | "low"
  freshnessLabel?: string | null
}

export interface NeoCrmCustomerOwnerOption {
  ownerId: string
  ownerName: string
  count: number
}

export interface NeoCrmCustomerList {
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
  owners: NeoCrmCustomerOwnerOption[]
  rows: NeoCrmCustomerRow[]
}

export interface NeoCrmCustomerEeoAccount {
  id: string
  name: string
  uid: string | null
  balance: number | null
  expireAt: string | null
  lastClassAt: string | null
  serviceStatus: string | null
  syncedAt: string | null
}

export interface NeoCrmCustomerMoneyItem {
  id: string
  title: string
  amount: number | null
  occurredAt: string | null
  ownerName: string
  status: string | null
}

export interface NeoCrmCustomerDetail {
  ok: boolean
  error: string | null
  account: {
    accountId: string
    name: string
    ownerName: string
    phone: string | null
    region: string | null
    createdAt: string | null
    updatedAt: string | null
  } | null
  eeoAccounts: NeoCrmCustomerEeoAccount[]
  orders: NeoCrmCustomerMoneyItem[]
  collections: NeoCrmCustomerMoneyItem[]
  performances: NeoCrmCustomerMoneyItem[]
}

function toIso(value: unknown): string | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null
  const date = numeric == null ? new Date(String(value)) : new Date(numeric)
  if (Number.isNaN(date.getTime())) return null
  // Xiaoshouyi epoch 0 / negative => no real date.
  if (date.getTime() <= 0) return null
  return date.toISOString()
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key]
  return value == null || value === "" ? null : String(value)
}

function payloadNumber(payload: Record<string, unknown> | null, key: string): number | null {
  const value = payload?.[key]
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
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

let neoCustomersCache: { at: number; value: NeoCrmCustomerList } | null = null
const NEO_CUSTOMERS_CACHE_TTL_MS = 60_000

// 60초 인메모리 캐시. 실제 화면 데이터는 crm_neo_customer_snapshots에서 읽는다.
// 외부 CRM 원본 스냅샷 재조립은 sync-chain refresh 단계에서만 수행한다.
export async function getNeoCrmCustomers(): Promise<NeoCrmCustomerList> {
  const cached = neoCustomersCache
  if (cached && Date.now() - cached.at < NEO_CUSTOMERS_CACHE_TTL_MS) return cached.value
  const value = await computeNeoCrmCustomers()
  if (value.ok) neoCustomersCache = { at: Date.now(), value }
  return value
}

async function computeNeoCrmCustomers(): Promise<NeoCrmCustomerList> {
  const list = await listCrmNeoCustomerSnapshots()
  return {
    ok: list.ok,
    error: list.error,
    latestSyncedAt: list.latestSyncedAt,
    generatedAt: list.generatedAt,
    syncHealth: list.syncHealth,
    summary: list.summary,
    owners: list.owners,
    rows: list.rows.map((row) => ({
      accountId: row.accountId,
      name: row.accountName,
      ownerId: row.ownerId,
      ownerName: row.ownerName,
      phone: row.phone,
      regionLabel: row.regionLabel,
      balance: row.balance,
      expireAt: row.expireAt,
      lastClassAt: row.lastClassAt,
      uid: row.uid,
      orderAmount: row.orderAmount,
      orderCount: row.orderCount,
      createdAt: row.createdAt,
      updatedAt: row.sourceSyncedAt ?? row.updatedAt,
      riskLevel: row.riskLevel,
      riskReasons: row.riskReasons,
      riskConfidence: row.riskConfidence,
      freshnessLabel: row.freshnessLabel,
    })),
  }
}

interface MoneyRecordRow {
  external_id: string
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | null
  occurred_at: string | null
  synced_at: string | null
  payload: Record<string, unknown> | null
}

const DETAIL_RECORD_SELECT = "external_id, display_name, owner_name, status, amount, occurred_at, synced_at, payload"
const DETAIL_LIMIT = 200

// account 1곳의 EEO 계정·오더·수금·성과 drill-down.
// 연결 키: ShroffAccount.Account__c / opportunity.accountId /
// Collection__c.orderAccountId__c / SalesPerformance__c.Account__c (실데이터로 검증).
export async function getNeoCrmCustomerDetail(accountId: string): Promise<NeoCrmCustomerDetail> {
  const sb = createSupabaseAdminClient()

  const detailSelect = (objectApiKey: string, linkField: string) =>
    sb
      .from("external_crm_records")
      .select(DETAIL_RECORD_SELECT)
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", objectApiKey)
      .eq("is_stale", false)
      .eq(`payload->>${linkField}`, accountId)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(DETAIL_LIMIT)

  const [accountResult, shroffResult, orderResult, collectionResult, performanceResult, ownerNames] =
    await Promise.all([
      sb
        .from("external_crm_records")
        .select(DETAIL_RECORD_SELECT)
        .eq("source_system", "xiaoshouyi")
        .eq("object_api_key", "account")
        .eq("external_id", accountId)
        .maybeSingle(),
      detailSelect("ShroffAccount__c", "Account__c"),
      detailSelect("opportunity", "accountId"),
      detailSelect("Collection__c", "orderAccountId__c"),
      detailSelect("SalesPerformance__c", "Account__c"),
      getXiaoshouyiOwnerNameMap(sb),
    ])

  if (accountResult.error) {
    return {
      ok: false,
      error: `external_crm_records(account): ${accountResult.error.message}`,
      account: null,
      eeoAccounts: [],
      orders: [],
      collections: [],
      performances: [],
    }
  }

  const account = accountResult.data as MoneyRecordRow | null
  if (!account) {
    return { ok: false, error: "고객을 찾을 수 없습니다.", account: null, eeoAccounts: [], orders: [], collections: [], performances: [] }
  }

  const toMoneyItem = (row: MoneyRecordRow): NeoCrmCustomerMoneyItem => ({
    id: row.external_id,
    title: row.display_name ?? row.external_id,
    amount: row.amount,
    occurredAt: row.occurred_at,
    ownerName: resolveOwnerName(row.owner_name, ownerNames),
    status: row.status,
  })

  const eeoAccounts: NeoCrmCustomerEeoAccount[] = (
    (shroffResult.error ? [] : shroffResult.data ?? []) as MoneyRecordRow[]
  ).map((row) => ({
    id: row.external_id,
    name: row.display_name ?? row.external_id,
    uid: payloadString(row.payload, "uid__c"),
    balance: payloadNumber(row.payload, "CurrencyAmount__c"),
    expireAt: payloadIsActivePaidEeo(row.payload) ? payloadExpireAt(row.payload) : null,
    lastClassAt: toIso(row.payload?.["LastClassDate__c"]),
    serviceStatus: row.status,
    syncedAt: row.synced_at,
  }))

  return {
    ok: true,
    error: null,
    account: {
      accountId: account.external_id,
      name: account.display_name ?? payloadString(account.payload, "accountName") ?? account.external_id,
      ownerName: resolveOwnerName(account.owner_name, ownerNames),
      phone: payloadString(account.payload, "phone"),
      region: (() => {
        const derived = deriveCustomerRegion(regionCandidatesFromPayload(account.payload))
        return derived.source === "unspecified" ? null : derived.label
      })(),
      createdAt: toIso(account.payload?.["createdAt"]),
      updatedAt: account.occurred_at ?? toIso(account.payload?.["updatedAt"]),
    },
    eeoAccounts,
    orders: ((orderResult.error ? [] : orderResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
    collections: ((collectionResult.error ? [] : collectionResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
    performances: ((performanceResult.error ? [] : performanceResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
  }
}
