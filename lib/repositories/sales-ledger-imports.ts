import "server-only"

import { unstable_cache } from "next/cache"

import type { DshBreakdownRow, DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { KPI_METRICS, type KpiBlocks, type KpiMetric, type KpiPair, type KpiRow } from "@/lib/branch/parsers/kpi"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const SALES_LEDGER_IMPORTS_CACHE_TAG = "sales-ledger-imports"

type SalesLedgerTabKey = "dsh" | "rev" | "kpi"

interface ActiveSourceRow {
  import_run_id: string
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
// ①run 상태 확인을 inner join으로 합쳐 왕복 1회로, ②60초 unstable_cache로 감싸
// "임포트 없음(null)"이 대부분인 현재 상태에서 요청당 Supabase 왕복을 없앤다.
// 액티브 소스 전환(임포트 스크립트)은 앱 밖에서 일어나므로 최대 60초 지연 허용.
async function lookupActiveImportRunId(tabKey: SalesLedgerTabKey, fiscalYear: number): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("sales_ledger_active_sources")
    .select("import_run_id, sales_ledger_import_runs!inner(status)")
    .eq("tab_key", tabKey)
    .eq("fiscal_year", fiscalYear)
    .eq("sales_ledger_import_runs.status", "succeeded")
    .maybeSingle()

  if (error) {
    if (isMissingSalesLedgerImportTableError(error)) return null
    throw new Error(`[sales-ledger-imports] active source lookup failed: ${error.message}`)
  }

  return (data as ActiveSourceRow | null)?.import_run_id ?? null
}

const getCachedActiveImportRunId = unstable_cache(
  async (tabKey: SalesLedgerTabKey, fiscalYear: number) => lookupActiveImportRunId(tabKey, fiscalYear),
  ["sales-ledger-active-import-run"],
  { revalidate: 60, tags: [SALES_LEDGER_IMPORTS_CACHE_TAG] },
)

async function getActiveImportRunId(tabKey: SalesLedgerTabKey, fiscalYear: number): Promise<string | null> {
  return getCachedActiveImportRunId(tabKey, fiscalYear)
}

export async function readDshFromActiveImport(fiscalYear: number): Promise<DshOutput | null> {
  const importRunId = await getActiveImportRunId("dsh", fiscalYear)
  if (!importRunId) return null

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
    if (row.row_level === "member" && row.member && row.team) members[row.member] = row.team
    rows.push({
      level: row.row_level === "member" ? "member" : "team",
      team: row.row_level === "total" ? "ALL" : row.team ?? "ALL",
      member: row.member ?? undefined,
      kind: row.row_kind,
      annual: toNumber(row.annual),
      quarters: [toNumber(row.q1), toNumber(row.q2), toNumber(row.q3), toNumber(row.q4)] as [number, number, number, number],
      months,
    })
  }

  if (rows.length === 0 && breakdown.length === 0) return null
  return { rows, members, breakdown }
}

export async function readRevDealsFromActiveImport(
  fiscalYear: number,
  filter?: { team?: string },
): Promise<BranchRevDeal[] | null> {
  const importRunId = await getActiveImportRunId("rev", fiscalYear)
  if (!importRunId) return null

  const supabase = createSupabaseAdminClient()
  const { rows: lines, error: lineError } = await fetchAllRows<RevLineDbRow>((from, to) => {
    let lineQuery = supabase
      .from("branch_rev_lines")
      .select("id,source_row,source_record_key,account_name,branch_contact,location,scale,importance,team,manager,status,deal_type,product,first_payment,remark,total_amount,raw,created_at")
      .eq("import_run_id", importRunId)
    if (filter?.team && filter.team !== "ALL") lineQuery = lineQuery.eq("team", filter.team)
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
    if (!byMember.has(row.member)) byMember.set(row.member, { team: row.team, pairs: emptyKpiPairs() })
    const target = byMember.get(row.member)!
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

export async function readKpiBlocksFromActiveImport(fiscalYear: number): Promise<KpiBlocks | null> {
  const importRunId = await getActiveImportRunId("kpi", fiscalYear)
  if (!importRunId) return null

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
