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
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

export function isBranchSalesLedgerDraftsNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("매출 장부")
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
    throw new Error(`[branch-sales-ledger-drafts] 적용 실패: ${error.message}`)
  }

  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  revalidateTag(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG, "max")

  const row = Array.isArray(data) ? data[0] : data
  return row ? toDraft(row as BranchSalesLedgerDraftRow) : null
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
