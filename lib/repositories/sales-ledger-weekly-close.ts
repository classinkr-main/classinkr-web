import "server-only"

import { createHash } from "node:crypto"

import { normalizedAccountKey } from "@/lib/branch/account-key"
import { dealHasColorData, splitMonthConfidence } from "@/lib/branch/computations/rev-confirmed"
import { listBranchRevDeals, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import { readRevDealsFromActiveImport } from "@/lib/repositories/sales-ledger-imports"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 주간 마감(Weekly Close): 현재 REV 상태를 sales_ledger_import_runs 스냅샷으로 남기고
// 두 스냅샷을 월 단위로 비교해 신규/증액/감액/소멸/확도 전환 수치를 만든다.
// 스냅샷 run은 metadata.purpose로 구분하며 active_sources는 절대 건드리지 않는다
// (앱이 읽는 소스는 그대로, 비교 전용 기록).

export const WEEKLY_CLOSE_PURPOSE = "weekly-close"

const INSERT_CHUNK_SIZE = 400
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

interface SnapshotMonthAmounts {
  amount: number
  confirmed: number
  highConfidence: number
  expected: number
}

interface SnapshotLine {
  key: string
  sourceRow: number
  account: string
  team: string | null
  manager: string | null
  status: string | null
  dealType: string | null
  product: string | null
  location: string | null
  remark: string | null
  totalAmount: number
  months: Record<string, SnapshotMonthAmounts>
}

export interface WeeklyCloseRun {
  id: string
  startedAt: string
  sourceName: string
  rowCounts: Record<string, number>
  dataSource: string
}

export interface WeeklyCloseCaptureResult {
  run: WeeklyCloseRun
  unchanged: boolean
}

export interface WeeklyCloseBucket {
  count: number
  baseAmount: number
  headAmount: number
  delta: number
}

export interface WeeklyCloseMover {
  key: string
  account: string
  team: string | null
  manager: string | null
  baseAmount: number
  headAmount: number
  delta: number
  bucket: WeeklyCloseBucketId
}

export type WeeklyCloseBucketId = "new" | "increased" | "decreased" | "dropped" | "unchanged"

export interface WeeklyCloseDiff {
  month: string
  baseRunId: string
  headRunId: string
  baseTotal: number
  headTotal: number
  delta: number
  buckets: Record<WeeklyCloseBucketId, WeeklyCloseBucket>
  confirmedDelta: number
  highConfidenceDelta: number
  movers: WeeklyCloseMover[]
}

function fiscalYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? numeric : 0
}

function recordKeyOf(deal: BranchRevDeal): string {
  const stored = deal.raw?.source_record_key
  if (typeof stored === "string" && stored.trim()) return stored.trim()
  return `sheet:${deal.sheet_row}:${normalizedAccountKey(deal.customer_name)}`
}

function snapshotLineOf(deal: BranchRevDeal): SnapshotLine {
  const months: Record<string, SnapshotMonthAmounts> = {}
  // 확도 3분해는 캐논 splitter(rev-confirmed.ts) — 이전 구현은 monthly_confirmed 맵만 봐서
  // red-불리언·무색상 행의 확정이 스냅샷에서 expected로 강등되던 과소집계가 있었다.
  const hasColor = dealHasColorData(deal)
  for (const [month, rawAmount] of Object.entries(deal.monthly_payments ?? {})) {
    if (!MONTH_RE.test(month)) continue
    const amount = toNumber(rawAmount)
    if (amount === 0) continue
    const { confirmed, highConfidence, expected } = splitMonthConfidence(deal, month, amount, hasColor)
    months[month] = { amount, confirmed, highConfidence, expected }
  }

  return {
    key: recordKeyOf(deal),
    sourceRow: deal.sheet_row,
    account: deal.customer_name || "미지정",
    team: deal.team,
    manager: deal.manager,
    status: deal.status,
    dealType: deal.deal_type,
    product: deal.product_version,
    location: deal.region,
    remark: deal.note,
    totalAmount: toNumber(deal.contract_target),
    months,
  }
}

