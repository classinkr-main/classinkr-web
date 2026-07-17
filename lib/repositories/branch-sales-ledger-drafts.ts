import "server-only"

import { revalidateTag } from "next/cache"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG = "branch-sales-ledger-drafts"
export const BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG = "branch-sales-ledger-entries"

export const BRANCH_SALES_LEDGER_DRAFT_KINDS = ["new-row", "edit-row"] as const
export const BRANCH_SALES_LEDGER_DRAFT_STATUSES = ["draft", "checked", "applied", "cancelled"] as const
export const BRANCH_SALES_LEDGER_ENTRY_TYPES = ["manual-new", "manual-edit"] as const
export const BRANCH_SALES_LEDGER_ENTRY_STATUSES = ["active", "reversed"] as const

export type BranchSalesLedgerDraftKind = (typeof BRANCH_SALES_LEDGER_DRAFT_KINDS)[number]
export type BranchSalesLedgerDraftStatus = (typeof BRANCH_SALES_LEDGER_DRAFT_STATUSES)[number]
export type BranchSalesLedgerEntryType = (typeof BRANCH_SALES_LEDGER_ENTRY_TYPES)[number]
export type BranchSalesLedgerEntryStatus = (typeof BRANCH_SALES_LEDGER_ENTRY_STATUSES)[number]

const NOT_READY_MESSAGE = "매출 장부 입력 큐 DB 마이그레이션이 아직 적용되지 않았습니다."
const INTERNAL_LEDGER_NOT_READY_MESSAGE = "매출 장부 내부 원장 DB 마이그레이션이 아직 적용되지 않았습니다."

