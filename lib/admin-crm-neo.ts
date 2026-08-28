import "server-only"

import {
  EXTERNAL_CRM_KOREA_ONLY,
  getKoreaTeamManagerSet,
  isKoreaScopedExternalRecord,
} from "@/lib/admin-crm-scope"
import {
  getExcludedXiaoshouyiOwnerIds,
  getXiaoshouyiOwnerNameMap,
  resolveOwnerName,
} from "@/lib/external-crm/owner-names"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePagedResult } from "@/lib/supabase/pagination"
import { getFxRates } from "@/lib/billing/fx"

export type NeoCrmGranularity = "week" | "month" | "quarter" | "year"

export interface NeoCrmTeamRevenueRow {
  owner: string
  ownerKey: string
  amount: number
  orderCount: number
  share: number
  previousAmount: number
  delta: number
}

// 담당자별 오더(USD)·수금(CNY) 분해. 매출 byOwner와 같은 ownerKey(Xiaoshouyi ownerId)로 묶는다.
export interface NeoCrmOwnerBreakdownRow {
  ownerKey: string
  owner: string
  amount: number
  count: number
}

export interface NeoCrmOrderItem {
  key: string
  customerName: string
  ownerName: string | null
  status: string | null
  amount: number | null
  occurredAt: string | null
  /** opportunity payload.accountId(= account.external_id) — NEO 계정 딥링크(?account=)용. 없으면 null */
  accountId: string | null
}

export interface NeoCrmTeamReport {
  ok: boolean
  error: string | null
  latestSyncedAt: string | null
  granularity: NeoCrmGranularity
  offset: number
  usdCnyRate: number
  period: {
    label: string
    startIso: string
    endIso: string
    canGoNext: boolean
  }
  revenue: {
    teamTotal: number
    orderCount: number
    contributorCount: number
    byOwner: NeoCrmTeamRevenueRow[]
  }
  account: {
    totalCount: number
    activeInPeriodCount: number
  }
  order: {
    count: number
    amount: number
    recent: NeoCrmOrderItem[]
    byOwner: NeoCrmOwnerBreakdownRow[]
  }
  collection: {
    amount: number
    count: number
    amount30d: number
    count30d: number
    byOwner: NeoCrmOwnerBreakdownRow[]
  }
  leads: {
    totalCount: number
    periodCount: number
    previousCount: number
  }
  // 직전 동기간(주/월/분기/년) 대비 비교.
  comparison: {
    previousLabel: string
    // 진행 중인 기간(offset 0)은 직전 기간의 "같은 경과 일수"까지만 잘라 비교한다(MTD 페이스).
    // 완료된 과거 기간은 전체 대 전체 비교.
    paceAdjusted: boolean
    revenue: { previousTotal: number; delta: number; rate: number | null }
    order: { previousCount: number; previousAmount: number }
    account: { previousActiveCount: number }
    collection: { previousAmount: number }
  }
}

interface ScopedAmountRecord {
  owner_name: string | null
  payload: Record<string, unknown> | null
  amount: number | null
  occurred_at: string | null
}

