import "server-only"

import {
  getExcludedXiaoshouyiOwnerIds,
  getXiaoshouyiOwnerNameMap,
  resolveOwnerName,
} from "@/lib/external-crm/owner-names"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"

export interface NeoCrmCustomerRow {
  accountId: string
  name: string
  ownerId: string | null
  ownerName: string
  phone: string | null
  balance: number | null
  expireAt: string | null
  lastClassAt: string | null
  uid: string | null
  orderAmount: number
  orderCount: number
  createdAt: string | null
  updatedAt: string | null
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
    createdAt: string | null
    updatedAt: string | null
  } | null
  eeoAccounts: NeoCrmCustomerEeoAccount[]
  orders: NeoCrmCustomerMoneyItem[]
  collections: NeoCrmCustomerMoneyItem[]
  performances: NeoCrmCustomerMoneyItem[]
}

interface AccountRecord {
  external_id: string
  display_name: string | null
  owner_name: string | null
  occurred_at: string | null
  payload: Record<string, unknown> | null
}

interface ShroffRecord {
  payload: Record<string, unknown> | null
}

interface OpportunityRecord {
  amount: number | null
  payload: Record<string, unknown> | null
}

const SCAN_LIMIT = 5000
const EXPIRING_SOON_DAYS = 60

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

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

export async function getNeoCrmCustomers(): Promise<NeoCrmCustomerList> {
  const sb = createSupabaseAdminClient()
  const generatedAt = new Date().toISOString()

  const empty: NeoCrmCustomerList = {
    ok: false,
    error: null,
    latestSyncedAt: null,
    generatedAt,
    summary: { totalCount: 0, withEeoCount: 0, expiringSoonCount: 0, totalBalance: 0, totalOrderAmount: 0 },
    owners: [],
    rows: [],
  }

  const [accountResult, shroffResult, opportunityResult, ownerNames, excludedOwnerIds, latestResult] =
    await Promise.all([
      fetchExternalCrmRows<AccountRecord>(
        sb,
        "account",
        "external_id, display_name, owner_name, occurred_at, payload"
      ),
      fetchExternalCrmRows<ShroffRecord>(sb, "ShroffAccount__c", "payload"),
      fetchExternalCrmRows<OpportunityRecord>(sb, "opportunity", "amount, payload"),
      getXiaoshouyiOwnerNameMap(sb),
      getExcludedXiaoshouyiOwnerIds(sb),
      sb
        .from("external_crm_records")
        .select("synced_at")
        .eq("source_system", "xiaoshouyi")
        .order("synced_at", { ascending: false })
        .limit(1),
    ])

  if (accountResult.error) {
    return { ...empty, error: `external_crm_records(account): ${accountResult.error.message}` }
  }

  // EEO(ShroffAccount) aggregated by linked Account__c id.
  const eeoByAccount = new Map<string, { balance: number; expireAt: string | null; lastClassAt: string | null; uid: string | null }>()
  for (const row of (shroffResult.error ? [] : shroffResult.data ?? []) as ShroffRecord[]) {
    const accountId = payloadString(row.payload, "Account__c")
    if (!accountId) continue
    const balance = payloadNumber(row.payload, "CurrencyAmount__c") ?? 0
    const expireAt = toIso(row.payload?.["expireTime__c"])
    const lastClassAt = toIso(row.payload?.["LastClassDate__c"])
    const uid = payloadString(row.payload, "uid__c")
    const existing = eeoByAccount.get(accountId)
    if (!existing) {
      eeoByAccount.set(accountId, { balance, expireAt, lastClassAt, uid })
    } else {
      existing.balance += balance
      // keep the most urgent (earliest) expiry and the most recent class.
      if (expireAt && (!existing.expireAt || expireAt < existing.expireAt)) existing.expireAt = expireAt
      if (lastClassAt && (!existing.lastClassAt || lastClassAt > existing.lastClassAt)) existing.lastClassAt = lastClassAt
      if (!existing.uid && uid) existing.uid = uid
    }
  }

  // Opportunity (order) aggregated by accountId.
  const orderByAccount = new Map<string, { amount: number; count: number }>()
  for (const row of (opportunityResult.error ? [] : opportunityResult.data ?? []) as OpportunityRecord[]) {
    const accountId = payloadString(row.payload, "accountId")
    if (!accountId) continue
    const amount = Number(row.amount) || 0
    const existing = orderByAccount.get(accountId) ?? { amount: 0, count: 0 }
    existing.amount += amount
    existing.count += 1
    orderByAccount.set(accountId, existing)
  }

  const nowMs = Date.now()
  const expiringThresholdMs = nowMs + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000

  const ownerCounts = new Map<string, { ownerName: string; count: number }>()
  const rows: NeoCrmCustomerRow[] = []
  let withEeoCount = 0
  let expiringSoonCount = 0
  let totalBalance = 0
  let totalOrderAmount = 0

  for (const account of (accountResult.data ?? []) as AccountRecord[]) {
    const ownerId = account.owner_name?.trim() || null
    // 중국팀 등 제외 owner의 고객은 한국팀 고객 목록에서 제외.
    if (ownerId && excludedOwnerIds.has(ownerId)) continue

    const accountId = account.external_id
    const eeo = eeoByAccount.get(accountId)
    const order = orderByAccount.get(accountId)
    const ownerName = resolveOwnerName(ownerId, ownerNames)

    if (eeo) withEeoCount += 1
    if (eeo?.expireAt) {
      const expMs = new Date(eeo.expireAt).getTime()
      if (expMs >= nowMs && expMs <= expiringThresholdMs) expiringSoonCount += 1
    }
    totalBalance += eeo?.balance ?? 0
    totalOrderAmount += order?.amount ?? 0

    if (ownerId) {
      const oc = ownerCounts.get(ownerId) ?? { ownerName, count: 0 }
      oc.count += 1
      ownerCounts.set(ownerId, oc)
    }

    rows.push({
      accountId,
      name: account.display_name ?? payloadString(account.payload, "accountName") ?? accountId,
      ownerId,
      ownerName,
      phone: payloadString(account.payload, "phone"),
      balance: eeo ? eeo.balance : null,
      expireAt: eeo?.expireAt ?? null,
      lastClassAt: eeo?.lastClassAt ?? null,
      uid: eeo?.uid ?? null,
      orderAmount: order?.amount ?? 0,
      orderCount: order?.count ?? 0,
      createdAt: toIso(account.payload?.["createdAt"]),
      updatedAt: account.occurred_at ?? toIso(account.payload?.["updatedAt"]),
    })
  }

  const owners: NeoCrmCustomerOwnerOption[] = Array.from(ownerCounts.entries())
    .map(([ownerId, value]) => ({ ownerId, ownerName: value.ownerName, count: value.count }))
    .sort((a, b) => b.count - a.count)

  const latestRow = latestResult.error ? null : latestResult.data?.[0]

  return {
    ok: true,
    error: null,
    latestSyncedAt: latestRow && typeof latestRow.synced_at === "string" ? latestRow.synced_at : null,
    generatedAt,
    summary: {
      totalCount: rows.length,
      withEeoCount,
      expiringSoonCount,
      totalBalance,
      totalOrderAmount,
    },
    owners,
    rows,
  }
}

