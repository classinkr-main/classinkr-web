import "server-only"

// REV 시트 쓰기 시도 감사 기록(branch_sales_ledger_sheet_writes) 저장소.
//
// 장부 반영이 시트에 쓰려 할 때마다 초안 하나에 한 행을 남긴다(sending → written | failed | unknown,
// 처음부터 거절이면 refused). 행은 지우지 않는다(DB 트리거가 DELETE 를 막고, UPDATE 는 상태 칸만 허용).
// 표가 아직 없으면(마이그레이션 미적용) NOT_READY_MESSAGE 로 던진다 — 호출부가 isSheetWritesNotReadyError 로
// 구분해 "기록 생략·경고"(거절·실패 기록) 또는 "쓰기 중단"(시트에 쓰기 전 기록)을 고른다.

import { revalidateTag } from "next/cache"

import {
  SHEET_WRITE_ATTEMPT_STATUSES,
  type SheetWriteAttemptStatus,
} from "@/lib/branch/sheet-writeback/ledger-rules"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const BRANCH_SALES_LEDGER_SHEET_WRITES_CACHE_TAG = "branch-sales-ledger-sheet-writes"

const TABLE = "branch_sales_ledger_sheet_writes"
const NOT_READY_MESSAGE = "매출 장부 시트 쓰기 기록 DB 마이그레이션이 아직 적용되지 않았습니다."
const DRAFT_ID_CHUNK = 100
const ERROR_TEXT_LIMIT = 500

// 닫힌 목록의 정본은 ledger-rules.ts(클라이언트 겸용) — 화면도 같은 배열로 판독한다.
export const SHEET_WRITE_STATUSES = SHEET_WRITE_ATTEMPT_STATUSES
export type SheetWriteStatus = SheetWriteAttemptStatus

export interface SheetWriteRecord {
  id: string
  draftId: string
  batchId: string
  status: SheetWriteStatus
  code: string
  rowId: string | null
  sheetRow: number | null
  month: string | null
  cells: unknown[]
  actor: string
  error: string | null
  entryId: string | null
  createdAt: string
  writtenAt: string | null
}

interface SheetWriteRow {
  id: string
  draft_id: string
  batch_id: string
  status: SheetWriteStatus
  code: string
  row_id: string | null
  sheet_row: number | null
  ledger_month: string | null
  cells: unknown
  actor: string
  error: string | null
  entry_id: string | null
  created_at: string
  written_at: string | null
}

type PostgrestErrorLike = { code?: string; message?: string; details?: string; hint?: string }

