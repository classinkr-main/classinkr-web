import "server-only"

import { unstable_cache } from "next/cache"
import { cache } from "react"

import type { DshBreakdownRow, DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { KPI_METRICS, type KpiBlocks, type KpiMetric, type KpiPair, type KpiRow } from "@/lib/branch/parsers/kpi"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const SALES_LEDGER_IMPORTS_CACHE_TAG = "sales-ledger-imports"

type SalesLedgerTabKey = "dsh" | "rev" | "kpi"
const SALES_LEDGER_TAB_KEYS: SalesLedgerTabKey[] = ["dsh", "rev", "kpi"]

export interface ActiveImportRunInfo {
  runId: string
  startedAt: string | null
}

interface ActiveSourceYearRow {
  tab_key: SalesLedgerTabKey
  import_run_id: string
  sales_ledger_import_runs: { started_at?: string } | Array<{ started_at?: string }> | null
}

interface DshDbRow {
  row_level: "total" | "team" | "member" | "breakdown" | "summary"
  row_kind: "goal" | "status" | "rate" | "gap"
  team: string | null
  member: string | null
  category: string | null
  status_type: string | null
  channel: string | null
  annual: number | string
  q1: number | string
  q2: number | string
  q3: number | string
  q4: number | string
  months: Record<string, number> | null
}

interface KpiDbRow {
  period_key: string
  period_month: string | null
  row_kind: "goal" | "status" | "gap" | "achievement"
  team: string | null
  member: string
  metrics: Record<string, unknown> | null
}

interface RevLineDbRow {
  id: string
  source_row: number
  source_record_key: string
  account_name: string
  branch_contact: string | null
  location: string | null
  scale: string | null
  importance: string | null
  team: string | null
  manager: string | null
  status: string | null
  deal_type: string | null
  product: string | null
  first_payment: string | null
  remark: string | null
  total_amount: number | string | null
  raw: Record<string, unknown> | null
  created_at: string
}

interface RevPeriodEntryDbRow {
  rev_line_id: string
  period_month: string
  amount: number | string
  confidence: "confirmed" | "high_confidence" | "expected" | "format_unavailable"
  source_week: string | null
}

function isMissingSalesLedgerImportTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    haystack.includes("sales_ledger_active_sources") ||
    haystack.includes("sales_ledger_import_runs") ||
    haystack.includes("branch_dsh_rows") ||
    haystack.includes("branch_kpi_rows") ||
    haystack.includes("branch_rev_lines") ||
    haystack.includes("branch_rev_period_entries")
  ) && (
    haystack.includes("does not exist") ||
    haystack.includes("could not find") ||
    haystack.includes("schema cache") ||
    haystack.includes("42p01")
  )
}

const FETCH_PAGE_SIZE = 1000

type PostgrestErrorish = { code?: string; message?: string; details?: string; hint?: string }

// PostgREST(Supabase)는 요청당 반환 행 수를 기본 1000으로 캡한다. import_run 단위 전량
// 조회(rev period entries는 행×월×주차라 한 해가 차면 수천 행)가 캡에 걸리면 에러 없이
// 잘려 월 합계가 조용히 틀어진다 — 짧은 페이지가 나올 때까지 range로 이어 읽는다.
// buildQuery는 매 페이지 새 쿼리를 만들어야 하며(빌더는 1회용), 안정적 페이징을 위해
// 반드시 결정적 order를 포함해야 한다.
async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: PostgrestErrorish | null }>,
): Promise<{ rows: T[]; error: PostgrestErrorish | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + FETCH_PAGE_SIZE - 1)
    if (error) return { rows: [], error }
    const page = (data ?? []) as T[]
    rows.push(...page)
    if (page.length < FETCH_PAGE_SIZE) break
  }
  return { rows, error: null }
}