function fetchExternalCrmRows<T>(
  sb: SupabaseAdminClient,
  objectApiKey: string,
  select: string
) {
  return fetchSupabasePages<T>({
    maxRows: SCAN_LIMIT,
    fetchPage: async (from, to) => {
      const { data, error, count } = await sb
        .from("external_crm_records")
        .select(select)
        .eq("source_system", "xiaoshouyi")
        .eq("object_api_key", objectApiKey)
        .eq("is_stale", false)
        .range(from, to)
      return { data, error, count }
    },
  })
}

interface MoneyRecordRow {
  external_id: string
  display_name: string | null
  owner_name: string | null
  status: string | null
  amount: number | null
  occurred_at: string | null
  payload: Record<string, unknown> | null
}

const DETAIL_RECORD_SELECT = "external_id, display_name, owner_name, status, amount, occurred_at, payload"
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
    expireAt: toIso(row.payload?.["expireTime__c"]),
    lastClassAt: toIso(row.payload?.["LastClassDate__c"]),
    serviceStatus: row.status,
  }))

  return {
    ok: true,
    error: null,
    account: {
      accountId: account.external_id,
      name: account.display_name ?? payloadString(account.payload, "accountName") ?? account.external_id,
      ownerName: resolveOwnerName(account.owner_name, ownerNames),
      phone: payloadString(account.payload, "phone"),
      createdAt: toIso(account.payload?.["createdAt"]),
      updatedAt: account.occurred_at ?? toIso(account.payload?.["updatedAt"]),
    },
    eeoAccounts,
    orders: ((orderResult.error ? [] : orderResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
    collections: ((collectionResult.error ? [] : collectionResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
    performances: ((performanceResult.error ? [] : performanceResult.data ?? []) as MoneyRecordRow[]).map(toMoneyItem),
  }
}