interface BranchSalesLedgerDraftRow {
  id: string
  kind: BranchSalesLedgerDraftKind
  status: BranchSalesLedgerDraftStatus
  source_deal_id: string | null
  source_sheet_row: number | null
  source_snapshot: Record<string, unknown> | null
  customer_name: string
  manager: string | null
  team: string | null
  ledger_month: string
  amount: number | string
  currency: string
  note: string | null
  created_by: string | null
  updated_by: string | null
  checked_by: string | null
  checked_at: string | null
  applied_by: string | null
  applied_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

interface BranchSalesLedgerEntryRow {
  id: string
  draft_id: string | null
  entry_type: BranchSalesLedgerEntryType
  entry_status: BranchSalesLedgerEntryStatus
  source_deal_id: string | null
  source_sheet_row: number | null
  source_snapshot: Record<string, unknown> | null
  customer_name: string
  manager: string | null
  team: string | null
  ledger_month: string
  amount: number | string
  currency: string
  note: string | null
  applied_by: string | null
  applied_at: string
  reversed_at: string | null
  reversed_by: string | null
  reversal_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface BranchSalesLedgerDraft {
  id: string
  kind: BranchSalesLedgerDraftKind
  status: BranchSalesLedgerDraftStatus
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency: string
  note: string
  createdBy: string | null
  updatedBy: string | null
  checkedBy: string | null
  checkedAt: string | null
  appliedBy: string | null
  appliedAt: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface BranchSalesLedgerEntry {
  id: string
  draftId?: string
  entryType: BranchSalesLedgerEntryType
  entryStatus: BranchSalesLedgerEntryStatus
  sourceDealId?: string
  sourceSheetRow: number | null
  sourceSnapshot: Record<string, unknown>
  customer: string
  manager: string
  team: string
  month: string
  amount: number
  currency: string
  note: string
  appliedBy: string | null
  appliedAt: string
  reversedAt: string | null
  reversedBy: string | null
  reversalReason: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface BranchSalesLedgerDraftCreateInput {
  kind: BranchSalesLedgerDraftKind
  sourceDealId?: string | null
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown> | null
  customer: string
  manager?: string | null
  team?: string | null
  month: string
  amount: number
  currency?: string | null
  note?: string | null
  metadata?: Record<string, unknown> | null
}

export interface BranchSalesLedgerDraftUpdateInput {
  kind?: BranchSalesLedgerDraftKind
  status?: BranchSalesLedgerDraftStatus
  sourceDealId?: string | null
  sourceSheetRow?: number | null
  sourceSnapshot?: Record<string, unknown> | null
  customer?: string
  manager?: string | null
  team?: string | null
  month?: string
  amount?: number
  currency?: string | null
  note?: string | null
  metadata?: Record<string, unknown> | null
}

export interface ListBranchSalesLedgerDraftsOptions {
  status?: BranchSalesLedgerDraftStatus | "all"
  limit?: number
}

export interface ListBranchSalesLedgerDraftsResult {
  generatedAt: string
  health: { ok: boolean; message: string | null }
  drafts: BranchSalesLedgerDraft[]
}

export interface ListBranchSalesLedgerEntriesOptions {
  status?: BranchSalesLedgerEntryStatus | "all"
  limit?: number
}

export interface ListBranchSalesLedgerEntriesResult {
  generatedAt: string
  health: { ok: boolean; message: string | null }
  entries: BranchSalesLedgerEntry[]
}

function compactString(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function amountOrZero(value: number | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.round(numeric) : 0
}

function nullableInteger(value: number | null | undefined) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.floor(numeric) : null
}

function isMissingDraftsTableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42p01") ||
    (haystack.includes("branch_sales_ledger_drafts") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

function isMissingLedgerInfrastructureError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    isMissingDraftsTableError(error) ||
    (haystack.includes("branch_sales_ledger_entries") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache"))) ||
    (haystack.includes("apply_branch_sales_ledger_draft") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache"))) ||
    (haystack.includes("reverse_branch_sales_ledger_entry") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

// 딜·월당 활성 정정(manual-edit) 유일성 인덱스(20260717) 위반 — apply 중 발생하면 postgres
// 23505. 회원가입류 "이미 존재" 충돌과 동일하게 409로 안내해야지, 500으로 흘리면 안 된다.
const DUPLICATE_ACTIVE_CORRECTION_INDEX = "branch_sales_ledger_entries_active_manual_edit_unique"
const DUPLICATE_ACTIVE_CORRECTION_MESSAGE =
  "이미 이 딜·월에 적용된 정정 항목이 있습니다. 기존 항목을 먼저 반전한 뒤 다시 적용하세요."

function isDuplicateActiveCorrectionIndexError(error: { code?: string; message?: string; details?: string }) {
  const haystack = [error.code, error.message, error.details].filter(Boolean).join(" ").toLowerCase()
  return error.code === "23505" && haystack.includes(DUPLICATE_ACTIVE_CORRECTION_INDEX)
}

export function isBranchSalesLedgerDraftsNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("매출 장부")
}

export function isBranchSalesLedgerDuplicateActiveCorrectionError(error: unknown): error is Error {
  return error instanceof Error && error.message === DUPLICATE_ACTIVE_CORRECTION_MESSAGE
}

function notReadyResult(): ListBranchSalesLedgerDraftsResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: false, message: NOT_READY_MESSAGE },
    drafts: [],
  }
}

function ledgerNotReadyResult(): ListBranchSalesLedgerEntriesResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: false, message: INTERNAL_LEDGER_NOT_READY_MESSAGE },
    entries: [],
  }
}

function toDraft(row: BranchSalesLedgerDraftRow): BranchSalesLedgerDraft {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    sourceDealId: row.source_deal_id ?? undefined,
    sourceSheetRow: row.source_sheet_row,
    sourceSnapshot: row.source_snapshot ?? {},
    customer: row.customer_name,
    manager: row.manager ?? "",
    team: row.team ?? "",
    month: row.ledger_month,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    note: row.note ?? "",
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    checkedBy: row.checked_by,
    checkedAt: row.checked_at,
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toEntry(row: BranchSalesLedgerEntryRow): BranchSalesLedgerEntry {
  return {
    id: row.id,
    draftId: row.draft_id ?? undefined,
    entryType: row.entry_type,
    entryStatus: row.entry_status,
    sourceDealId: row.source_deal_id ?? undefined,
    sourceSheetRow: row.source_sheet_row,
    sourceSnapshot: row.source_snapshot ?? {},
    customer: row.customer_name,
    manager: row.manager ?? "",
    team: row.team ?? "",
    month: row.ledger_month,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    note: row.note ?? "",
    appliedBy: row.applied_by,
    appliedAt: row.applied_at,
    reversedAt: row.reversed_at,
    reversedBy: row.reversed_by,
    reversalReason: row.reversal_reason,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function buildInsert(input: BranchSalesLedgerDraftCreateInput, actor: string) {
  return {
    kind: input.kind,
    status: "draft" satisfies BranchSalesLedgerDraftStatus,
    source_deal_id: compactString(input.sourceDealId),
    source_sheet_row: nullableInteger(input.sourceSheetRow),
    source_snapshot: input.sourceSnapshot ?? {},
    customer_name: compactString(input.customer) ?? "고객명 미입력",
    manager: compactString(input.manager),
    team: compactString(input.team),
    ledger_month: input.month,
    amount: amountOrZero(input.amount),
    currency: compactString(input.currency) ?? "CNY",
    note: compactString(input.note),
    metadata: input.metadata ?? {},
    created_by: actor,
    updated_by: actor,
  }
}

function buildUpdate(input: BranchSalesLedgerDraftUpdateInput, actor: string) {
  const patch: Record<string, unknown> = { updated_by: actor }

  if (input.kind) patch.kind = input.kind
  if (input.sourceDealId !== undefined) patch.source_deal_id = compactString(input.sourceDealId)
  if (input.sourceSheetRow !== undefined) patch.source_sheet_row = nullableInteger(input.sourceSheetRow)
  if (input.sourceSnapshot !== undefined) patch.source_snapshot = input.sourceSnapshot ?? {}
  if (input.customer !== undefined) patch.customer_name = compactString(input.customer) ?? "고객명 미입력"
  if (input.manager !== undefined) patch.manager = compactString(input.manager)
  if (input.team !== undefined) patch.team = compactString(input.team)
  if (input.month !== undefined) patch.ledger_month = input.month
  if (input.amount !== undefined) patch.amount = amountOrZero(input.amount)
  if (input.currency !== undefined) patch.currency = compactString(input.currency) ?? "CNY"
  if (input.note !== undefined) patch.note = compactString(input.note)
  if (input.metadata !== undefined) patch.metadata = input.metadata ?? {}

  if (input.status) {
    patch.status = input.status
    if (input.status === "checked") {
      patch.checked_by = actor
      patch.checked_at = new Date().toISOString()
    }
    if (input.status === "applied") {
      patch.applied_by = actor
      patch.applied_at = new Date().toISOString()
    }
    if (input.status === "draft") {
      patch.checked_by = null
      patch.checked_at = null
    }
  }

  return patch
}

export async function listBranchSalesLedgerDrafts(
  options: ListBranchSalesLedgerDraftsOptions = {},
): Promise<ListBranchSalesLedgerDraftsResult> {
  const limit = clampInteger(options.limit, 50, 1, 200)
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("branch_sales_ledger_drafts")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit)

  if (options.status && options.status !== "all") query = query.eq("status", options.status)

  const { data, error } = await query
  if (error) {
    if (isMissingDraftsTableError(error)) return notReadyResult()
    throw new Error(`[branch-sales-ledger-drafts] 조회 실패: ${error.message}`)
  }

  return {
    generatedAt: new Date().toISOString(),
    health: { ok: true, message: null },
    drafts: ((data ?? []) as BranchSalesLedgerDraftRow[]).map(toDraft),
  }
}

export async function listBranchSalesLedgerEntries(
  options: ListBranchSalesLedgerEntriesOptions = {},
): Promise<ListBranchSalesLedgerEntriesResult> {
  const limit = clampInteger(options.limit, 100, 1, 500)
  const supabase = createSupabaseAdminClient()

  let query = supabase
    .from("branch_sales_ledger_entries")
    .select("*")
    .order("applied_at", { ascending: false })
    .limit(limit)

  if (!options.status) query = query.eq("entry_status", "active")
  if (options.status && options.status !== "all") query = query.eq("entry_status", options.status)

  const { data, error } = await query
  if (error) {
    if (isMissingLedgerInfrastructureError(error)) return ledgerNotReadyResult()
    throw new Error(`[branch-sales-ledger-entries] 조회 실패: ${error.message}`)
  }

  return {
    generatedAt: new Date().toISOString(),
    health: { ok: true, message: null },
    entries: ((data ?? []) as BranchSalesLedgerEntryRow[]).map(toEntry),
  }
}

export async function createBranchSalesLedgerDraft(
  input: BranchSalesLedgerDraftCreateInput,
  actor: string,
): Promise<BranchSalesLedgerDraft> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sales_ledger_drafts")
    .insert(buildInsert(input, actor))
    .select("*")
    .single()

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 저장 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  return toDraft(data as BranchSalesLedgerDraftRow)
}

export async function updateBranchSalesLedgerDraft(
  id: string,
  input: BranchSalesLedgerDraftUpdateInput,
  actor: string,
): Promise<BranchSalesLedgerDraft | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sales_ledger_drafts")
    .update(buildUpdate(input, actor))
    .eq("id", id)
    .neq("status", "applied")
    .select("*")
    .maybeSingle()

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 수정 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  return data ? toDraft(data as BranchSalesLedgerDraftRow) : null
}

export async function applyBranchSalesLedgerDraft(
  id: string,
  actor: string,
): Promise<BranchSalesLedgerDraft | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase.rpc("apply_branch_sales_ledger_draft", {
    p_actor: actor,
    p_draft_id: id,
  })