function toNumber(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function addToNumberMap(target: Record<string, number>, key: string, value: number) {
  if (!Number.isFinite(value) || value === 0) return
  target[key] = (target[key] ?? 0) + value
}

function weekIndexFromLabel(label: string | null): number | null {
  if (!label) return null
  const match = label.trim().match(/^(?:w([1-5])|([1-5])w)$/i)
  const value = Number(match?.[1] ?? match?.[2])
  if (!Number.isInteger(value) || value < 1 || value > 5) return null
  return value - 1
}

function addWeeklyPayment(target: Record<string, number[]>, month: string, weekLabel: string | null, amount: number) {
  const index = weekIndexFromLabel(weekLabel)
  if (index == null || !Number.isFinite(amount) || amount === 0) return
  const values = target[month] ?? [0, 0, 0, 0, 0]
  values[index] = (values[index] ?? 0) + amount
  target[month] = values
}

// 액티브 임포트 포인터 조회는 summary/kpi/pipeline이 요청마다 부르는 핫패스다.
// ①run 상태 확인을 inner join으로 합쳐 왕복 1회로, ②fiscal_year 단위로 dsh/rev/kpi 3개
// tabKey를 한 쿼리에 담아(개별 tab_key 필터 제거) summary 라우트 같은 소비처가 Promise.all로
// 세 tabKey를 동시에 조회할 때도 왕복이 늘지 않게 한다(품질 웨이브3 — 이전엔 tabKey별로
// 별도 캐시 엔트리라 콜드일 때 3왕복이었다), ③300초 unstable_cache로 감싸(R5 항목 4:
// 60초→300초, 실측 캐시 미스 0.5~1.3s 스파이크 빈도를 5~6배 줄인다) "임포트 없음(null)이
// 대부분"인 현재 상태에서 요청당 Supabase 왕복을 없앤다. 인앱 전환(REV DB-native
// 재캡처/활성화)은 activateRevImportRun(lib/repositories/sales-ledger-rev-import.ts)이
// 성공 직후 같은 SALES_LEDGER_IMPORTS_CACHE_TAG를 revalidateTag("max")로 무효화하므로
// TTL과 무관하게 즉시 반영된다 — 이 300초가 실제로 지연시키는 건 앱 밖(운영 스크립트)이
// sales_ledger_active_sources를 직접 upsert하는 경로뿐이며, 그 stale 창도 60초에서
// 300초로 함께 늘어난다(외부 스크립트 전환은 애초에 분 단위 운영 작업이라 감내 가능한
// 트레이드오프로 판단). started_at도 함께 실어 "서빙 소스가 언제 캡처된 런인지"
// (data_sources 노출용)를 별도 왕복 없이 답할 수 있게 한다 — 2026-07-16 스테일 임포트
// 사고 이후 요구사항.
async function lookupActiveImportRunInfoForYear(fiscalYear: number): Promise<Record<SalesLedgerTabKey, ActiveImportRunInfo | null>> {
  const empty: Record<SalesLedgerTabKey, ActiveImportRunInfo | null> = { dsh: null, rev: null, kpi: null }
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("sales_ledger_active_sources")
    .select("tab_key, import_run_id, sales_ledger_import_runs!inner(status, started_at)")
    .eq("fiscal_year", fiscalYear)
    .eq("sales_ledger_import_runs.status", "succeeded")

  if (error) {
    if (isMissingSalesLedgerImportTableError(error)) return empty
    throw new Error(`[sales-ledger-imports] active source lookup failed: ${error.message}`)
  }

  const result = { ...empty }
  for (const row of (data ?? []) as ActiveSourceYearRow[]) {
    // M2O inner join은 보통 객체로 오지만, 타입 미탐지 시 배열로 직렬화될 수 있어 양쪽 다 수용한다.
    const joined = row.sales_ledger_import_runs
    const startedAt = Array.isArray(joined) ? joined[0]?.started_at : joined?.started_at
    if (SALES_LEDGER_TAB_KEYS.includes(row.tab_key)) {
      result[row.tab_key] = { runId: row.import_run_id, startedAt: startedAt ?? null }
    }
  }
  return result
}

const getCachedActiveImportRunInfoForYear = unstable_cache(
  async (fiscalYear: number) => lookupActiveImportRunInfoForYear(fiscalYear),
  ["sales-ledger-active-import-run-year"],
  { revalidate: 300, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

// React cache()로 같은 요청 안에서의 중복 실행을 접는다: summary 라우트는 dsh(readDshWithSource)·
// kpi(readKpiBlocksPreferDb)·rev(readRevDealsPreferActiveWithSource)를 Promise.all로 동시에
// 부르고, 셋 다 같은 fiscalYear로 이 배치 조회를 탄다 — cache() 없이는 콜드 캐시일 때 동일
// fiscalYear 쿼리가 3번 동시 실행될 수 있다. lib/docs-content.ts의 getDocsContent와 같은 패턴
// (Next 요청 스코프에서 안전하게 리셋되는 React 요청 메모이제이션).
const getActiveImportRunInfoForYear = cache(
  async (fiscalYear: number) => getCachedActiveImportRunInfoForYear(fiscalYear),
)

async function getActiveImportRunId(tabKey: SalesLedgerTabKey, fiscalYear: number): Promise<string | null> {
  const infoByTab = await getActiveImportRunInfoForYear(fiscalYear)
  return infoByTab[tabKey]?.runId ?? null
}

// summary 라우트 등이 "지금 서빙 중인 소스가 임포트 런인지, 언제 캡처됐는지"를 표면화할 때
// 쓴다(data_sources). 기존 unstable_cache 키(getCachedActiveImportRunInfo 계열)를 fiscal_year
// 단위 배치로 재구성했을 뿐 태그·TTL·반환 타입은 그대로다.
export async function getActiveImportRunInfo(tabKey: SalesLedgerTabKey, fiscalYear: number): Promise<ActiveImportRunInfo | null> {
  const infoByTab = await getActiveImportRunInfoForYear(fiscalYear)
  return infoByTab[tabKey] ?? null
}

async function readDshContentForImportRun(importRunId: string): Promise<DshOutput | null> {
  const supabase = createSupabaseAdminClient()
  const { rows: data, error } = await fetchAllRows<DshDbRow>((from, to) =>
    supabase
      .from("branch_dsh_rows")
      .select("row_level,row_kind,team,member,category,status_type,channel,annual,q1,q2,q3,q4,months")
      .eq("import_run_id", importRunId)
      .order("id")
      .range(from, to),
  )

  if (error) {
    if (isMissingSalesLedgerImportTableError(error)) return null
    throw new Error(`[sales-ledger-imports] DSH import read failed: ${error.message}`)
  }

  const rows: DshRow[] = []
  const members: Record<string, string> = {}
  const breakdown: DshBreakdownRow[] = []

  for (const row of data) {
    if (row.row_kind !== "goal" && row.row_kind !== "status") continue
    const months = row.months ?? {}
    if (row.row_level === "breakdown") {
      if (!row.category || !row.status_type || !row.channel) continue
      breakdown.push({
        kind: row.row_kind,
        category: row.category,
        status_type: row.status_type,
        channel: row.channel,
        annual: toNumber(row.annual),
        quarters: [toNumber(row.q1), toNumber(row.q2), toNumber(row.q3), toNumber(row.q4)] as [number, number, number, number],
        months,
      })
      continue
    }

    if (row.row_level !== "team" && row.row_level !== "member" && row.row_level !== "total") continue
    if (!row.team && row.row_level !== "total") continue
    // 임포트 행에는 캡처 당시 표기(예: "Hwang")가 저장돼 있다 — REV manager(아래
    // readRevDealsForImportRun)와 동일하게 읽기 시점에 정규화해, member-names 별칭
    // 추가가 액티브 임포트 재캡처 없이도 바로 반영되게 한다.
    const member = normalizeBranchMemberName(row.member)
    if (row.row_level === "member" && member && row.team) members[member] = row.team
    rows.push({
      level: row.row_level === "member" ? "member" : "team",
      team: row.row_level === "total" ? "ALL" : row.team ?? "ALL",
      member: member ?? undefined,
      kind: row.row_kind,
      annual: toNumber(row.annual),
      quarters: [toNumber(row.q1), toNumber(row.q2), toNumber(row.q3), toNumber(row.q4)] as [number, number, number, number],
      months,
    })
  }

  if (rows.length === 0 && breakdown.length === 0) return null
  return { rows, members, breakdown }
}

// DSH 콘텐츠(전량 페이징 조회, KR Team 등에서 요청마다 재계산)는 REV의
// readCachedRevDealsForImportRun과 같은 이유로 캐시한다: succeeded run 아래 행은 캡처
// 스크립트(scripts/import-sales-ledger-files.mjs)가 insert만 하고 이후 절대 update/delete하지
// 않으므로 importRunId만으로 안전하게 불변 캐시할 수 있다. 액티브 소스 전환(→ 새 runId)은
// getCachedActiveImportRunInfo의 기존 60초 TTL이 이미 감당하던 지연이라 이 캐시를 얹어도
// 신선도 특성이 바뀌지 않는다 — 새 runId는 캐시 키가 달라 자연히 미스로 새로 읽는다.
// DSH/KPI는 REV의 db-import 라우트(captureRevDbImport→activateRevImportRun) 같은 인앱
// 재캡처/활성화 경로가 없어(외부 스크립트로만 active_sources 전환) revalidateTag를 추가로
// 걸어야 할 인앱 뮤테이션이 없다(grep 확인: tab_key="dsh"/"kpi" upsert는 스크립트 전용).
const readCachedDshContentForImportRun = unstable_cache(
  async (importRunId: string) => readDshContentForImportRun(importRunId),
  ["sales-ledger-dsh-import-run"],
  { revalidate: 300, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

// knownRunId: 호출부가 이미 getActiveImportRunInfo로 runId를 확보했을 때(WithSource 변형)
// 넘겨 내부 재조회를 생략한다. 미전달 시(undefined) 기존과 동일하게 자체 조회한다.
export async function readDshFromActiveImport(fiscalYear: number, knownRunId?: string): Promise<DshOutput | null> {
  const importRunId = knownRunId ?? (await getActiveImportRunId("dsh", fiscalYear))
  if (!importRunId) return null
  return readCachedDshContentForImportRun(importRunId)
}

async function readRevDealsForImportRun(importRunId: string, team: string): Promise<BranchRevDeal[] | null> {
  const supabase = createSupabaseAdminClient()
  const { rows: lines, error: lineError } = await fetchAllRows<RevLineDbRow>((from, to) => {
    let lineQuery = supabase
      .from("branch_rev_lines")
      .select("id,source_row,source_record_key,account_name,branch_contact,location,scale,importance,team,manager,status,deal_type,product,first_payment,remark,total_amount,raw,created_at")
      .eq("import_run_id", importRunId)
    if (team !== "ALL") lineQuery = lineQuery.eq("team", team)
    return lineQuery.order("source_row").range(from, to)
  })
  if (lineError) {
    if (isMissingSalesLedgerImportTableError(lineError)) return null
    throw new Error(`[sales-ledger-imports] REV line import read failed: ${lineError.message}`)
  }

  if (lines.length === 0) return null

  const { rows: entryData, error: entryError } = await fetchAllRows<RevPeriodEntryDbRow>((from, to) =>
    supabase
      .from("branch_rev_period_entries")
      .select("rev_line_id,period_month,amount,confidence,source_week")
      .eq("import_run_id", importRunId)
      .order("id")
      .range(from, to),
  )

  if (entryError) {
    if (isMissingSalesLedgerImportTableError(entryError)) return null
    throw new Error(`[sales-ledger-imports] REV period import read failed: ${entryError.message}`)
  }

  const entriesByLineId = new Map<string, RevPeriodEntryDbRow[]>()
  for (const entry of entryData) {
    const entries = entriesByLineId.get(entry.rev_line_id) ?? []
    entries.push(entry)
    entriesByLineId.set(entry.rev_line_id, entries)
  }

  return lines.map((line) => {
    const entries = entriesByLineId.get(line.id) ?? []
    const monthlyPayments: Record<string, number> = {}
    const monthlyConfirmed: Record<string, number> = {}
    const monthlyHighConfidence: Record<string, number> = {}
    const monthlyRed: Record<string, boolean> = {}
    const weeklyPayments: Record<string, number[]> = {}
    const hasExplicitConfidence = entries.some((entry) => entry.confidence !== "format_unavailable")

    for (const entry of entries) {
      const amount = toNumber(entry.amount)
      if (!amount) continue
      addToNumberMap(monthlyPayments, entry.period_month, amount)
      addWeeklyPayment(weeklyPayments, entry.period_month, entry.source_week, amount)

      if (entry.confidence === "confirmed") {
        addToNumberMap(monthlyConfirmed, entry.period_month, amount)
        monthlyRed[entry.period_month] = true
      } else if (entry.confidence === "high_confidence") {
        addToNumberMap(monthlyHighConfidence, entry.period_month, amount)
        if (monthlyRed[entry.period_month] !== true) monthlyRed[entry.period_month] = false
      } else if (entry.confidence === "expected" || entry.confidence === "format_unavailable" || hasExplicitConfidence) {
        if (monthlyRed[entry.period_month] !== true) monthlyRed[entry.period_month] = false
      }
    }

    return {
      id: line.id,
      sheet_row: line.source_row,
      customer_name: line.account_name,
      branch_contact: line.branch_contact,
      team: line.team,
      manager: normalizeBranchMemberName(line.manager),
      deal_type: line.deal_type,
      status: line.status,
      first_payment: line.first_payment,
      product_version: line.product,
      region: line.location,
      importance: line.importance,
      note: line.remark,
      contract_target: toNumber(line.total_amount),
      monthly_payments: monthlyPayments,
      monthly_red: monthlyRed,
      monthly_confirmed: monthlyConfirmed,
      monthly_high_conf: monthlyHighConfidence,
      raw: {
        ...(line.raw ?? {}),
        source_record_key: line.source_record_key,
        scale: line.scale,
        weeklyPayments,
      },
      synced_at: line.created_at,
    }
  })
}

// 워크벤치는 REV 화면에서 summary/heatmap/ledger를 동시에 조회해 같은 액티브 런 전량
// (라인+월별 엔트리 페이징)을 요청마다 3번씩 다시 읽었다. run 데이터는 succeeded 이후
// 불변이므로 (importRunId, team)을 키로 캐시한다 — 액티브 전환 시 runId가 바뀌어 키가
// 자연히 갈리고, 캡처/활성화 경로의 revalidateTag(SALES_LEDGER_IMPORTS_CACHE_TAG)
// (activateRevImportRun에서 호출)가 태그로도 즉시 무효화한다.
const readCachedRevDealsForImportRun = unstable_cache(
  async (importRunId: string, team: string) => readRevDealsForImportRun(importRunId, team),
  ["sales-ledger-rev-import-run"],
  { revalidate: 300, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

// knownRunId: readRevDealsPreferActiveWithSource 등 호출부가 이미 getActiveImportRunInfo로
// runId를 확보했을 때 넘겨 내부 재조회를 생략한다. 미전달 시(undefined) 기존과 동일하게
// 자체 조회한다 — 기존 소비처(heatmap/kpi/data-quality/insights/pipeline route 등) 시그니처 불변.
export async function readRevDealsFromActiveImport(
  fiscalYear: number,
  filter?: { team?: string },
  knownRunId?: string,
): Promise<BranchRevDeal[] | null> {
  const importRunId = knownRunId ?? (await getActiveImportRunId("rev", fiscalYear))
  if (!importRunId) return null
  const team = filter?.team && filter.team !== "ALL" ? filter.team : "ALL"
  return readCachedRevDealsForImportRun(importRunId, team)
}

const KPI_DB_METRIC_BY_APP_METRIC: Record<KpiMetric, string> = {
  LD: "lead",
  ACC: "acc",
  OPP: "opp",
  SOL: "sol",
  VST: "visit",
}

function emptyKpiPairs(): Record<KpiMetric, KpiPair> {
  const pairs = {} as Record<KpiMetric, KpiPair>
  KPI_METRICS.forEach((metric) => {
    pairs[metric] = { goal: 0, actual: 0 }
  })
  return pairs
}

function kpiMetricValue(metrics: Record<string, unknown> | null, metric: KpiMetric) {
  const value = metrics?.[KPI_DB_METRIC_BY_APP_METRIC[metric]]
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function rowsToKpiRows(rows: KpiDbRow[]) {
  const byMember = new Map<string, { team: string | null; pairs: Record<KpiMetric, KpiPair> }>()

  for (const row of rows) {
    if (row.row_kind !== "goal" && row.row_kind !== "status") continue
    // DSH members("Chanwoo")와 매칭 키가 어긋나지 않게 KPI 임포트 행도 읽기 시점 정규화.
    const member = normalizeBranchMemberName(row.member) ?? row.member
    if (!byMember.has(member)) byMember.set(member, { team: row.team, pairs: emptyKpiPairs() })
    const target = byMember.get(member)!
    if (!target.team && row.team) target.team = row.team
    KPI_METRICS.forEach((metric) => {
      const value = kpiMetricValue(row.metrics, metric)
      if (row.row_kind === "goal") target.pairs[metric].goal += value
      else target.pairs[metric].actual += value
    })
  }

  return Array.from(byMember.entries()).map(([member, value]): KpiRow => ({
    member,
    pairs: value.pairs,
  }))
}

async function readKpiContentForImportRun(importRunId: string): Promise<KpiBlocks | null> {
  const supabase = createSupabaseAdminClient()
  const { rows: dbRows, error } = await fetchAllRows<KpiDbRow>((from, to) =>
    supabase
      .from("branch_kpi_rows")
      .select("period_key,period_month,row_kind,team,member,metrics")
      .eq("import_run_id", importRunId)
      .order("id")
      .range(from, to),
  )

  if (error) {
    if (isMissingSalesLedgerImportTableError(error)) return null
    throw new Error(`[sales-ledger-imports] KPI import read failed: ${error.message}`)
  }

  if (dbRows.length === 0) return null

  // period_month별로 한 번만 버킷팅 — 기존 구현은 행마다 전체 filter + rowsToKpiRows를
  // 반복 계산(O(n²))했고 같은 월을 여러 번 다시 만들었다.
  const fyRows: KpiDbRow[] = []
  const rowsByMonth = new Map<number, KpiDbRow[]>()
  for (const row of dbRows) {
    if (!row.period_month) {
      fyRows.push(row)
      continue
    }
    const month = Number(row.period_month.slice(5, 7))
    if (!Number.isFinite(month)) continue
    const bucket = rowsByMonth.get(month)
    if (bucket) bucket.push(row)
    else rowsByMonth.set(month, [row])
  }

  const months: Record<number, KpiRow[]> = {}
  for (const [month, rows] of rowsByMonth) {
    months[month] = rowsToKpiRows(rows)
  }

  return {
    fy: rowsToKpiRows(fyRows),
    months,
  }
}

// DSH와 동일한 근거(위 readCachedDshContentForImportRun 주석 참조)로 importRunId 키 캐시.
const readCachedKpiContentForImportRun = unstable_cache(
  async (importRunId: string) => readKpiContentForImportRun(importRunId),
  ["sales-ledger-kpi-import-run"],
  { revalidate: 300, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

export async function readKpiBlocksFromActiveImport(fiscalYear: number): Promise<KpiBlocks | null> {
  const importRunId = await getActiveImportRunId("kpi", fiscalYear)
  if (!importRunId) return null
  return readCachedKpiContentForImportRun(importRunId)
}
