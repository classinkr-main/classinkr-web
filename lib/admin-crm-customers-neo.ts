import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import { ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { deriveCustomerRegion, regionCandidatesFromPayload } from "@/lib/crm/region-label"
import { readEeoBalance } from "@/lib/crm/eeo-account-fields"
import { getXiaoshouyiOwnerNameMap, resolveOwnerName } from "@/lib/external-crm/owner-names"
import { listCrmNeoCustomerSnapshots } from "@/lib/repositories/crm-neo-customer-snapshots"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
import { shareInFlight } from "@/lib/server/share-in-flight"
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
  /** 소진 예상일. 표본이 부족하면 null — 라벨에서 재파생하지 말 것. */
  depletionInDays?: number | null
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

// 2026-09-10 3라운드(§3.2 1순위) — 이전엔 여기 process-local `let neoCustomersCache`(60초)였다.
// 개요·통합고객·os-summary 3화면이 공유하는 하위 소스인데, 어드민은 하루 수십 방문이라 Vercel
// Fluid 인스턴스가 콜드일 때마다 처음부터 재계산됐다(사실상 캐시 무의미). unstable_cache(Data
// Cache)로 올려 인스턴스 간 공유되게 한다. 실패 결과(ok:false)는 저장하지 않는다 — 성공 값만
// 캐시에 쓰는 unstable_cache 성질을 그대로 쓰려고 실패 시 던져서 write를 건너뛴다(아래
// NeoCrmCustomersNotOkError, crm-unified-customers.ts의 IncompleteCrmUnifiedSnapshotError와 동일 기법).
class NeoCrmCustomersNotOkError extends Error {
  constructor(readonly value: NeoCrmCustomerList) {
    super("neo crm customers snapshot not ok; skip Data Cache write")
  }
}

const getCachedNeoCrmCustomers = unstable_cache(
  async () => {
    // 같은 콜드 인스턴스에서 여러 소비자(라우트 직접 호출 + crm-shared-source-snapshot.ts +
    // os-summary.ts)가 동시에 미스하면 소스 재조립을 중복 실행한다 — shareInFlight로 한 번만.
    const value = await shareInFlight(ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG, computeNeoCrmCustomers)
    if (!value.ok) throw new NeoCrmCustomersNotOkError(value)
    // unstable_cache는 JSON 직렬화 경계다 — Map/Set/Date를 그대로 캐시에 넣으면 적중 뒤 깨진다
    // (2026-09-04 우선순위 큐 500 사고). 이 값은 문자열/숫자/배열/평범한 객체뿐이라 통과해야
    // 정상이며, dev·test에서 위반 시 즉시 던져 원인을 여기서 잡는다.
    return assertJsonSafeInDev("admin-crm-neo-customers", value)
  },
  ["admin-crm-neo-customers-v1"],
  // TTL은 이전 process-local 캐시와 같은 60초로 유지한다 — 무효화(아래 invalidateNeoCrmCustomersCache)가
  // 수동 동기화(app/api/admin/crm/external-sync/route.ts) 경로만 덮고 크론 경로
  // (app/api/cron/sync-external-crm/route.ts → lib/external-crm/sync-chain.ts)는 못 덮는다 —
  // 그 두 파일은 이 작업의 소유 밖(cron/webhooks는 platform-data 소유)이라 배선하지 못했다.
  // 완전한 무효화 커버리지가 아니므로 Phase 4 규칙대로 TTL을 5~10분으로 올리지 않는다.
  { revalidate: 60, tags: [ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG] }
)

export async function getNeoCrmCustomers(): Promise<NeoCrmCustomerList> {
  try {
    return await getCachedNeoCrmCustomers()
  } catch (error) {
    if (error instanceof NeoCrmCustomersNotOkError) return error.value
    throw error
  }
}

// crm_neo_customer_snapshots 재계산 직후 호출한다 — 현재 유일한 호출부는
// app/api/admin/crm/external-sync/route.ts(수동 동기화). revalidateTag(tag, "max")로 걸어
// 이번 재계산 결과를 다음 읽기가 즉시 보게 한다("max" = 이미 나간 stale 응답도 더 안 씀).
export function invalidateNeoCrmCustomersCache() {
  revalidateTag(ADMIN_CRM_NEO_CUSTOMERS_CACHE_TAG, "max")
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
      depletionInDays: row.depletionInDays,
      riskConfidence: row.riskConfidence,
      freshnessLabel: row.freshnessLabel,
    })),
  }
}