// 같은 상태를 다시 찍으면 같은 checksum이 되도록 결정적으로 직렬화한다.
function snapshotChecksum(lines: SnapshotLine[]): string {
  const canonical = lines
    .map((line) => ({
      key: line.key,
      months: Object.entries(line.months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, value]) => [month, value.amount, value.confirmed, value.highConfidence]),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex")
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function loadCurrentSnapshotLines(fiscalYear: number): Promise<{ lines: SnapshotLine[]; dataSource: string }> {
  const imported = await readRevDealsFromActiveImport(fiscalYear)
  // recordKeyOf가 deal.raw?.source_record_key를 읽으므로(branch-deals.ts 기본값은 raw 제외) opt-in.
  const deals = imported ?? (await listBranchRevDeals(undefined, { withRaw: true }))
  // 같은 record key가 중복되면(시트 행 밀림 등) 마지막 행이 이긴다 —
  // 스냅샷은 상태 기록이므로 합산보다 결정적 대표값이 안전하다.
  const byKey = new Map<string, SnapshotLine>()
  for (const deal of deals) {
    const line = snapshotLineOf(deal)
    byKey.set(line.key, line)
  }
  return {
    lines: Array.from(byKey.values()),
    dataSource: imported ? "db-import" : "sheet-fallback",
  }
}

export async function captureWeeklyCloseSnapshot(actor: string): Promise<WeeklyCloseCaptureResult> {
  const supabase = createSupabaseAdminClient()
  const now = new Date()
  const fiscalYear = fiscalYearOf(now)
  const { lines, dataSource } = await loadCurrentSnapshotLines(fiscalYear)
  if (lines.length === 0) {
    throw new Error("스냅샷으로 남길 REV 행이 없습니다. 동기화 후 다시 시도하세요.")
  }
  const checksum = snapshotChecksum(lines)

  const { data: existing, error: existingError } = await supabase
    .from("sales_ledger_import_runs")
    .select("id,started_at,source_name,row_counts,metadata")
    .eq("fiscal_year", fiscalYear)
    .eq("source_kind", "manual")
    .eq("status", "succeeded")
    .eq("source_checksum", checksum)
    .maybeSingle()
  if (existingError) {
    throw new Error(`[weekly-close] 기존 스냅샷 조회 실패: ${existingError.message}`)
  }
  if (existing) {
    return {
      run: {
        id: existing.id as string,
        startedAt: existing.started_at as string,
        sourceName: existing.source_name as string,
        rowCounts: (existing.row_counts ?? {}) as Record<string, number>,
        dataSource: String((existing.metadata as Record<string, unknown> | null)?.dataSource ?? dataSource),
      },
      unchanged: true,
    }
  }

  const { data: runRow, error: runError } = await supabase
    .from("sales_ledger_import_runs")
    .insert({
      fiscal_year: fiscalYear,
      source_kind: "manual",
      source_name: `weekly-close ${now.toISOString().slice(0, 16).replace("T", " ")}`,
      status: "running",
      source_checksum: checksum,
      imported_by: actor,
      metadata: { purpose: WEEKLY_CLOSE_PURPOSE, dataSource },
    })
    .select("id,started_at,source_name")
    .single()
  if (runError || !runRow) {
    throw new Error(`[weekly-close] 스냅샷 run 생성 실패: ${runError?.message ?? "empty insert result"}`)
  }
  const runId = runRow.id as string

  const failRun = async (message: string) => {
    await supabase
      .from("sales_ledger_import_runs")
      .update({ status: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
      .eq("id", runId)
  }

  try {
    const lineIdByKey = new Map<string, string>()
    for (const chunk of chunked(lines, INSERT_CHUNK_SIZE)) {
      const { data: inserted, error: lineError } = await supabase
        .from("branch_rev_lines")
        .insert(chunk.map((line) => ({
          import_run_id: runId,
          fiscal_year: fiscalYear,
          source_row: line.sourceRow,
          source_record_key: line.key,
          account_name: line.account,
          team: line.team,
          manager: line.manager,
          status: line.status,
          deal_type: line.dealType,
          product: line.product,
          location: line.location,
          remark: line.remark,
          total_amount: line.totalAmount,
          raw: { purpose: WEEKLY_CLOSE_PURPOSE },
        })))
        .select("id,source_record_key")
      if (lineError) throw new Error(`[weekly-close] rev line 기록 실패: ${lineError.message}`)
      for (const row of inserted ?? []) {
        lineIdByKey.set(row.source_record_key as string, row.id as string)
      }
    }

    const entryRows: Array<Record<string, unknown>> = []
    for (const line of lines) {
      const lineId = lineIdByKey.get(line.key)
      if (!lineId) continue
      for (const [month, value] of Object.entries(line.months)) {
        const parts: Array<[string, number]> = [
          ["confirmed", value.confirmed],
          ["high_confidence", value.highConfidence],
          ["expected", value.expected],
        ]
        for (const [confidence, amount] of parts) {
          if (amount === 0) continue
          entryRows.push({
            import_run_id: runId,
            rev_line_id: lineId,
            fiscal_year: fiscalYear,
            period_month: month,
            amount,
            confidence,
            source_row: line.sourceRow,
          })
        }
      }
    }
    for (const chunk of chunked(entryRows, INSERT_CHUNK_SIZE)) {
      const { error: entryError } = await supabase.from("branch_rev_period_entries").insert(chunk)
      if (entryError) throw new Error(`[weekly-close] period entry 기록 실패: ${entryError.message}`)
    }

    const { error: doneError } = await supabase
      .from("sales_ledger_import_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        row_counts: { rev_lines: lines.length, rev_period_entries: entryRows.length },
      })
      .eq("id", runId)
    if (doneError) throw new Error(`[weekly-close] run 완료 처리 실패: ${doneError.message}`)

    return {
      run: {
        id: runId,
        startedAt: runRow.started_at as string,
        sourceName: runRow.source_name as string,
        rowCounts: { rev_lines: lines.length, rev_period_entries: entryRows.length },
        dataSource,
      },
      unchanged: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failRun(message)
    throw error
  }
}

export async function listWeeklyCloseRuns(limit = 12): Promise<WeeklyCloseRun[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("sales_ledger_import_runs")
    .select("id,started_at,source_name,row_counts,metadata")
    .eq("status", "succeeded")
    .eq("metadata->>purpose", WEEKLY_CLOSE_PURPOSE)
    .order("started_at", { ascending: false })
    .limit(limit)
  if (error) {
    throw new Error(`[weekly-close] 스냅샷 목록 조회 실패: ${error.message}`)
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    startedAt: row.started_at as string,
    sourceName: row.source_name as string,
    rowCounts: (row.row_counts ?? {}) as Record<string, number>,
    dataSource: String((row.metadata as Record<string, unknown> | null)?.dataSource ?? "unknown"),
  }))
}

interface RunMonthLine {
  account: string
  team: string | null
  manager: string | null
  amount: number
  confirmed: number
  highConfidence: number
}

async function loadRunMonth(runId: string, month: string): Promise<Map<string, RunMonthLine>> {
  const supabase = createSupabaseAdminClient()
  const result = new Map<string, RunMonthLine>()

  const lineMeta = new Map<string, { key: string; account: string; team: string | null; manager: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("branch_rev_lines")
      .select("id,source_record_key,account_name,team,manager")
      .eq("import_run_id", runId)
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(`[weekly-close] run 라인 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      lineMeta.set(row.id as string, {
        key: row.source_record_key as string,
        account: row.account_name as string,
        team: (row.team ?? null) as string | null,
        manager: (row.manager ?? null) as string | null,
      })
    }
    if ((data ?? []).length < 1000) break
  }

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("branch_rev_period_entries")
      .select("rev_line_id,amount,confidence")
      .eq("import_run_id", runId)
      .eq("period_month", month)
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(`[weekly-close] run 월 금액 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      const meta = lineMeta.get(row.rev_line_id as string)
      if (!meta) continue
      const current = result.get(meta.key) ?? {
        account: meta.account,
        team: meta.team,
        manager: meta.manager,
        amount: 0,
        confirmed: 0,
        highConfidence: 0,
      }
      const amount = toNumber(row.amount)
      current.amount += amount
      if (row.confidence === "confirmed") current.confirmed += amount
      if (row.confidence === "high_confidence") current.highConfidence += amount
      result.set(meta.key, current)
    }
    if ((data ?? []).length < 1000) break
  }

  return result
}

export async function diffWeeklyClose(baseRunId: string, headRunId: string, month: string): Promise<WeeklyCloseDiff> {
  if (!MONTH_RE.test(month)) throw new Error("month 형식이 잘못됐습니다 (YYYY-MM).")
  const [base, head] = await Promise.all([loadRunMonth(baseRunId, month), loadRunMonth(headRunId, month)])

  const emptyBucket = (): WeeklyCloseBucket => ({ count: 0, baseAmount: 0, headAmount: 0, delta: 0 })
  const buckets: Record<WeeklyCloseBucketId, WeeklyCloseBucket> = {
    new: emptyBucket(),
    increased: emptyBucket(),
    decreased: emptyBucket(),
    dropped: emptyBucket(),
    unchanged: emptyBucket(),
  }
  const movers: WeeklyCloseMover[] = []

  let baseTotal = 0
  let headTotal = 0
  let confirmedDelta = 0
  let highConfidenceDelta = 0

  const keys = new Set<string>([...base.keys(), ...head.keys()])
  for (const key of keys) {
    const baseLine = base.get(key)
    const headLine = head.get(key)
    const baseAmount = baseLine?.amount ?? 0
    const headAmount = headLine?.amount ?? 0
    baseTotal += baseAmount
    headTotal += headAmount
    confirmedDelta += (headLine?.confirmed ?? 0) - (baseLine?.confirmed ?? 0)
    highConfidenceDelta += (headLine?.highConfidence ?? 0) - (baseLine?.highConfidence ?? 0)

    let bucket: WeeklyCloseBucketId
    if (baseAmount === 0 && headAmount === 0) continue
    else if (baseAmount === 0) bucket = "new"
    else if (headAmount === 0) bucket = "dropped"
    else if (headAmount > baseAmount) bucket = "increased"
    else if (headAmount < baseAmount) bucket = "decreased"
    else bucket = "unchanged"

    const target = buckets[bucket]
    target.count += 1
    target.baseAmount += baseAmount
    target.headAmount += headAmount
    target.delta += headAmount - baseAmount

    if (bucket !== "unchanged") {
      movers.push({
        key,
        account: headLine?.account ?? baseLine?.account ?? key,
        team: headLine?.team ?? baseLine?.team ?? null,
        manager: headLine?.manager ?? baseLine?.manager ?? null,
        baseAmount,
        headAmount,
        delta: headAmount - baseAmount,
        bucket,
      })
    }
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    month,
    baseRunId,
    headRunId,
    baseTotal,
    headTotal,
    delta: headTotal - baseTotal,
    buckets,
    confirmedDelta,
    highConfidenceDelta,
    movers: movers.slice(0, 10),
  }
}