interface ScopedOrderRecord extends ScopedAmountRecord {
  object_api_key: string
  external_id: string
  display_name: string | null
  status: string | null
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function groupByOwner(
  rows: ScopedAmountRecord[],
  ownerNames: Map<string, string>
): NeoCrmOwnerBreakdownRow[] {
  const map = new Map<string, { owner: string; amount: number; count: number }>()
  for (const row of rows) {
    const ownerKey = row.owner_name?.trim() || "unassigned"
    const existing = map.get(ownerKey) ?? {
      owner: resolveOwnerName(row.owner_name, ownerNames),
      amount: 0,
      count: 0,
    }
    existing.amount += Number(row.amount) || 0
    existing.count += 1
    map.set(ownerKey, existing)
  }
  return Array.from(map.entries())
    .map(([ownerKey, row]) => ({ ownerKey, ...row }))
    .sort((a, b) => b.amount - a.amount)
}
const PERIOD_SCAN_LIMIT = 5000
// isScoped은 KOREA_ONLY일 때 payload를 보지 않으므로 그 경우 select에서 뺀다.
// 플래그가 false로 돌아오면 휴리스틱이 payload를 다시 필요로 하니 컬럼을 되살린다.
const MONEY_WINDOW_SCOPE_SELECT = EXTERNAL_CRM_KOREA_ONLY
  ? "owner_name, amount, occurred_at, display_name, status, external_id, object_api_key"
  : "owner_name, payload, amount, occurred_at, display_name, status, external_id, object_api_key"
const ACCOUNT_SCOPE_SELECT = EXTERNAL_CRM_KOREA_ONLY
  ? "owner_name, amount, occurred_at"
  : "owner_name, payload, amount, occurred_at"
const RECENT_ORDER_LIMIT = 12
const TEAM_REVENUE_ROW_LIMIT = 50
const RECENT_ORDER_CANDIDATE_PAGE_SIZE = 1000
const RECENT_ORDER_CANDIDATE_MAX_PAGES = 20
const NEO_CRM_ORDER_DATE_FIELDS = [
  "createdAt",
  "created_at",
  "CreatedAt",
  "createTime",
  "create_time",
  "updatedAt",
  "updated_at",
  "UpdatedAt",
  "closeDate",
  "close_date",
  "CloseDate",
]

function normalizeNeoCrmExternalDate(value: unknown): string | null {
  if (value == null || value === "") return null
  const numeric = typeof value === "number" ? value : /^\d+$/.test(String(value)) ? Number(value) : null
  const date = numeric == null ? new Date(String(value)) : new Date(numeric)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function resolveNeoCrmOrderOccurredAt(row: {
  occurred_at: string | null
  payload: Record<string, unknown> | null
}) {
  for (const key of NEO_CRM_ORDER_DATE_FIELDS) {
    const value = normalizeNeoCrmExternalDate(row.payload?.[key])
    if (value) return value
  }
  return normalizeNeoCrmExternalDate(row.occurred_at)
}

function isIsoWithinRange(value: string | null, startIso: string, endIso: string) {
  if (!value) return false
  return value >= startIso && value < endIso
}

async function listRecentOpportunityRows(sb: ReturnType<typeof createSupabaseAdminClient>) {
  const rows: ScopedOrderRecord[] = []

  for (let page = 0; page < RECENT_ORDER_CANDIDATE_MAX_PAGES; page += 1) {
    const from = page * RECENT_ORDER_CANDIDATE_PAGE_SIZE
    const to = from + RECENT_ORDER_CANDIDATE_PAGE_SIZE - 1
    const result = await sb
      .from("external_crm_records")
      .select("owner_name, payload, amount, occurred_at, display_name, status, external_id, object_api_key")
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", "opportunity")
      .eq("is_stale", false)
      .order("external_id", { ascending: true })
      .range(from, to)

    if (result.error) return { data: rows, error: result.error }

    const pageRows = (result.data ?? []) as ScopedOrderRecord[]
    rows.push(...pageRows)
    if (pageRows.length < RECENT_ORDER_CANDIDATE_PAGE_SIZE) break
  }

  return { data: rows, error: null }
}

function fetchExternalCrmPages<T>(
  sb: SupabaseAdminClient,
  input: {
    objectApiKey: string
    select: string
    startIso?: string
    endIso?: string
  }
) {
  return fetchSupabasePages<T>({
    maxRows: PERIOD_SCAN_LIMIT,
    fetchPage: (from, to) => {
      let query = sb
        .from("external_crm_records")
        .select(input.select)
        .eq("source_system", "xiaoshouyi")
        .eq("object_api_key", input.objectApiKey)
        .eq("is_stale", false)

      if (input.startIso) query = query.gte("occurred_at", input.startIso)
      if (input.endIso) query = query.lt("occurred_at", input.endIso)

      return query.range(from, to)
    },
  })
}

// KOREA_ONLY 스코프에서 accountTotal은 owner_name 제외 목록만 반영하면 되므로(payload
// 휴리스틱 불필요) 전 행을 끌어와 filter(isScoped).length 하는 대신 count head 왕복으로 센다.
// 제외 목록이 있으면 전체 카운트에서 제외분 카운트를 빼(둘 다 head count) NULL owner_name
// 행이 NOT IN 쿼리에서 암묵적으로 걸러지는 함정을 피한다.
async function countKoreaScopedAccountTotal(
  sb: SupabaseAdminClient,
  excludedOwnerIds: Set<string>
): Promise<SupabasePagedResult<ScopedAmountRecord>> {
  const baseQuery = () =>
    sb
      .from("external_crm_records")
      .select("*", { count: "exact", head: true })
      .eq("source_system", "xiaoshouyi")
      .eq("object_api_key", "account")
      .eq("is_stale", false)

  const totalResult = await baseQuery()
  if (totalResult.error) {
    return { data: [], error: totalResult.error, count: 0, truncated: false, pages: 1 }
  }
  const total = totalResult.count ?? 0

  const excludeList = Array.from(excludedOwnerIds)
  if (excludeList.length === 0) {
    return { data: [], error: null, count: total, truncated: false, pages: 1 }
  }

  const excludedResult = await baseQuery().in("owner_name", excludeList)
  if (excludedResult.error) {
    return { data: [], error: excludedResult.error, count: 0, truncated: false, pages: 1 }
  }
  const excluded = excludedResult.count ?? 0
  return { data: [], error: null, count: Math.max(0, total - excluded), truncated: false, pages: 1 }
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

interface PeriodBounds {
  start: Date
  end: Date
  label: string
}

// Period boundaries are computed in KST (UTC+9) so a Korea team dashboard groups
// records by the local calendar day/week/quarter/year, then expressed as UTC
// instants to compare against occurred_at (stored as UTC ISO).
function resolvePeriodBounds(granularity: NeoCrmGranularity, offset: number): PeriodBounds {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS)
  const year = nowKst.getUTCFullYear()
  const month = nowKst.getUTCMonth()

  if (granularity === "month") {
    const start = new Date(Date.UTC(year, month + offset, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(year, month + offset + 1, 1) - KST_OFFSET_MS)
    const ld = new Date(Date.UTC(year, month + offset, 1))
    return {
      start,
      end,
      label: `${ld.getUTCFullYear()}년 ${pad2(ld.getUTCMonth() + 1)}월`,
    }
  }

  if (granularity === "quarter") {
    const startMonth = Math.floor(month / 3) * 3 + offset * 3
    const start = new Date(Date.UTC(year, startMonth, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(year, startMonth + 3, 1) - KST_OFFSET_MS)
    const sd = new Date(Date.UTC(year, startMonth, 1))
    const quarter = Math.floor(sd.getUTCMonth() / 3) + 1
    return { start, end, label: `${sd.getUTCFullYear()} ${quarter}분기` }
  }

  if (granularity === "year") {
    const yy = year + offset
    const start = new Date(Date.UTC(yy, 0, 1) - KST_OFFSET_MS)
    const end = new Date(Date.UTC(yy + 1, 0, 1) - KST_OFFSET_MS)
    return { start, end, label: `${yy}년` }
  }

  // week — ISO week, Monday start, in KST.
  const dayUtc = Date.UTC(year, month, nowKst.getUTCDate())
  const weekday = nowKst.getUTCDay() // 0=Sun..6=Sat
  const mondayDelta = weekday === 0 ? -6 : 1 - weekday
  const startKstMidnight = dayUtc + (mondayDelta + offset * 7) * 86_400_000
  const start = new Date(startKstMidnight - KST_OFFSET_MS)
  const end = new Date(startKstMidnight + 7 * 86_400_000 - KST_OFFSET_MS)
  const startLabel = new Date(startKstMidnight)
  const endLabel = new Date(startKstMidnight + 6 * 86_400_000)
  return {
    start,
    end,
    label: `${pad2(startLabel.getUTCMonth() + 1)}.${pad2(startLabel.getUTCDate())} ~ ${pad2(
      endLabel.getUTCMonth() + 1
    )}.${pad2(endLabel.getUTCDate())}`,
  }
}

const VALID_GRANULARITIES: NeoCrmGranularity[] = ["week", "month", "quarter", "year"]
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>

function emptyReport(
  granularity: NeoCrmGranularity,
  offset: number,
  bounds: PeriodBounds,
  previousLabel: string,
  error: string | null
): NeoCrmTeamReport {
  return {
    ok: error === null,
    error,
    usdCnyRate: 7.3,
    latestSyncedAt: null,
    granularity,
    offset,
    period: {
      label: bounds.label,
      startIso: bounds.start.toISOString(),
      endIso: bounds.end.toISOString(),
      canGoNext: offset < 0,
    },
    revenue: { teamTotal: 0, orderCount: 0, contributorCount: 0, byOwner: [] },
    account: { totalCount: 0, activeInPeriodCount: 0 },
    order: { count: 0, amount: 0, recent: [], byOwner: [] },
    collection: { amount: 0, count: 0, amount30d: 0, count30d: 0, byOwner: [] },
    leads: { totalCount: 0, periodCount: 0, previousCount: 0 },
    comparison: {
      previousLabel,
      paceAdjusted: false,
      revenue: { previousTotal: 0, delta: 0, rate: null },
      order: { previousCount: 0, previousAmount: 0 },
      account: { previousActiveCount: 0 },
      collection: { previousAmount: 0 },
    },
  }
}

// /admin/crm 홈은 overview(getNeoCrmOverview)와 NeoCrmTeamPanel(/api/admin/crm/neo)이
// 같은 월 리포트를 거의 동시에 요청한다(각 ~12쿼리). 인스턴스 단위 short-TTL 메모로
// 중복 계산과 동시 요청을 합친다. 실패 리포트는 캐시하지 않아 즉시 재시도된다.
const REPORT_MEMO_TTL_MS = 120_000
const reportMemo = new Map<string, { expiresAt: number; promise: Promise<NeoCrmTeamReport> }>()

export function getNeoCrmTeamReport(input: {
  granularity: NeoCrmGranularity
  offset: number
  force?: boolean
}): Promise<NeoCrmTeamReport> {
  const key = `${input.granularity}:${input.offset}`
  const cached = reportMemo.get(key)
  if (!input.force && cached && cached.expiresAt > Date.now()) return cached.promise

  const promise = computeNeoCrmTeamReport(input)
    .then((report) => {
      if (!report.ok) reportMemo.delete(key)
      return report
    })
    .catch((error) => {
      reportMemo.delete(key)
      throw error
    })
  reportMemo.set(key, { expiresAt: Date.now() + REPORT_MEMO_TTL_MS, promise })
  return promise
}

async function computeNeoCrmTeamReport(input: {
  granularity: NeoCrmGranularity
  offset: number
}): Promise<NeoCrmTeamReport> {
  const granularity = VALID_GRANULARITIES.includes(input.granularity) ? input.granularity : "month"
  const offset = Number.isFinite(input.offset) ? Math.min(0, Math.trunc(input.offset)) : 0
  const bounds = resolvePeriodBounds(granularity, offset)
  const previousBounds = resolvePeriodBounds(granularity, offset - 1)
  const startIso = bounds.start.toISOString()
  const endIso = bounds.end.toISOString()
  // 현재+직전 기간을 한 번에 읽어 같은 시기 비교(증감)를 계산한다. 두 기간은 연속이라
  // [prevStart, curEnd) 한 윈도우로 덮고, occurred_at >= curStart 여부로 분리한다.
  const windowStartIso = previousBounds.start.toISOString()

  const sb = createSupabaseAdminClient()

  const moneyWindowSelect = (objectApiKey: string) =>
    fetchExternalCrmPages<ScopedOrderRecord>(sb, {
      objectApiKey,
      select: MONEY_WINDOW_SCOPE_SELECT,
      startIso: windowStartIso,
      endIso,
    })

  // koreaManagers는 isKoreaScopedExternalRecord가 KOREA_ONLY일 때 무조건 true를 반환해
  // 참고조차 안 한다 — branch_rev_deals 전량 스캔을 아예 건너뛴다. 플래그가 false로
  // 돌아오면 휴리스틱이 다시 이 시트를 필요로 하니 스캔을 복구한다.
  const teamManagerResultPromise = EXTERNAL_CRM_KOREA_ONLY
    ? Promise.resolve({
        data: [] as Array<{ team: string | null; manager: string | null }>,
        error: null,
        count: null,
        truncated: false,
        pages: 0,
      })
    : fetchSupabasePages<{ team: string | null; manager: string | null }>({
        maxRows: PERIOD_SCAN_LIMIT,
        fetchPage: (from, to) =>
          sb
            .from("branch_rev_deals")
            .select("team, manager")
            .range(from, to),
      })

  // excludedOwnerIds는 isScoped 전반에서 쓰이는 데다, KOREA_ONLY일 때 accountTotal의
  // head-count 쿼리도 이 값을 먼저 알아야 조립된다. 프라미스를 미리 만들어 두 자리에서
  // 재사용하면(await은 한 번) 실제 네트워크 호출은 하나로 유지되면서 배치 병렬성도 보존된다.
  const excludedOwnerIdsPromise = getExcludedXiaoshouyiOwnerIds(sb)
  const accountTotalPromise = EXTERNAL_CRM_KOREA_ONLY
    ? excludedOwnerIdsPromise.then((ids) => countKoreaScopedAccountTotal(sb, ids))
    : fetchExternalCrmPages<ScopedAmountRecord>(sb, {
        objectApiKey: "account",
        select: ACCOUNT_SCOPE_SELECT,
      })

  const [
    teamManagerResult,
    salesPerfResult,
    opportunityResult,
    recentOpportunityResult,
    collectionResult,
    accountTotalResult,
    accountWindowResult,
    leadsPeriodResult,
    leadsPrevResult,
    leadsTotalResult,
    latestResult,
    ownerNames,
    excludedOwnerIds,
  ] = await Promise.all([
    teamManagerResultPromise,
    moneyWindowSelect("SalesPerformance__c"),
    moneyWindowSelect("opportunity"),
    listRecentOpportunityRows(sb),
    moneyWindowSelect("Collection__c"),
    accountTotalPromise,
    fetchExternalCrmPages<ScopedAmountRecord>(sb, {
      objectApiKey: "account",
      select: ACCOUNT_SCOPE_SELECT,
      startIso: windowStartIso,
      endIso,
    }),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    sb
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", windowStartIso)
      .lt("created_at", startIso),
    sb.from("leads").select("id", { count: "exact", head: true }),
    sb
      .from("external_crm_records")
      .select("synced_at")
      .eq("source_system", "xiaoshouyi")
      .order("synced_at", { ascending: false })
      .limit(1),
    getXiaoshouyiOwnerNameMap(sb),
    excludedOwnerIdsPromise,
  ])

  const blockingError =
    salesPerfResult.error ?? opportunityResult.error ?? accountTotalResult.error ?? collectionResult.error
  if (blockingError) {
    const message = blockingError.message ?? "Neo CRM 스냅샷을 읽지 못했습니다."
    return emptyReport(granularity, offset, bounds, previousBounds.label, `external_crm_records: ${message}`)
  }

  const sheetRows = (teamManagerResult.error ? [] : teamManagerResult.data ?? []) as Array<{
    team: string | null
    manager: string | null
  }>
  const koreaManagers = getKoreaTeamManagerSet(sheetRows)

  // Korea team scope = scoped record AND owner not on the exclusion list
  // (e.g. China team). resolves to "include all but excluded" under the
  // Korea-only flag.
  const isScoped = (row: { owner_name: string | null; payload: Record<string, unknown> | null }) =>
    isKoreaScopedExternalRecord(row, koreaManagers) && !excludedOwnerIds.has(row.owner_name?.trim() ?? "")

  const isCurrent = (occurredAt: string | null) => isIsoWithinRange(occurredAt, startIso, endIso)

  // MTD 페이스 비교: 진행 중인 기간(offset 0)은 "기간 시작 ~ 지금"까지만 찼으므로,
  // 직전 기간도 같은 경과 길이까지만 잘라 비교해야 공정하다(월초에 항상 -로 보이는 문제 제거).
  // 완료된 과거 기간(offset < 0)은 기간 전체가 차 있으므로 직전 기간도 전체 비교.
  const paceAdjusted = offset === 0
  const periodStartMs = bounds.start.getTime()
  const paceCutoffMs = paceAdjusted
    ? Math.min(Date.now(), bounds.end.getTime())
    : bounds.end.getTime()
  const elapsedMs = Math.max(0, paceCutoffMs - periodStartMs)
  const prevPaceCutoffMs = Math.min(previousBounds.start.getTime() + elapsedMs, previousBounds.end.getTime())
  const prevPaceCutoffIso = new Date(prevPaceCutoffMs).toISOString()
  // 직전 기간 윈도우: [prevStart, prevPaceCutoff). allSales 쿼리가 prevStart부터 읽으므로
  // 상한만 적용하면 된다. (prevPaceCutoffIso <= startIso 보장)
  const isPrevPace = (occurredAt: string | null) => isIsoWithinRange(occurredAt, windowStartIso, prevPaceCutoffIso)

  const allSales = ((salesPerfResult.data ?? []) as ScopedOrderRecord[]).filter(isScoped)
  const salesRows = allSales.filter((row) => isCurrent(row.occurred_at))
  const prevSalesRows = allSales.filter((row) => isPrevPace(row.occurred_at))

  // owner_name은 Xiaoshouyi ownerId(숫자)다. User 객체 맵으로 이름을 붙이고,
  // 미동기화 시에는 id를 그대로 표시한다. 그룹 키는 안정적으로 ownerId를 쓴다.
  const revenueByOwner = new Map<string, { owner: string; amount: number; orderCount: number }>()
  const prevByOwner = new Map<string, number>()
  let teamTotal = 0
  let prevTeamTotal = 0
  for (const row of salesRows) {
    const amount = Number(row.amount) || 0
    teamTotal += amount
    const ownerKey = row.owner_name?.trim() || "unassigned"
    const existing = revenueByOwner.get(ownerKey) ?? {
      owner: resolveOwnerName(row.owner_name, ownerNames),
      amount: 0,
      orderCount: 0,
    }
    existing.amount += amount
    existing.orderCount += 1
    revenueByOwner.set(ownerKey, existing)
  }
  for (const row of prevSalesRows) {
    const amount = Number(row.amount) || 0
    prevTeamTotal += amount
    const ownerKey = row.owner_name?.trim() || "unassigned"
    prevByOwner.set(ownerKey, (prevByOwner.get(ownerKey) ?? 0) + amount)
  }

  const byOwner: NeoCrmTeamRevenueRow[] = Array.from(revenueByOwner.entries())
    .map(([ownerKey, row]) => {
      const previousAmount = prevByOwner.get(ownerKey) ?? 0
      return {
        owner: row.owner,
        ownerKey,
        amount: row.amount,
        orderCount: row.orderCount,
        share: teamTotal > 0 ? row.amount / teamTotal : 0,
        previousAmount,
        delta: row.amount - previousAmount,
      }
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TEAM_REVENUE_ROW_LIMIT)

  const allOrders = ((opportunityResult.data ?? []) as ScopedOrderRecord[]).filter(isScoped)
  const orderRows = allOrders.filter((row) => isCurrent(row.occurred_at))
  const prevOrderRows = allOrders.filter((row) => isPrevPace(row.occurred_at))
  const orderAmount = orderRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const prevOrderAmount = prevOrderRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const recentOrderSourceRows = recentOpportunityResult.error ? [] : recentOpportunityResult.data
  const recentOrders: NeoCrmOrderItem[] = recentOrderSourceRows
    .filter(isScoped)
    .map((row) => ({ row, occurredAt: resolveNeoCrmOrderOccurredAt(row) }))
    .filter(({ occurredAt }) => isCurrent(occurredAt))
    .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""))
    .slice(0, RECENT_ORDER_LIMIT)
    .map(({ row, occurredAt }) => {
      // 계정 딥링크 키 — getNeoCrmCustomerDetail이 오더를 계정에 묶을 때 쓰는 그 조인 키
      // (payload->>accountId = account.external_id)를 그대로 노출한다. 새 판정 없음.
      const payloadAccountId = row.payload?.accountId
      return {
        key: `${row.object_api_key}:${row.external_id}`,
        customerName: row.display_name ?? row.external_id,
        ownerName: row.owner_name ? resolveOwnerName(row.owner_name, ownerNames) : null,
        status: row.status,
        amount: row.amount,
        occurredAt,
        accountId: typeof payloadAccountId === "string" && payloadAccountId.trim() ? payloadAccountId : null,
      }
    })

  const allCollections = ((collectionResult.data ?? []) as ScopedAmountRecord[]).filter(isScoped)
  const collectionRows = allCollections.filter((row) => isCurrent(row.occurred_at))
  const collectionAmount = collectionRows.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const collectionRows30d = allCollections.filter((row) => (row.occurred_at ?? "") >= thirtyDaysAgoIso)
  const collectionAmount30d = collectionRows30d.reduce((total, row) => total + (Number(row.amount) || 0), 0)
  const prevCollectionAmount = allCollections
    .filter((row) => isPrevPace(row.occurred_at))
    .reduce((total, row) => total + (Number(row.amount) || 0), 0)

  const accountTotal = EXTERNAL_CRM_KOREA_ONLY
    ? accountTotalResult.count ?? 0
    : (
        (accountTotalResult.data ?? []) as Array<{ owner_name: string | null; payload: Record<string, unknown> | null }>
      ).filter(isScoped).length
  const accountWindow = (
    (accountWindowResult.error ? [] : accountWindowResult.data ?? []) as Array<{
      owner_name: string | null
      payload: Record<string, unknown> | null
      occurred_at: string | null
    }>
  ).filter(isScoped)
  const accountActiveInPeriod = accountWindow.filter((row) => isCurrent(row.occurred_at)).length
  const accountActivePrevious = accountWindow.filter((row) => isPrevPace(row.occurred_at)).length

  const latestRow = latestResult.error ? null : latestResult.data?.[0]
  const fx = await getFxRates()
  const usdCnyRate = fx.usdKrw / fx.cnyKrw

  return {
    ok: true,
    error: null,
    usdCnyRate,
    latestSyncedAt: latestRow && typeof latestRow.synced_at === "string" ? latestRow.synced_at : null,
    granularity,
    offset,
    period: {
      label: bounds.label,
      startIso,
      endIso,
      canGoNext: offset < 0,
    },
    revenue: {
      teamTotal,
      orderCount: salesRows.length,
      contributorCount: revenueByOwner.size,
      byOwner,
    },
    account: {
      totalCount: accountTotal,
      activeInPeriodCount: accountActiveInPeriod,
    },
    order: {
      count: orderRows.length,
      amount: orderAmount,
      recent: recentOrders,
      byOwner: groupByOwner(orderRows, ownerNames),
    },
    collection: {
      amount: collectionAmount,
      count: collectionRows.length,
      amount30d: collectionAmount30d,
      count30d: collectionRows30d.length,
      byOwner: groupByOwner(collectionRows, ownerNames),
    },
    leads: {
      totalCount: leadsTotalResult.error ? 0 : leadsTotalResult.count ?? 0,
      periodCount: leadsPeriodResult.error ? 0 : leadsPeriodResult.count ?? 0,
      previousCount: leadsPrevResult.error ? 0 : leadsPrevResult.count ?? 0,
    },
    comparison: {
      previousLabel: previousBounds.label,
      paceAdjusted,
      revenue: {
        previousTotal: prevTeamTotal,
        delta: teamTotal - prevTeamTotal,
        rate: prevTeamTotal > 0 ? (teamTotal - prevTeamTotal) / prevTeamTotal : null,
      },
      order: { previousCount: prevOrderRows.length, previousAmount: prevOrderAmount },
      account: { previousActiveCount: accountActivePrevious },
      collection: { previousAmount: prevCollectionAmount },
    },
  }
}
