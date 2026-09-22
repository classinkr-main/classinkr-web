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

// 웨이브7(I1) — new-row 이중 제출 방어 창(더블클릭/더블탭). new-row는 forecast-add 누적처럼
// 같은 딜·월에 여러 건이 정당하게 공존할 수 있어 하드 유니크 제약을 걸 수 없다 — 대신 짧은
// 시간창 내 완전히 동일한 입력을 멱등 반환으로 흡수한다.
const NEW_ROW_DEDUPE_WINDOW_MS = 60_000

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
  /**
   * 라운드4(P0-2) — 매트릭스 셀 저장 시 "자가 체크"로 바로 만들려면 "checked"를 넘긴다.
   * 생략하면 기존과 동일하게 "draft"로 저장된다(하위호환).
   */
  status?: "draft" | "checked"
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

export interface BranchSalesLedgerDraftCreateResult {
  draft: BranchSalesLedgerDraft
  /**
   * true면 새로 INSERT하지 않고, 직전 60초 내 생성된 동일(kind=new-row, customer, month, amount)
   * 열린(draft|checked) 초안을 그대로 반환했다는 뜻이다(웨이브7 I1 — 더블클릭/더블탭 이중 제출 방어).
   */
  dedupedRecent: boolean
}

export type UpdateBranchSalesLedgerDraftResult =
  | { outcome: "updated"; draft: BranchSalesLedgerDraft }
  | { outcome: "not-found" }
  /** 낙관적 잠금(웨이브7 I4) 충돌 — expectedUpdatedAt이 DB의 실제 updated_at과 달랐다. */
  | { outcome: "conflict"; draft: BranchSalesLedgerDraft }
  /**
   * 라운드4(P0-2) — 내용 변경과 함께 status:"checked"를 다시 보냈는데, 현재 이미 checked인
   * 행을 "본인이 아닌 다른 사람"이 체크해 둔 상태였다. 다른 사람의 체크를 조용히 무효화하지
   * 않기 위해 아무것도 수정하지 않고 현재 행을 그대로 돌려준다.
   */
  | { outcome: "checked-by-other"; draft: BranchSalesLedgerDraft }

