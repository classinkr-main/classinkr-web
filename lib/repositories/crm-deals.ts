import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type {
  CrmDeal,
  CrmDealInsert,
  CrmDealStage,
  CrmDealStatus,
  CrmDealUpdate,
  CrmTaskTargetType,
} from "@/lib/supabase/database.types"

export type { CrmDealStage, CrmDealStatus }

export const CRM_DEAL_TARGET_TYPES = ["lead", "neo_account", "customer", "deal", "unknown"] as const
export const CRM_DEAL_STAGES = ["consult", "demo", "quote", "decision", "order", "won", "lost"] as const
export const CRM_DEAL_STATUSES = ["open", "won", "lost"] as const

const NOT_READY_MESSAGE = "CRM deal DB 마이그레이션이 아직 적용되지 않았습니다."

// 단계 → 상태 파생. won/lost는 종료 상태, 그 외는 open.
export function statusForStage(stage: CrmDealStage): CrmDealStatus {
  if (stage === "won") return "won"
  if (stage === "lost") return "lost"
  return "open"
}

export interface CrmDealRecord {
  id: string
  targetType: CrmTaskTargetType
  targetId: string | null
  targetLabel: string | null
  ownerKey: string | null
  ownerNameSnapshot: string | null
  title: string
  stage: CrmDealStage
  status: CrmDealStatus
  expectedAmount: number | null
  expectedCloseAt: string | null
  nextTaskId: string | null
  quoteRef: string | null
  orderRef: string | null
  riskNote: string | null
  createdBy: string | null
  closedAt: string | null
  closedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface CrmDealCreateInput {
  targetType?: CrmTaskTargetType
  targetId?: string | null
  targetLabel?: string | null
  ownerKey?: string | null
  ownerNameSnapshot?: string | null
  title?: string | null
  stage?: CrmDealStage
  expectedAmount?: number | null
  expectedCloseAt?: string | null
  quoteRef?: string | null
  orderRef?: string | null
  riskNote?: string | null
  createdBy?: string | null
}

export interface ListCrmDealsOptions {
  status?: CrmDealStatus | "all"
  ownerKeys?: string[]
  stage?: CrmDealStage | "all"
  targetType?: CrmTaskTargetType | "all"
  targetId?: string
  limit?: number
  offset?: number
}

export interface ListCrmDealsResult {
  generatedAt: string
  health: { ok: boolean; message: string | null }
  summary: {
    total: number
    returned: number
    open: number
    won: number
    lost: number
    openAmount: number
    noNextActionCount: number
    /**
     * open/won/lost/openAmount는 이번 페이지(rows)만 센 값이다. total은 DB 전체 건수라
     * 둘이 섞이면 "딜 25건"인데 금액은 20건 합계인 상태가 화면에 그대로 나간다.
     * 이 플래그가 true면 집계가 전체를 덮지 못한다는 뜻이므로 화면에 그 사실을 밝힌다.
     */
    aggregateTruncated: boolean
  }
  pagination: { limit: number; offset: number; returned: number; total: number; hasMore: boolean; nextOffset: number | null }
  rows: CrmDealRecord[]
}

function trimOrNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function nullableIso(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function nullableAmount(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

function isMissingCrmDealsTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("crm_deals") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

export function isCrmDealsNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("CRM deal DB 마이그레이션")
}

function emptyDealsResult(limit: number, offset: number, message: string | null): ListCrmDealsResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: !message, message },
    summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false },
    pagination: { limit, offset, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

// listCrmDeals가 select에 나열할 컬럼 목록. toCrmDealRecord가 매핑하는 컬럼과 1:1로 유지한다.
const CRM_DEAL_COLUMNS =
  "id, target_type, target_id, target_label, owner_key, owner_name_snapshot, title, stage, status, expected_amount, expected_close_at, next_task_id, quote_ref, order_ref, risk_note, created_by, closed_at, closed_by, created_at, updated_at"

export function toCrmDealRecord(row: CrmDeal): CrmDealRecord {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    ownerKey: row.owner_key,
    ownerNameSnapshot: row.owner_name_snapshot,
    title: row.title,
    stage: row.stage,
    status: row.status,
    expectedAmount: row.expected_amount,
    expectedCloseAt: row.expected_close_at,
    nextTaskId: row.next_task_id,
    quoteRef: row.quote_ref,
    orderRef: row.order_ref,
    riskNote: row.risk_note,
    createdBy: row.created_by,
    closedAt: row.closed_at,
    closedBy: row.closed_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function buildCrmDealInsert(input: CrmDealCreateInput): CrmDealInsert {
  const stage = oneOf(input.stage, CRM_DEAL_STAGES, "consult")
  return {
    target_type: oneOf(input.targetType, CRM_DEAL_TARGET_TYPES, "unknown"),
    target_id: trimOrNull(input.targetId),
    target_label: trimOrNull(input.targetLabel),
    owner_key: trimOrNull(input.ownerKey),
    owner_name_snapshot: trimOrNull(input.ownerNameSnapshot),
    title: trimOrNull(input.title) ?? "제목 없는 딜",
    stage,
    status: statusForStage(stage),
    expected_amount: nullableAmount(input.expectedAmount),
    expected_close_at: nullableIso(input.expectedCloseAt),
    next_task_id: null,
    quote_ref: trimOrNull(input.quoteRef),
    order_ref: trimOrNull(input.orderRef),
    risk_note: trimOrNull(input.riskNote),
    created_by: trimOrNull(input.createdBy),
    closed_at: null,
    closed_by: null,
  }
}

function summarize(rows: CrmDealRecord[], total: number) {
  return {
    total,
    returned: rows.length,
    open: rows.filter((row) => row.status === "open").length,
    won: rows.filter((row) => row.status === "won").length,
    lost: rows.filter((row) => row.status === "lost").length,
    openAmount: rows
      .filter((row) => row.status === "open")
      .reduce((sum, row) => sum + (row.expectedAmount ?? 0), 0),
    noNextActionCount: rows.filter((row) => row.status === "open" && !row.nextTaskId).length,
    aggregateTruncated: rows.length < total,
  }
}

export async function listCrmDeals(options: ListCrmDealsOptions = {}): Promise<ListCrmDealsResult> {
  const limit = clampInteger(options.limit, 50, 1, 200)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("crm_deals")
    .select(CRM_DEAL_COLUMNS, { count: "exact" })
    .order("expected_close_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (options.status && options.status !== "all") query = query.eq("status", options.status)
  if (options.stage && options.stage !== "all") query = query.eq("stage", options.stage)
  if (options.ownerKeys && options.ownerKeys.length > 0) query = query.in("owner_key", options.ownerKeys)
  if (options.targetType && options.targetType !== "all") query = query.eq("target_type", options.targetType)
  if (options.targetId) query = query.eq("target_id", options.targetId)

  const { data, error, count } = await query
  if (error) {
    if (isMissingCrmDealsTableError(error)) return emptyDealsResult(limit, offset, NOT_READY_MESSAGE)
    throw new Error(`[crm-deals] 조회 실패: ${error.message}`)
  }

  const rows = ((data ?? []) as CrmDeal[]).map(toCrmDealRecord)
  const returned = rows.length
  const total = count ?? returned
  const nextOffset = offset + returned

  return {
    generatedAt: new Date().toISOString(),
    health: { ok: true, message: null },
    summary: summarize(rows, total),
    pagination: { limit, offset, returned, total, hasMore: nextOffset < total, nextOffset: nextOffset < total ? nextOffset : null },
    rows,
  }
}

export async function createCrmDeal(input: CrmDealCreateInput): Promise<CrmDealRecord> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_deals").insert(buildCrmDealInsert(input)).select("*").single()
  if (error) {
    if (isMissingCrmDealsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-deals] 저장 실패: ${error.message}`)
  }
  return toCrmDealRecord(data as CrmDeal)
}

async function applyDealUpdate(id: string, patch: CrmDealUpdate): Promise<CrmDealRecord | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_deals").update(patch).eq("id", id).select("*").maybeSingle()
  if (error) {
    if (isMissingCrmDealsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-deals] 수정 실패: ${error.message}`)
  }
  return data ? toCrmDealRecord(data as CrmDeal) : null
}

export interface CrmDealEditInput {
  title?: string | null
  expectedAmount?: number | null
  expectedCloseAt?: string | null
  quoteRef?: string | null
  orderRef?: string | null
  riskNote?: string | null
  nextTaskId?: string | null
}

export function buildCrmDealEditPatch(input: CrmDealEditInput): CrmDealUpdate {
  const patch: CrmDealUpdate = {}
  if (input.title !== undefined) patch.title = trimOrNull(input.title) ?? "제목 없는 딜"
  if (input.expectedAmount !== undefined) patch.expected_amount = nullableAmount(input.expectedAmount)
  if (input.expectedCloseAt !== undefined) patch.expected_close_at = nullableIso(input.expectedCloseAt)
  if (input.quoteRef !== undefined) patch.quote_ref = trimOrNull(input.quoteRef)
  if (input.orderRef !== undefined) patch.order_ref = trimOrNull(input.orderRef)
  if (input.riskNote !== undefined) patch.risk_note = trimOrNull(input.riskNote)
  if (input.nextTaskId !== undefined) patch.next_task_id = trimOrNull(input.nextTaskId)
  return patch
}

export function updateCrmDeal(id: string, input: CrmDealEditInput) {
  return applyDealUpdate(id, buildCrmDealEditPatch(input))
}

export function setCrmDealStage(
  id: string,
  stage: CrmDealStage,
  options: { closedBy?: string | null; now?: Date } = {}
) {
  const now = options.now ?? new Date()
  const status = statusForStage(stage)
  const patch: CrmDealUpdate = { stage, status }
  if (status === "open") {
    patch.closed_at = null
    patch.closed_by = null
  } else {
    patch.closed_at = now.toISOString()
    patch.closed_by = trimOrNull(options.closedBy)
  }
  return applyDealUpdate(id, patch)
}

export async function deleteCrmDeal(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.from("crm_deals").delete().eq("id", id).select("id").maybeSingle()
  if (error) {
    if (isMissingCrmDealsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[crm-deals] 삭제 실패: ${error.message}`)
  }
  return Boolean(data)
}