// ── /api/admin/crm/customers-neo 목록 응답 전용 다이어트(2026-09-07 감사 #8) ──────────
// 이 라우트가 rows를 무페이징으로 통째 내려보내 444KB였다. 유일한 소비처
// (components/admin/crm/NeoCrmCustomersClient.tsx)는 accountId·name·ownerId·ownerName·
// phone·balance·expireAt·lastClassAt·uid·orderAmount·orderCount만 렌더한다 — riskLevel·
// riskReasons·riskConfidence·freshnessLabel·depletionInDays·regionLabel·createdAt·updatedAt는
// 이 화면에서 전혀 안 쓰인다(단, riskLevel·riskReasons·depletionInDays는 lib/crm/priority.ts의
// 우선순위 엔진이 쓰므로 getNeoCrmCustomers()의 내부 반환 타입 자체는 그대로 둔다 — 여기서는
// HTTP 응답 전용으로만 얇힌다).
export type NeoCrmCustomerListRow = Pick<
  NeoCrmCustomerRow,
  | "accountId"
  | "name"
  | "ownerId"
  | "ownerName"
  | "phone"
  | "balance"
  | "expireAt"
  | "lastClassAt"
  | "uid"
  | "orderAmount"
  | "orderCount"
>

export function toNeoCrmCustomerListRow(row: NeoCrmCustomerRow): NeoCrmCustomerListRow {
  return {
    accountId: row.accountId,
    name: row.name,
    ownerId: row.ownerId,
    ownerName: row.ownerName,
    phone: row.phone,
    balance: row.balance,
    expireAt: row.expireAt,
    lastClassAt: row.lastClassAt,
    uid: row.uid,
    orderAmount: row.orderAmount,
    orderCount: row.orderCount,
  }
}

export interface NeoCrmCustomerListPagination {
  /** limit 쿼리를 안 준 기본 호출은 null(전량 반환 — 화면 검색이 전량 메모리를 전제). */
  limit: number | null
  offset: number
  returned: number
  total: number
  hasMore: boolean
}

export interface NeoCrmCustomerListResponse {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  generatedAt: string
  syncHealth: NeoCrmCustomerList["syncHealth"]
  summary: NeoCrmCustomerList["summary"]
  owners: NeoCrmCustomerOwnerOption[]
  rows: NeoCrmCustomerListRow[]
  pagination: NeoCrmCustomerListPagination
}

export interface NeoCrmCustomerListQuery {
  /** "summary"면 rows를 아예 비운다 — KPI 타일 등 행이 필요 없는 소비처용. */
  scope?: "summary" | "full"
  /** 쿼리스트링 원문을 그대로 받는다(라우트가 숫자 변환 없이 넘겨도 되게). */
  limit?: string | number | null
  offset?: string | number | null
}

const NEO_CUSTOMER_LIST_MAX_LIMIT = 5_000

function parsePositiveInt(value: string | number | null | undefined): number | null {
  if (value == null) return null
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.floor(numeric)
}

/**
 * 목록 라우트 전용 응답 조립 — 필드 다이어트(위) + 옵트인 스코프/페이징.
 * limit을 안 주면 기존과 동일하게 전량을 돌려준다 — 화면의 클라이언트 검색·정렬이 전량
 * 메모리를 전제하므로 기본 동작을 바꾸지 않는다(계약 유지). limit/offset은 향후 다른
 * 소비처(가벼운 미리보기 등)를 위해 도입만 해 둔다.
 */
export function buildNeoCrmCustomerListResponse(
  list: NeoCrmCustomerList,
  query: NeoCrmCustomerListQuery = {}
): NeoCrmCustomerListResponse {
  const allRows = query.scope === "summary" ? [] : list.rows.map(toNeoCrmCustomerListRow)
  const offset = Math.max(0, parsePositiveInt(query.offset) ?? 0)
  const requestedLimit = parsePositiveInt(query.limit)
  const hasLimit = requestedLimit != null
  const limit = hasLimit
    ? Math.max(1, Math.min(requestedLimit, NEO_CUSTOMER_LIST_MAX_LIMIT))
    : allRows.length
  const rows = hasLimit || offset > 0 ? allRows.slice(offset, offset + limit) : allRows

  return {
    ok: list.ok,
    error: list.error,
    latestSyncedAt: list.latestSyncedAt,
    generatedAt: list.generatedAt,
    syncHealth: list.syncHealth,
    summary: list.summary,
    owners: list.owners,
    rows,
    pagination: {
      limit: hasLimit ? limit : null,
      offset,
      returned: rows.length,
      total: allRows.length,
      hasMore: offset + rows.length < allRows.length,
    },
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
    balance: readEeoBalance(row.payload),
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