export interface UpdateBranchSalesLedgerDraftOptions {
  /**
   * 지정하면 DB의 현재 updated_at과 일치할 때만 수정을 반영한다(compare-and-swap). 불일치 시
   * outcome:"conflict"로 현재 행을 함께 반환해 클라가 최신 내용을 다시 확인할 수 있게 한다.
   * 생략하면 기존 동작(무조건 덮어쓰기)과 동일 — 하위호환.
   */
  expectedUpdatedAt?: string
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

// 웨이브7(I5) — checked/applied 전이 시 amount>0 CHECK(20260718) 위반. POST/PATCH가 amount<=0을
// 이미 400으로 막지만, "amount는 그대로 두고 status만 checked로 바꾸는" PATCH(체크 완료 액션)는
// amount 필드를 건드리지 않아 이 검증을 안 거친다 — 그 경로에서 DB가 막을 때 500 대신 400으로
// 번역해준다(예: 계약 서명 자동 제안 0원 플레이스홀더를 검수자가 금액 채우기 전에 체크 완료 시도).
const NON_POSITIVE_AMOUNT_CHECK = "branch_sales_ledger_drafts_amount_positive_check"
const NON_POSITIVE_AMOUNT_MESSAGE =
  "금액이 0 이하인 초안은 체크 완료할 수 없습니다. 금액을 입력한 뒤 다시 시도하세요."

function isNonPositiveAmountCheckError(error: { code?: string; message?: string; details?: string }) {
  const haystack = [error.code, error.message, error.details].filter(Boolean).join(" ").toLowerCase()
  return error.code === "23514" && haystack.includes(NON_POSITIVE_AMOUNT_CHECK)
}

// P2-9 — "적용된 값을 한 번에 바꾸기"(supersede_branch_sales_ledger_entry RPC, 20260922) 에러
// 번역. 기존 isMissingLedgerInfrastructureError와 같은 판정 어휘(PGRST202/42883/"could not
// find"/"does not exist"/"schema cache")를 재사용하되, 이 RPC 이름으로 스코프한다 — 오탐 없이
// "이 RPC가 아직 배포 안 됐다"만 잡아야 fail-closed(폴백 없이 기능만 꺼짐) 판정이 정확하다.
const SUPERSEDE_UNAVAILABLE_MESSAGE =
  "운영 DB에 '적용값 한 번에 바꾸기' 마이그레이션이 아직 적용되지 않았습니다 — 체크 큐에서 되돌리기 후 새 값을 적용하세요."

function isSupersedeUnavailableError(error: { code?: string; message?: string; details?: string; hint?: string }) {
  const haystack = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return (
    haystack.includes("42883") ||
    haystack.includes("pgrst202") ||
    (haystack.includes("supersede_branch_sales_ledger_entry") &&
      (haystack.includes("does not exist") || haystack.includes("could not find") || haystack.includes("schema cache")))
  )
}

// 마이그레이션의 1)/2) — 옛 entry 또는 새 초안이 없으면 둘 다 P0002. 어느 쪽이 없었는지는
// 라우트/훅 입장에서 둘 다 404로 수렴하므로(옛 entry·새 초안 모두 "대체 대상") 메시지도
// 하나로 합친다.
const SUPERSEDE_NOT_FOUND_MESSAGE = "대체 대상을 찾을 수 없습니다 — 기존 적용 항목 또는 새 초안이 존재하지 않습니다."

function isSupersedeNotFoundError(error: { code?: string }) {
  return error.code === "P0002"
}

// 마이그레이션의 4) — 새 초안이 checked가 아니면(멱등 분기 제외) P0001 + "must be checked".
const SUPERSEDE_NOT_CHECKED_MESSAGE = "새 값 초안이 체크 상태가 아닙니다."

function isSupersedeNotCheckedError(error: { code?: string; message?: string; details?: string }) {
  const haystack = [error.code, error.message, error.details].filter(Boolean).join(" ").toLowerCase()
  return error.code === "P0001" && haystack.includes("must be checked")
}

// 마이그레이션의 5) — 대상 일치 검증(kind/entry_type·ledger_month·source_deal_id·customer_name)
// 4종 중 하나라도 불일치하면 P0001 + "target mismatch".
const SUPERSEDE_TARGET_MISMATCH_MESSAGE = "대체 대상이 새 값 초안과 다른 딜·월입니다."

function isSupersedeTargetMismatchError(error: { code?: string; message?: string; details?: string }) {
  const haystack = [error.code, error.message, error.details].filter(Boolean).join(" ").toLowerCase()
  return error.code === "P0001" && haystack.includes("target mismatch")
}

export function isBranchSalesLedgerDraftsNotReadyError(error: unknown): error is Error {
  return error instanceof Error && error.message.includes("매출 장부")
}

export function isBranchSalesLedgerDuplicateActiveCorrectionError(error: unknown): error is Error {
  return error instanceof Error && error.message === DUPLICATE_ACTIVE_CORRECTION_MESSAGE
}

export function isBranchSalesLedgerNonPositiveAmountError(error: unknown): error is Error {
  return error instanceof Error && error.message === NON_POSITIVE_AMOUNT_MESSAGE
}

export function isBranchSalesLedgerSupersedeUnavailableError(error: unknown): error is Error {
  return error instanceof Error && error.message === SUPERSEDE_UNAVAILABLE_MESSAGE
}

export function isBranchSalesLedgerSupersedeNotFoundError(error: unknown): error is Error {
  return error instanceof Error && error.message === SUPERSEDE_NOT_FOUND_MESSAGE
}

export function isBranchSalesLedgerSupersedeNotCheckedError(error: unknown): error is Error {
  return error instanceof Error && error.message === SUPERSEDE_NOT_CHECKED_MESSAGE
}

export function isBranchSalesLedgerSupersedeTargetMismatchError(error: unknown): error is Error {
  return error instanceof Error && error.message === SUPERSEDE_TARGET_MISMATCH_MESSAGE
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
  const status: BranchSalesLedgerDraftStatus = input.status ?? "draft"
  const insert: Record<string, unknown> = {
    kind: input.kind,
    status,
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

  // 라운드4(P0-2) — 매트릭스 자가 체크: 생성 시점에 바로 checked로 올리는 입력이면 체크
  // 필드도 함께 기록한다(buildUpdate의 checked 전이와 같은 필드 — checked_by/checked_at).
  // "자가 체크" 배지는 created_by === checked_by로 파생하므로 새 컬럼이 필요 없다.
  // INSERT에는 checked 행 잠금 트리거(prevent_branch_sales_ledger_applied_draft_mutation,
  // 20260630)가 걸리지 않는다 — 그 트리거는 UPDATE/DELETE에서 OLD 행을 참조해 판단하므로
  // INSERT는 애초에 대상이 아니다. checked/applied 전이에 amount>0을 강제하는 CHECK
  // 제약(20260718)도 POST/배치 파서가 amount<=0을 이미 400으로 거부한 뒤에만 이 함수에
  // 도달하므로 충돌하지 않는다.
  if (status === "checked") {
    insert.checked_by = actor
    insert.checked_at = new Date().toISOString()
  }

  return insert
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

/**
 * new-row 이중 제출 방어(웨이브7 I1): 완전히 동일한 (kind=new-row, customer_name, ledger_month,
 * amount)를 갖고 아직 열려 있는(draft|checked) 초안이 직전 NEW_ROW_DEDUPE_WINDOW_MS 내에
 * 생성됐으면 그 행을 반환한다. edit-row는 호출하지 않는다(정정은 딜·월당 1건이 자연스러운
 * 다른 방어선 — 적용 시 유일성 인덱스 — 을 이미 갖고 있어 이 창 기반 방어가 필요 없다).
 */
async function findRecentOpenNewRowDraft(params: {
  customerName: string
  month: string
  amount: number
}): Promise<BranchSalesLedgerDraftRow | null> {
  const supabase = createSupabaseAdminClient()
  const since = new Date(Date.now() - NEW_ROW_DEDUPE_WINDOW_MS).toISOString()

  const { data, error } = await supabase
    .from("branch_sales_ledger_drafts")
    .select("*")
    .eq("kind", "new-row")
    .eq("customer_name", params.customerName)
    .eq("ledger_month", params.month)
    .eq("amount", params.amount)
    .in("status", ["draft", "checked"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 중복 확인 실패: ${error.message}`)
  }

  return (data as BranchSalesLedgerDraftRow | null) ?? null
}

export async function fetchBranchSalesLedgerDraftById(id: string): Promise<BranchSalesLedgerDraft | null> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("branch_sales_ledger_drafts")
    .select("*")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 조회 실패: ${error.message}`)
  }

  return data ? toDraft(data as BranchSalesLedgerDraftRow) : null
}

export async function createBranchSalesLedgerDraft(
  input: BranchSalesLedgerDraftCreateInput,
  actor: string,
): Promise<BranchSalesLedgerDraftCreateResult> {
  const supabase = createSupabaseAdminClient()

  if (input.kind === "new-row") {
    const normalizedCustomer = compactString(input.customer) ?? "고객명 미입력"
    const normalizedAmount = amountOrZero(input.amount)
    const existing = await findRecentOpenNewRowDraft({
      customerName: normalizedCustomer,
      month: input.month,
      amount: normalizedAmount,
    })
    if (existing) {
      return { draft: toDraft(existing), dedupedRecent: true }
    }
  }

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
  return { draft: toDraft(data as BranchSalesLedgerDraftRow), dedupedRecent: false }
}

/**
 * updateBranchSalesLedgerDraft의 실제 단일 UPDATE 실행부(낙관적 잠금 포함) — 자가 체크 재편집
 * 분기(아래 updateBranchSalesLedgerDraft 본문)와 "draft 상태에서 바로 checked로" 가는 기존
 * 경로가 모두 이 함수로 수렴한다.
 *
 * 낙관적 잠금(웨이브7 I4): options.expectedUpdatedAt이 주어지면 compare-and-swap으로 수정한다
 * (.eq("updated_at", expectedUpdatedAt)를 update 필터에 추가) — DB의 실제 updated_at과 다르면
 * 이 UPDATE는 0행에 매치되고, 원인이 "낙관적 잠금 충돌"인지 "찾을 수 없음/적용됨"인지 구분하기
 * 위해 현재 행을 다시 읽어 반환한다. expectedUpdatedAt을 생략하면 기존 무조건 덮어쓰기 동작과
 * 동일(하위호환) — draft 상태에서만 의미 있다(checked 이후는 트리거가 내용 변경 자체를 막는다).
 */
async function performUpdate(
  id: string,
  input: BranchSalesLedgerDraftUpdateInput,
  actor: string,
  options: UpdateBranchSalesLedgerDraftOptions,
): Promise<UpdateBranchSalesLedgerDraftResult> {
  const supabase = createSupabaseAdminClient()
  let query = supabase
    .from("branch_sales_ledger_drafts")
    .update(buildUpdate(input, actor))
    .eq("id", id)
    .neq("status", "applied")

  if (options.expectedUpdatedAt) {
    query = query.eq("updated_at", options.expectedUpdatedAt)
  }

  const { data, error } = await query.select("*").maybeSingle()

  if (error) {
    if (isMissingDraftsTableError(error)) throw new Error(NOT_READY_MESSAGE)
    if (isNonPositiveAmountCheckError(error)) throw new Error(NON_POSITIVE_AMOUNT_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 수정 실패: ${error.message}`)
  }

  if (data) {
    revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
    return { outcome: "updated", draft: toDraft(data as BranchSalesLedgerDraftRow) }
  }

  // 0행 매치 — expectedUpdatedAt이 있었다면 "낙관적 잠금 충돌"일 수 있으니 현재 행을 다시 읽어
  // 구분한다. id가 아예 없거나 status가 applied(불변 잠금)라서 애초에 update 필터에 안 걸린
  // 경우는 기존 404 동작을 그대로 보존한다(applied 잠금 케이스도 지금까지 "Draft not found"로
  // 응답해왔다) — updated_at만 어긋나 실패한 진짜 충돌일 때만 409로 승격한다.
  if (options.expectedUpdatedAt) {
    const current = await fetchBranchSalesLedgerDraftById(id)
    if (current && current.status !== "applied") {
      return { outcome: "conflict", draft: current }
    }
  }

  return { outcome: "not-found" }
}

/**
 * 라운드4(P0-2) — 매트릭스에서 자가 체크(checked)된 초안을 같은 셀에서 다시 고치면 클라는
 * {...내용, status:"checked"}로 PATCH한다. checked 행의 내용 변경은 DB 트리거
 * (prevent_branch_sales_ledger_applied_draft_mutation, 20260630)가 그대로 막으므로, 그럴 때만
 * 먼저 draft로 잠금을 해제한 뒤 본 UPDATE(내용 + checked 재전이)를 이어간다.
 *
 * status만 바꾸는 기존 토글 경로(체크 큐의 "체크 완료" 버튼 — 본문이 {status:"checked"}뿐인
 * PATCH)는 이 분기에 들어오면 안 된다: 그 경로는 애초에 현재 status가 draft이므로 트리거를
 * 그대로 통과하고, 잠금 해제 왕복을 태울 이유가 없다. 그래서 "input에 status 외의 키가
 * 하나라도 있을 때만" 이 분기에 진입한다.
 */
export async function updateBranchSalesLedgerDraft(
  id: string,
  input: BranchSalesLedgerDraftUpdateInput,
  actor: string,
  options: UpdateBranchSalesLedgerDraftOptions = {},
): Promise<UpdateBranchSalesLedgerDraftResult> {
  const hasContentChange = Object.keys(input).some((key) => key !== "status")

  if (input.status === "checked" && hasContentChange) {
    const current = await fetchBranchSalesLedgerDraftById(id)

    if (current && current.status === "checked") {
      // 다른 사람이 이미 체크해 둔 행이면 그 체크를 조용히 무효화하지 않는다 — 아무것도
      // 고치지 않고 현재 행을 그대로 돌려줘 클라가 "체크 큐에서 해제 후 수정" 흐름으로
      // 안내하게 한다. checkedBy가 비어 있으면(레거시 데이터 등) 본인 체크와 동일하게 취급.
      if (current.checkedBy && current.checkedBy !== actor) {
        return { outcome: "checked-by-other", draft: current }
      }

      const supabase = createSupabaseAdminClient()
      let unlockQuery = supabase
        .from("branch_sales_ledger_drafts")
        .update({ status: "draft", checked_by: null, checked_at: null, updated_by: actor })
        .eq("id", id)
        .eq("status", "checked")

      if (options.expectedUpdatedAt) {
        unlockQuery = unlockQuery.eq("updated_at", options.expectedUpdatedAt)
      }

      const { data: unlockedRow, error: unlockError } = await unlockQuery.select("*").maybeSingle()

      if (unlockError) {
        if (isMissingDraftsTableError(unlockError)) throw new Error(NOT_READY_MESSAGE)
        throw new Error(`[branch-sales-ledger-drafts] 체크 해제 실패: ${unlockError.message}`)
      }

      if (!unlockedRow) {
        // 방금 읽은 current가 checked였는데 이 UPDATE가 0행이면, 그 사이 다른 요청이 상태를
        // 바꿨다는 뜻이다(레이스) — 기존 낙관적 잠금 규약과 동일하게 판정한다.
        if (options.expectedUpdatedAt) {
          const currentAfterRace = await fetchBranchSalesLedgerDraftById(id)
          if (currentAfterRace && currentAfterRace.status !== "applied") {
            return { outcome: "conflict", draft: currentAfterRace }
          }
        }
        return { outcome: "not-found" }
      }

      // 잠금 해제 UPDATE 자체도 updated_at을 갱신시키므로(update_updated_at 트리거), 본
      // UPDATE의 CAS 기준은 클라가 보낸 원래 expectedUpdatedAt이 아니라 이 방금 갱신된 값이어야
      // 한다 — 옵션이 애초에 주어졌을 때만(무조건 덮어쓰기 요청이었다면 계속 무조건 덮어쓴다).
      const unlockedUpdatedAt = (unlockedRow as BranchSalesLedgerDraftRow).updated_at
      return performUpdate(
        id,
        input,
        actor,
        options.expectedUpdatedAt ? { expectedUpdatedAt: unlockedUpdatedAt } : {},
      )
    }
    // current가 없으면(존재하지 않는 id) 아래 기존 흐름으로 넘어가 결국 not-found로 수렴하고,
    // current.status가 draft(등 checked가 아닌 상태)면 트리거가 어차피 통과시키므로 기존 단일
    // UPDATE 흐름을 그대로 탄다.
  }

  return performUpdate(id, input, actor, options)
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

/**
 * P2-9 — "적용된 값을 한 번에 바꾸기": 옛 entry 반전 + 새 checked 초안 적용을
 * supersede_branch_sales_ledger_entry RPC 한 번(=DB 한 트랜잭션)으로 묶는다.
 *
 * fail-closed: RPC가 운영 DB에 없으면(isSupersedeUnavailableError) 여기서 절대
 * reverseBranchSalesLedgerEntryByDraftId → applyBranchSalesLedgerDraft를 순차 호출하지
 * 않는다 — 그 폴백은 이 함수가 없애려는 바로 그 "반전은 됐는데 재적용이 실패하는" 비원자
 * 실패 창을 되살린다. 대신 에러를 그대로 던져 호출부(라우트)가 503으로 번역하고, 사용자는
 * 기존 수동 경로(큐에서 되돌리기 → 새 값 적용)를 쓴다.
 */
export async function supersedeBranchSalesLedgerEntry(
  oldDraftId: string,
  newDraftId: string,
  actor: string,
  reason?: string | null,
): Promise<BranchSalesLedgerDraft | null> {
  const supabase = createSupabaseAdminClient()

  const rpcParams: Record<string, unknown> = {
    p_old_draft_id: oldDraftId,
    p_new_draft_id: newDraftId,
    p_actor: actor,
  }
  const trimmedReason = reason?.trim()
  if (trimmedReason) rpcParams.p_reason = trimmedReason

  const { data, error } = await supabase.rpc("supersede_branch_sales_ledger_entry", rpcParams)

  if (error) {
    if (isSupersedeUnavailableError(error)) throw new Error(SUPERSEDE_UNAVAILABLE_MESSAGE)
    if (isSupersedeNotFoundError(error)) throw new Error(SUPERSEDE_NOT_FOUND_MESSAGE)
    if (isSupersedeNotCheckedError(error)) throw new Error(SUPERSEDE_NOT_CHECKED_MESSAGE)
    if (isSupersedeTargetMismatchError(error)) throw new Error(SUPERSEDE_TARGET_MISMATCH_MESSAGE)
    if (isDuplicateActiveCorrectionIndexError(error)) throw new Error(DUPLICATE_ACTIVE_CORRECTION_MESSAGE)
    if (isMissingLedgerInfrastructureError(error)) throw new Error(INTERNAL_LEDGER_NOT_READY_MESSAGE)
    throw new Error(`[branch-sales-ledger-drafts] 대체 실패: ${error.message}`)
  }

  // apply/reverse와 동일 관례 — 두 캐시 태그 모두 무효화한다(entries가 반전+새로 적용된
  // entry 양쪽으로 바뀌었고, drafts도 새 초안이 applied로 바뀌었다).
  revalidateTag(BRANCH_SALES_LEDGER_DRAFTS_CACHE_TAG, "max")
  revalidateTag(BRANCH_SALES_LEDGER_ENTRIES_CACHE_TAG, "max")

  const row = Array.isArray(data) ? data[0] : data
  return row ? toDraft(row as BranchSalesLedgerDraftRow) : null
}

// probeSupersedeAvailable 모듈 캐시 — 결과(true/false) 무관 60초 TTL. 마이그레이션을 막
// 적용한 뒤 1분 안에는 기능이 켜지고, 반대로 일시 오류로 얻은 false를 오래 들고 있지 않는다.
const SUPERSEDE_PROBE_TTL_MS = 60_000
let supersedeProbeCache: { checkedAt: number; available: boolean } | null = null

/**
 * supersede RPC가 운영 DB에 있는지 "호출 없이" 확인할 카탈로그 경로가 이 저장소에는 없다
 * (Management API 접근은 scripts/check-db-schema.ts의 npm run check:db 전용이고, 런타임
 * repository는 그 접근 권한/경로를 갖고 있지 않다) — 그래서 함수의 **프로브 전용 경로**를 부른다:
 * 두 id를 모두 NULL로 넘기면 마이그레이션 0단계가 아무것도 잠그거나 쓰지 않고 NULL을 돌려준다.
 * 존재하지 않는 UUID로 부르는 방식은 매번 P0002 예외를 DB ERROR 로그로 남겨(인스턴스마다 60초에
 * 한 번) 장애 대응 중 실제 실패로 오인될 수 있어 쓰지 않는다. 판별: 에러 없음 = 사용 가능,
 * 함수 부재 에러 = 사용 불가, 그 외 예기치 않은 에러도 전부 "사용 불가"로 보수적으로 판단한다
 * (쓰기 경로는 fail-closed — 켜져 있다고 잘못 판단하는 쪽이 더 위험하다).
 */
export async function probeSupersedeAvailable(): Promise<boolean> {
  const now = Date.now()
  if (supersedeProbeCache && now - supersedeProbeCache.checkedAt < SUPERSEDE_PROBE_TTL_MS) {
    return supersedeProbeCache.available
  }

  const supabase = createSupabaseAdminClient()
  const { error } = await supabase.rpc("supersede_branch_sales_ledger_entry", {
    p_old_draft_id: null,
    p_new_draft_id: null,
    p_actor: "schema-probe",
  })

  const available = !error
  supersedeProbeCache = { checkedAt: now, available }
  return available
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
