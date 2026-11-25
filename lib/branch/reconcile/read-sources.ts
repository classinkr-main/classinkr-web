import "server-only"

// REV 시트 ↔ 장부 대조(scripts/reconcile-rev-ledger.ts --sheet=live --db=live)의 라이브 읽기 — 읽기만 한다.
//
//  - 시트: '2. REV' 를 동기화(syncRev)와 같은 범위·같은 칸 모양으로 spreadsheets.get 한 번.
//  - DB: select 만. REV 행은 화면과 같은 순서(액티브 임포트 → 없으면 raw 포함 미러, lib/branch/read-rev-deals.ts)이되
//    캐시를 거치지 않는다 — unstable_cache·React cache 는 Next 밖(스크립트)에서 던지고, 동기화 직후의 오래된 캐시로
//    대조하면 "동기화 뒤 시트 변경"을 잘못 낸다. 장부 항목·초안은 그 회계연도 달 범위로 끝까지 페이지로 읽는다.
//
// 이 파일에는 쓰기·동기화·캐시 만료가 없다(tests/branch/reconcile/reconcile-readonly.test.ts 가 글자로 막는다).

import { envSheetId, readRangeWithFormat } from "@/lib/branch/google-sheets"
import { fiscalYearMonths } from "@/lib/branch/fiscal"
import { REV_RANGE } from "@/lib/branch/parsers/rev"
import { listBranchRevDealsFresh, type BranchRevDeal } from "@/lib/repositories/branch-deals"
import {
  listBranchSalesLedgerDrafts,
  listBranchSalesLedgerEntries,
  type BranchSalesLedgerDraft,
  type BranchSalesLedgerEntry,
} from "@/lib/repositories/branch-sales-ledger-drafts"
import {
  isSheetWritesNotReadyError,
  lastSuccessfulRevSyncStartedAt,
  latestSheetWritesByDraftIds,
} from "@/lib/repositories/branch-sales-ledger-sheet-writes"
import {
  mapRevLineToDeal,
  REV_LINE_COLUMNS,
  REV_PERIOD_ENTRY_COLUMNS,
  type RevLineDbRow,
  type RevPeriodEntryDbRow,
} from "@/lib/repositories/sales-ledger-imports"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages, type SupabasePageResult } from "@/lib/supabase/pagination"
import { getSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import type {
  ReconcileDraft,
  ReconcileEntry,
  ReconcileLedgerInput,
  ReconcileLedgerSource,
  ReconcileSheetInput,
} from "./rev-ledger-inputs"

export type ReconcileDbSource = "screen" | "mirror" | "import"

/** 시트 한 번 읽기. 스프레드시트 id 는 끝 6글자만 돌려준다(로그용). */
export async function readLiveReconcileSheet(): Promise<{ input: ReconcileSheetInput; spreadsheetIdTail: string }> {
  const spreadsheetId = envSheetId("dashboard")
  const grid = await readRangeWithFormat(spreadsheetId, REV_RANGE)
  return {
    input: { grid, range: REV_RANGE, readAt: new Date().toISOString() },
    spreadsheetIdTail: spreadsheetId.slice(-6),
  }
}

// 열은 lib/repositories/sales-ledger-imports.ts 의 상수를 그대로 쓴다(한 곳 정의). 읽기는 캐시 없는 같은 읽기.
// 한 회계연도 임포트의 줄·엔트리 안전 상한 — 정상 운영(줄 수백, 엔트리 수천)에서는 닿지 않는다. 닿으면 불완전.
const IMPORT_MAX_ROWS = 200_000

function isMissingTableError(error: { code?: string; message?: string; details?: string; hint?: string } | null): boolean {
  if (!error) return false
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return haystack.includes("42p01") || haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")
}

interface ReadCounter {
  queries: number
}

async function readActiveRevImportRun(fiscalYear: number, counter: ReadCounter): Promise<ReconcileLedgerSource | null> {
  const supabase = createSupabaseAdminClient()
  counter.queries += 1
  const { data, error } = await supabase
    .from("sales_ledger_active_sources")
    .select("tab_key, import_run_id, sales_ledger_import_runs!inner(status, started_at)")
    .eq("fiscal_year", fiscalYear)
    .eq("tab_key", "rev")
    .eq("sales_ledger_import_runs.status", "succeeded")
  if (error) {
    if (isMissingTableError(error)) return null
    throw new Error(`[reconcile] 액티브 임포트 조회 실패: ${error.message}`)
  }
  const rows = (data ?? []) as Array<{ import_run_id?: unknown; sales_ledger_import_runs?: { started_at?: string } | Array<{ started_at?: string }> | null }>
  if (rows.length > 1) throw new Error(`[reconcile] FY${fiscalYear} REV 액티브 포인터가 ${rows.length}개다 — 관리자 확인`)
  const row = rows[0]
  if (!row || typeof row.import_run_id !== "string") return null
  const joined = row.sales_ledger_import_runs
  const startedAt = (Array.isArray(joined) ? joined[0]?.started_at : joined?.started_at) ?? null
  return { kind: "import", runId: row.import_run_id, startedAt }
}

async function readImportRunDeals(runId: string, counter: ReadCounter): Promise<{ deals: BranchRevDeal[]; truncated: boolean } | null> {
  const supabase = createSupabaseAdminClient()
  const lines = await fetchSupabasePages<RevLineDbRow>({
    maxRows: IMPORT_MAX_ROWS,
    fetchPage: (from, to) =>
      supabase
        .from("branch_rev_lines")
        .select(REV_LINE_COLUMNS)
        .eq("import_run_id", runId)
        .order("source_row")
        .order("id")
        .range(from, to) as unknown as PromiseLike<SupabasePageResult>,
  })
  counter.queries += lines.pages
  if (lines.error) {
    if (isMissingTableError(lines.error)) return null
    throw new Error(`[reconcile] 임포트 줄 조회 실패: ${lines.error.message ?? "unknown"}`)
  }
  if (lines.data.length === 0) return null
  const entries = await fetchSupabasePages<RevPeriodEntryDbRow>({
    maxRows: IMPORT_MAX_ROWS,
    fetchPage: (from, to) =>
      supabase
        .from("branch_rev_period_entries")
        .select(REV_PERIOD_ENTRY_COLUMNS)
        .eq("import_run_id", runId)
        .order("id")
        .range(from, to) as unknown as PromiseLike<SupabasePageResult>,
  })
  counter.queries += entries.pages
  if (entries.error) {
    if (isMissingTableError(entries.error)) return null
    throw new Error(`[reconcile] 임포트 월 엔트리 조회 실패: ${entries.error.message ?? "unknown"}`)
  }
  const byLine = new Map<string, RevPeriodEntryDbRow[]>()
  for (const entry of entries.data) {
    const list = byLine.get(entry.rev_line_id) ?? []
    list.push(entry)
    byLine.set(entry.rev_line_id, list)
  }
  return {
    deals: lines.data.map((line) => mapRevLineToDeal(line, byLine.get(line.id) ?? [])),
    truncated: lines.truncated || entries.truncated,
  }
}

async function readRevDeals(
  fiscalYear: number,
  dbSource: ReconcileDbSource,
  counter: ReadCounter,
): Promise<{ deals: BranchRevDeal[]; source: ReconcileLedgerSource; truncated: boolean }> {
  if (dbSource !== "mirror") {
    const run = await readActiveRevImportRun(fiscalYear, counter)
    const imported = run?.runId ? await readImportRunDeals(run.runId, counter) : null
    if (run && imported) return { deals: imported.deals, source: run, truncated: imported.truncated }
    if (dbSource === "import") throw new Error(`[reconcile] FY${fiscalYear} 액티브 REV 임포트가 없다(--db-source=import)`)
  }
  counter.queries += 1
  const deals = await listBranchRevDealsFresh({ withRaw: true })
  return { deals, source: { kind: "mirror", runId: null, startedAt: null }, truncated: false }
}

function toEntry(entry: BranchSalesLedgerEntry): ReconcileEntry {
  return {
    id: entry.id,
    draftId: entry.draftId,
    entryType: entry.entryType,
    entryStatus: entry.entryStatus,
    sourceDealId: entry.sourceDealId,
    sourceSheetRow: entry.sourceSheetRow,
    sourceSnapshot: entry.sourceSnapshot,
    customer: entry.customer,
    manager: entry.manager,
    team: entry.team,
    month: entry.month,
    amount: entry.amount,
    note: entry.note,
    appliedAt: entry.appliedAt,
    metadata: entry.metadata,
    currency: entry.currency,
  }
}

function toDraft(draft: BranchSalesLedgerDraft): ReconcileDraft {
  return {
    id: draft.id,
    kind: draft.kind,
    status: draft.status,
    sourceDealId: draft.sourceDealId,
    sourceSheetRow: draft.sourceSheetRow,
    sourceSnapshot: draft.sourceSnapshot,
    customer: draft.customer,
    manager: draft.manager,
    team: draft.team,
    month: draft.month,
    amount: draft.amount,
    note: draft.note,
    metadata: draft.metadata,
    appliedAt: draft.appliedAt,
    updatedAt: draft.updatedAt,
    currency: draft.currency,
  }
}

/** Supabase 호스트(로그용 — 어느 DB 를 읽었는지). 모르면 '?'. */
export function reconcileSupabaseHost(): string {
  try {
    return new URL(getSupabaseBrowserEnv().url).host
  } catch {
    return "?"
  }
}

/** 장부 DB 한 벌 — REV 행 + 그 회계연도 장부 항목(활성·상쇄)·적용 초안·열린 초안·시트 쓰기·마지막 REV 동기화. */
export async function readLiveReconcileLedger(
  fiscalYear: number,
  dbSource: ReconcileDbSource,
): Promise<{ input: ReconcileLedgerInput; host: string; queries: number }> {
  const counter: ReadCounter = { queries: 0 }
  const months = fiscalYearMonths(fiscalYear)
  const range = { from: months[0], to: months[months.length - 1] }

  const rev = await readRevDeals(fiscalYear, dbSource, counter)
  const [active, reversed, applied, open, lastRevSyncStartedAt] = await Promise.all([
    listBranchSalesLedgerEntries({ status: "active", months: range }),
    listBranchSalesLedgerEntries({ status: "reversed", months: range }),
    listBranchSalesLedgerDrafts({ statuses: ["applied"], months: range }),
    listBranchSalesLedgerDrafts({ statuses: ["draft", "checked"], months: range }),
    lastSuccessfulRevSyncStartedAt(),
  ])
  counter.queries += 5

  const entries = [...active.entries, ...reversed.entries].map(toEntry)
  const appliedDrafts = applied.drafts.map(toDraft)
  const openDrafts = open.drafts.map(toDraft)

  // 화면(GET ledger-drafts)·서버 매출(lib/branch/ledger-revenue.ts)과 같은 초안 id 집합의 가장 최근 시트 쓰기
  let sheetWritesReadable = true
  const sheetWrites: ReconcileLedgerInput["sheetWrites"] = {}
  const draftIds = [...new Set([...entries.map((entry) => entry.draftId), ...appliedDrafts.map((draft) => draft.id)].filter((id): id is string => Boolean(id)))]
  if (draftIds.length > 0) {
    try {
      counter.queries += 1
      const latest = await latestSheetWritesByDraftIds(draftIds)
      for (const [draftId, record] of latest) sheetWrites[draftId] = { status: record.status, writtenAt: record.writtenAt }
    } catch (error) {
      if (!isSheetWritesNotReadyError(error)) sheetWritesReadable = false
    }
  }

  return {
    input: {
      source: rev.source,
      deals: rev.deals,
      entries,
      appliedDrafts,
      openDrafts,
      sheetWrites,
      lastRevSyncStartedAt,
      truncated: {
        deals: rev.truncated,
        entries: Boolean(active.truncated || reversed.truncated),
        appliedDrafts: Boolean(applied.truncated),
        openDrafts: Boolean(open.truncated),
      },
      entriesHealthOk: active.health.ok && reversed.health.ok,
      sheetWritesReadable,
    },
    host: reconcileSupabaseHost(),
    queries: counter.queries,
  }
}