function isMissingInfrastructure(error: PostgrestErrorLike): boolean {
  const code = (error.code ?? "").toUpperCase()
  if (code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204") return true
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes(TABLE) &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

/** 표·칸이 없어서 난 오류인가(42P01·42703·PGRST205 등, 또는 이 저장소가 번역해 던진 오류). */
export function isSheetWritesNotReadyError(e: unknown): boolean {
  if (e instanceof Error) return e.message === NOT_READY_MESSAGE
  if (e && typeof e === "object") return isMissingInfrastructure(e as PostgrestErrorLike)
  return false
}

function fail(action: string, error: PostgrestErrorLike): never {
  if (isMissingInfrastructure(error)) throw new Error(NOT_READY_MESSAGE)
  throw new Error(`[branch-sales-ledger-sheet-writes] ${action} 실패: ${error.message ?? "unknown"}`)
}

function clampError(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > ERROR_TEXT_LIMIT ? `${trimmed.slice(0, ERROR_TEXT_LIMIT)}…` : trimmed
}

function toRecord(row: SheetWriteRow): SheetWriteRecord {
  return {
    id: row.id,
    draftId: row.draft_id,
    batchId: row.batch_id,
    status: row.status,
    code: row.code,
    rowId: row.row_id,
    sheetRow: row.sheet_row,
    month: row.ledger_month,
    cells: Array.isArray(row.cells) ? row.cells : [],
    actor: row.actor,
    error: row.error,
    entryId: row.entry_id,
    createdAt: row.created_at,
    writtenAt: row.written_at,
  }
}

export type SheetWriteAttemptInsert = Omit<SheetWriteRecord, "id" | "createdAt" | "writtenAt" | "entryId" | "error"> & {
  error?: string | null
}

export async function insertSheetWriteAttempts(rows: SheetWriteAttemptInsert[]): Promise<SheetWriteRecord[]> {
  if (rows.length === 0) return []
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from(TABLE)
    .insert(
      rows.map((row) => ({
        draft_id: row.draftId,
        batch_id: row.batchId,
        status: row.status,
        code: row.code,
        row_id: row.rowId,
        sheet_row: row.sheetRow,
        ledger_month: row.month,
        cells: row.cells,
        actor: row.actor,
        error: clampError(row.error),
      })),
    )
    .select("*")

  if (error) fail("기록", error)
  revalidateTag(BRANCH_SALES_LEDGER_SHEET_WRITES_CACHE_TAG, "max")
  return ((data ?? []) as SheetWriteRow[]).map(toRecord)
}

export async function updateSheetWriteAttempt(
  id: string,
  patch: {
    status?: SheetWriteStatus
    code?: string
    writtenAt?: string | null
    entryId?: string | null
    error?: string | null
  },
): Promise<void> {
  const update: Record<string, unknown> = {}
  if (patch.status !== undefined) update.status = patch.status
  if (patch.code !== undefined) update.code = patch.code
  if (patch.writtenAt !== undefined) update.written_at = patch.writtenAt
  if (patch.entryId !== undefined) update.entry_id = patch.entryId
  if (patch.error !== undefined) update.error = clampError(patch.error)
  if (Object.keys(update).length === 0) return

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.from(TABLE).update(update).eq("id", id)
  if (error) fail("갱신", error)
  revalidateTag(BRANCH_SALES_LEDGER_SHEET_WRITES_CACHE_TAG, "max")
}

/** 초안마다 가장 최근 시도 하나. */
export async function latestSheetWritesByDraftIds(draftIds: string[]): Promise<Map<string, SheetWriteRecord>> {
  const unique = [...new Set(draftIds.filter((id) => typeof id === "string" && id.trim()))]
  const latest = new Map<string, SheetWriteRecord>()
  if (unique.length === 0) return latest

  const supabase = createSupabaseAdminClient()
  for (let start = 0; start < unique.length; start += DRAFT_ID_CHUNK) {
    const chunk = unique.slice(start, start + DRAFT_ID_CHUNK)
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .in("draft_id", chunk)
      .order("created_at", { ascending: false })
      .limit(chunk.length * 20)
    if (error) fail("조회", error)
    for (const row of (data ?? []) as SheetWriteRow[]) {
      if (!latest.has(row.draft_id)) latest.set(row.draft_id, toRecord(row))
    }
  }
  return latest
}

/** 마지막으로 성공한 REV 동기화(source all|rev)의 시작 시각. 없으면 null. */
export async function lastSuccessfulRevSyncStartedAt(): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sync_runs")
    .select("started_at")
    .eq("status", "success")
    .in("source", ["all", "rev"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`[branch-sales-ledger-sheet-writes] 동기화 기록 조회 실패: ${error.message}`)
  const startedAt = (data as { started_at?: unknown } | null)?.started_at
  return typeof startedAt === "string" ? startedAt : null
}

/** 반영된 초안의 장부 항목 id(감사 행 entry_id 채우기용). 못 찾으면 null — 실패는 호출부가 무시한다. */
export async function findLedgerEntryIdByDraftId(draftId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sales_ledger_entries")
    .select("id")
    .eq("draft_id", draftId)
    .maybeSingle()
  if (error) throw new Error(`[branch-sales-ledger-sheet-writes] 장부 항목 조회 실패: ${error.message}`)
  const id = (data as { id?: unknown } | null)?.id
  return typeof id === "string" ? id : null
}