  if (error) {
    if (isMissingLedgerInfrastructureError(error)) throw new Error(INTERNAL_LEDGER_NOT_READY_MESSAGE)
    if (isDuplicateActiveCorrectionIndexError(error)) throw new Error(DUPLICATE_ACTIVE_CORRECTION_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 적용 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  revalidateTag(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG, "max")

  const row = Array.isArray(data) ? data[0] : data
  return row ? toDraft(row as BranchSalesLedgerDraftRow) : null
}

/**
 * 적용된 초안(draft)에 연결된 내부 원장 entry를 상쇄(active -> reversed)한다.
 * draft.status는 절대 바꾸지 않는다 — "이 초안이 X일에 적용됐다"는 사실은 감사 추적으로
 * 반전 이후에도 보존돼야 한다(사용자 확정: 상쇄 방식). draft_id는 entries에서 UNIQUE라
 * 최대 한 건만 매칭된다. entry가 없으면(적용된 적 없는 초안 등) null.
 * reverse_branch_sales_ledger_entry RPC 자체가 멱등이라(이미 reversed면 no-op 반환)
 * 이 함수도 자연히 멱등이다.
 */
export async function reverseBranchSalesLedgerEntryByDraftId(
  draftId: string,
  actor: string,
  reason?: string | null,
): Promise<BranchSalesLedgerEntry | null> {
  const supabase = createSupabaseAdminClient()

  const { data: entryRow, error: lookupError } = await supabase
    .from("branch_sales_ledger_entries")
    .select("id")
    .eq("draft_id", draftId)
    .maybeSingle()

  if (lookupError) {
    if (isMissingLedgerInfrastructureError(lookupError)) throw new Error(INTERNAL_LEDGER_NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 반전 대상 조회 실패: ${lookupError.message}`)
  }
  if (!entryRow) return null

  const rpcParams: Record<string, unknown> = { p_entry_id: entryRow.id, p_actor: actor }
  const trimmedReason = reason?.trim()
  if (trimmedReason) rpcParams.p_reason = trimmedReason

  const { data, error } = await supabase.rpc("reverse_branch_sales_ledger_entry", rpcParams)

  if (error) {
    if (isMissingLedgerInfrastructureError(error)) throw new Error(INTERNAL_LEDGER_NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 반전 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  revalidateTag(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG, "max")

  const row = Array.isArray(data) ? data[0] : data
  return row ? toEntry(row as BranchSalesLedgerEntryRow) : null
}

export async function deleteBranchSalesLedgerDraft(id: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient()
  const { error, count } = await supabase
    .from("branch_sales_ledger_drafts")
    .delete({ count: "exact" })
    .eq("id", id)
    .neq("status", "applied")
    .neq("status", "checked")

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 삭제 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  return (count ?? 0) > 0
}
