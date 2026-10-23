import "server-only"

import { isMissingTableMessage } from "@/lib/db/schema-contract"
import {
  DISTRIBUTOR_FULFILLMENT_MODES,
  DISTRIBUTOR_SETTLEMENT_STATUSES,
  DISTRIBUTOR_SETTLEMENT_TRIGGERS,
  deriveSettlementStatus,
  normalizeDistributorLines,
  normalizeDistributorPriceRules,
  type DistributorEmailStatus,
  type DistributorIssueReason,
  type DistributorPriceRule,
  type DistributorPriceTemplate,
  type DistributorSettlementInput,
  type DistributorSettlementPayment,
  type DistributorSettlementRecord,
  type DistributorSettlementTotals,
} from "@/lib/distributor-settlements"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// 총판 정산 저장소(2026-10-23) — distributor_settlements · distributor_settlement_payments · distributor_price_templates.
//
//  - 전부 service role 경로다(세 표 모두 RLS deny-all). 인증·역할은 API 라우트가 강제한다.
//  - 미적용 폴백(마이그레이션 런북 관례): 읽기 = available:false + 안내, 쓰기 = DistributorSettlementsNotReadyError(라우트 503).
//  - 미적용이 아닌 읽기 오류는 빈 결과로 삼키지 않고 던진다.

const SETTLEMENTS = "distributor_settlements"
const PAYMENTS = "distributor_settlement_payments"
const TEMPLATES = "distributor_price_templates"

const SETTLEMENT_COLUMNS = [
  "id", "quote_document_id", "deal_id", "fulfillment_mode", "source_version_id", "issued_version_id", "distributor_name",
  "distributor_contact_name", "distributor_email", "distributor_phone", "issue_trigger", "auto_email",
  "price_template_id", "lines", "vat_included", "subtotal_amount", "vat_amount", "total_amount",
  "customer_total_amount", "status", "paid_amount", "due_date", "issued_at", "issue_reason", "share_token",
  "email_status", "emailed_at", "email_error", "review_required_reason", "notes", "cancelled_at",
  "installed_at", "created_at", "updated_at",
].join(", ")
const PAYMENT_COLUMNS = "id, settlement_id, amount, paid_on, memo, created_by, created_at"
const TEMPLATE_COLUMNS = "id, name, rules, notes, updated_at"

export const DISTRIBUTOR_SETTLEMENTS_NOT_READY_MESSAGE =
  "총판 정산 표가 아직 적용되지 않았습니다. supabase/migrations/20261023_distributor_settlements.sql 적용이 필요합니다."

export class DistributorSettlementsNotReadyError extends Error {
  constructor() {
    super(DISTRIBUTOR_SETTLEMENTS_NOT_READY_MESSAGE)
    this.name = "DistributorSettlementsNotReadyError"
  }
}

interface PostgrestErrorLike {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isDistributorTableMissing(error: PostgrestErrorLike | null | undefined) {
  if (!error) return false
  const text = [error.code, error.message, error.details, error.hint].filter(Boolean).join(" ")
  const lower = text.toLowerCase()
  if (lower.includes("42p01") || lower.includes("pgrst205")) return true
  return isMissingTableMessage(text) && lower.includes("distributor_")
}

function throwDbError(error: PostgrestErrorLike, fallback: string): never {
  if (isDistributorTableMissing(error)) throw new DistributorSettlementsNotReadyError()
  throw new Error(error.message ?? fallback)
}

/* ─── 행 변환 ────────────────────────────────────────────── */

interface SettlementRow {
  id: string
  quote_document_id: string
  deal_id: string | null
  fulfillment_mode: string | null
  source_version_id: string | null
  issued_version_id: string | null
  distributor_name: string
  distributor_contact_name: string | null
  distributor_email: string | null
  distributor_phone: string | null
  issue_trigger: string
  auto_email: boolean | null
  price_template_id: string | null
  lines: unknown
  vat_included: boolean | null
  subtotal_amount: number | string | null
  vat_amount: number | string | null
  total_amount: number | string | null
  customer_total_amount: number | string | null
  status: string
  paid_amount: number | string | null
  due_date: string | null
  issued_at: string | null
  issue_reason: string | null
  share_token: string | null
  email_status: string | null
  emailed_at: string | null
  email_error: string | null
  review_required_reason: string | null
  notes: string | null
  cancelled_at: string | null
  installed_at: string | null
  created_at: string
  updated_at: string
}

// NUMERIC 은 PostgREST 에서 문자열로 올 수 있다.
function toNumber(value: number | string | null | undefined) {
  const parsed = typeof value === "string" ? Number(value) : value
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0
}

const ISSUE_REASONS = new Set<DistributorIssueReason>(["customer_accepted", "installation_completed", "manual"])
const EMAIL_STATUSES = new Set<DistributorEmailStatus>(["not_sent", "sent", "failed", "skipped"])

export function toDistributorSettlementRecord(row: SettlementRow): DistributorSettlementRecord {
  return {
    id: row.id,
    quoteDocumentId: row.quote_document_id,
    dealId: row.deal_id,
    fulfillmentMode: DISTRIBUTOR_FULFILLMENT_MODES.find((value) => value === row.fulfillment_mode) ?? "C",
    sourceVersionId: row.source_version_id,
    issuedVersionId: row.issued_version_id,
    distributorName: row.distributor_name,
    distributorContactName: row.distributor_contact_name,
    distributorEmail: row.distributor_email,
    distributorPhone: row.distributor_phone,
    issueTrigger: DISTRIBUTOR_SETTLEMENT_TRIGGERS.find((value) => value === row.issue_trigger) ?? "manual",
    autoEmail: row.auto_email !== false,
    priceTemplateId: row.price_template_id,
    lines: normalizeDistributorLines(row.lines) ?? [],
    vatIncluded: row.vat_included !== false,
    subtotalAmount: toNumber(row.subtotal_amount),
    vatAmount: toNumber(row.vat_amount),
    totalAmount: toNumber(row.total_amount),
    customerTotalAmount: toNumber(row.customer_total_amount),
    status: DISTRIBUTOR_SETTLEMENT_STATUSES.find((value) => value === row.status) ?? "draft",
    paidAmount: toNumber(row.paid_amount),
    dueDate: row.due_date,
    issuedAt: row.issued_at,
    issueReason: ISSUE_REASONS.has(row.issue_reason as DistributorIssueReason)
      ? (row.issue_reason as DistributorIssueReason)
      : null,
    shareToken: row.share_token,
    emailStatus: EMAIL_STATUSES.has(row.email_status as DistributorEmailStatus)
      ? (row.email_status as DistributorEmailStatus)
      : "not_sent",
    emailedAt: row.emailed_at,
    emailError: row.email_error,
    reviewRequiredReason: row.review_required_reason,
    notes: row.notes,
    cancelledAt: row.cancelled_at,
    installedAt: row.installed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface PaymentRow {
  id: string
  settlement_id: string
  amount: number | string
  paid_on: string
  memo: string | null
  created_by: string | null
  created_at: string
}

function toPayment(row: PaymentRow): DistributorSettlementPayment {
  return {
    id: row.id,
    settlementId: row.settlement_id,
    amount: toNumber(row.amount),
    paidOn: row.paid_on,
    memo: row.memo,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

interface TemplateRow {
  id: string
  name: string
  rules: unknown
  notes: string | null
  updated_at: string
}

function toTemplate(row: TemplateRow): DistributorPriceTemplate {
  return {
    id: row.id,
    name: row.name,
    rules: normalizeDistributorPriceRules(row.rules) ?? [],
    notes: row.notes,
    updatedAt: row.updated_at,
  }
}

/* ─── 정산 ───────────────────────────────────────────────── */

export type DistributorRead<T> =
  | { available: true; warning: null; value: T }
  | { available: false; warning: string; value: null }

export async function getDistributorSettlementByQuote(
  quoteDocumentId: string
): Promise<DistributorRead<DistributorSettlementRecord | null>> {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .select(SETTLEMENT_COLUMNS)
    .eq("quote_document_id", quoteDocumentId)
    .maybeSingle()
  if (error) {
    if (isDistributorTableMissing(error)) {
      return { available: false, warning: DISTRIBUTOR_SETTLEMENTS_NOT_READY_MESSAGE, value: null }
    }
    throw new Error(error.message ?? "총판 정산을 불러오지 못했습니다.")
  }
  return {
    available: true,
    warning: null,
    value: data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null,
  }
}

export async function getDistributorSettlementByToken(token: string): Promise<DistributorSettlementRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .select(SETTLEMENT_COLUMNS)
    .eq("share_token", token)
    .maybeSingle()
  if (error) {
    if (isDistributorTableMissing(error)) return null
    throw new Error(error.message ?? "총판 견적서를 불러오지 못했습니다.")
  }
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/** 견적별 총판 정산 저장(발행 전 건만 고친다). 발행된 건이면 null. */
export async function saveDistributorSettlementDraft(params: {
  quoteDocumentId: string
  dealId: string | null
  sourceVersionId: string | null
  customerTotalAmount: number
  input: DistributorSettlementInput
  totals: DistributorSettlementTotals
  actor: string
}): Promise<DistributorSettlementRecord | null> {
  const supabase = createSupabaseAdminClient()
  const columns = {
    deal_id: params.dealId,
    fulfillment_mode: params.input.fulfillmentMode,
    source_version_id: params.sourceVersionId,
    distributor_name: params.input.distributorName,
    distributor_contact_name: params.input.distributorContactName,
    distributor_email: params.input.distributorEmail,
    distributor_phone: params.input.distributorPhone,
    issue_trigger: params.input.issueTrigger,
    auto_email: params.input.autoEmail,
    price_template_id: params.input.priceTemplateId,
    lines: params.input.lines,
    vat_included: params.input.vatIncluded,
    subtotal_amount: params.totals.subtotalAmount,
    vat_amount: params.totals.vatAmount,
    total_amount: params.totals.totalAmount,
    customer_total_amount: params.customerTotalAmount,
    due_date: params.input.dueDate,
    notes: params.input.notes,
    // 사람이 금액을 다시 저장했으면 자동 발행 보류 사유는 해소된 것으로 본다.
    review_required_reason: null,
    updated_by: params.actor,
  }

  const existing = await getDistributorSettlementByQuote(params.quoteDocumentId)
  if (!existing.available) throw new DistributorSettlementsNotReadyError()

  if (!existing.value) {
    const { data, error } = await supabase
      .from(SETTLEMENTS)
      .insert({ ...columns, quote_document_id: params.quoteDocumentId, status: "draft", created_by: params.actor })
      .select(SETTLEMENT_COLUMNS)
      .single()
    if (error) throwDbError(error, "총판 정산을 저장하지 못했습니다.")
    return toDistributorSettlementRecord(data as unknown as SettlementRow)
  }

  // 취소된 건은 다시 저장하면 발행 전 상태로 되살린다(공유 토큰은 이미 지워져 있다).
  if (existing.value.status !== "draft" && existing.value.status !== "cancelled") return null
  const { data, error } = await supabase
    .from(SETTLEMENTS)
    .update({ ...columns, status: "draft", cancelled_at: null })
    .eq("id", existing.value.id)
    .in("status", ["draft", "cancelled"])
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "총판 정산을 저장하지 못했습니다.")
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/**
 * 발행 전 → 발행. 조건부 UPDATE(status=draft)라 동시 발행(고객 동의 + 사람 클릭)이 겹쳐도 한 번만 성공한다.
 * 이미 발행돼 있으면 null.
 */
export async function markDistributorSettlementIssued(params: {
  id: string
  issuedVersionId: string
  reason: DistributorIssueReason
  shareToken: string
  totals: DistributorSettlementTotals
  customerTotalAmount: number
  actor: string
}): Promise<DistributorSettlementRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      issue_reason: params.reason,
      issued_version_id: params.issuedVersionId,
      share_token: params.shareToken,
      subtotal_amount: params.totals.subtotalAmount,
      vat_amount: params.totals.vatAmount,
      total_amount: params.totals.totalAmount,
      customer_total_amount: params.customerTotalAmount,
      paid_amount: 0,
      review_required_reason: null,
      updated_by: params.actor,
    })
    .eq("id", params.id)
    .eq("status", "draft")
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "총판 견적서를 발행하지 못했습니다.")
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/**
 * H방식 설치 완료 — 발행 전(draft) → completed. 이 시각이 매출 인식 시점이다.
 * 조건부 UPDATE 라 두 번 눌러도 한 번만 성공한다(이미 완료면 null).
 */
export async function markDistributorSettlementInstalled(params: {
  id: string
  customerTotalAmount: number
  actor: string
}): Promise<DistributorSettlementRecord | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({
      status: "completed",
      installed_at: new Date().toISOString(),
      issue_reason: "installation_completed",
      customer_total_amount: params.customerTotalAmount,
      review_required_reason: null,
      updated_by: params.actor,
    })
    .eq("id", params.id)
    .eq("fulfillment_mode", "H")
    .eq("status", "draft")
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "설치 완료를 기록하지 못했습니다.")
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/** 자동 발행을 보류한 이유를 남긴다(발행 전 건만). */
export async function flagDistributorSettlementReview(id: string, reason: string) {
  const { error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({ review_required_reason: reason.slice(0, 300), updated_by: "system" })
    .eq("id", id)
    .eq("status", "draft")
  if (error) throwDbError(error, "총판 정산 상태를 기록하지 못했습니다.")
}

export async function recordDistributorEmailResult(
  id: string,
  result: { status: DistributorEmailStatus; error?: string | null }
) {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({
      email_status: result.status,
      emailed_at: result.status === "sent" ? new Date().toISOString() : null,
      email_error: result.error?.slice(0, 300) ?? null,
    })
    .eq("id", id)
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "총판 이메일 발송 결과를 기록하지 못했습니다.")
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/** 취소 — 공유 토큰을 지워 총판 링크를 막는다. 입금이 있는 건은 취소하지 않는다(null). */
export async function cancelDistributorSettlement(id: string, actor: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      share_token: null,
      issued_at: null,
      issue_reason: null,
      updated_by: actor,
    })
    .eq("id", id)
    .in("status", ["draft", "issued"])
    .eq("paid_amount", 0)
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "총판 정산을 취소하지 못했습니다.")
  return data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : null
}

/* ─── 입금 ───────────────────────────────────────────────── */

export async function listDistributorPayments(settlementId: string): Promise<DistributorSettlementPayment[]> {
  const { data, error } = await createSupabaseAdminClient()
    .from(PAYMENTS)
    .select(PAYMENT_COLUMNS)
    .eq("settlement_id", settlementId)
    .order("paid_on", { ascending: true })
    .order("created_at", { ascending: true })
  if (error) throwDbError(error, "총판 입금 기록을 불러오지 못했습니다.")
  return ((data ?? []) as PaymentRow[]).map(toPayment)
}

/** 입금 합계로 paid_amount·status 를 다시 쓴다. 입금 추가·삭제 뒤에 부른다. */
async function syncSettlementPaidAmount(settlement: DistributorSettlementRecord, actor: string) {
  const payments = await listDistributorPayments(settlement.id)
  const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const status = deriveSettlementStatus({ status: settlement.status, totalAmount: settlement.totalAmount, paidAmount })
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .update({ paid_amount: paidAmount, status, updated_by: actor })
    .eq("id", settlement.id)
    .in("status", ["issued", "partial", "paid"])
    .select(SETTLEMENT_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "총판 미수금을 갱신하지 못했습니다.")
  return {
    settlement: data ? toDistributorSettlementRecord(data as unknown as SettlementRow) : settlement,
    payments,
  }
}

export async function addDistributorPayment(params: {
  settlement: DistributorSettlementRecord
  amount: number
  paidOn: string
  memo: string | null
  actor: string
}) {
  const { data, error } = await createSupabaseAdminClient()
    .from(PAYMENTS)
    .insert({
      settlement_id: params.settlement.id,
      amount: params.amount,
      paid_on: params.paidOn,
      memo: params.memo,
      created_by: params.actor,
    })
    .select(PAYMENT_COLUMNS)
    .single()
  if (error) throwDbError(error, "총판 입금을 기록하지 못했습니다.")
  const synced = await syncSettlementPaidAmount(params.settlement, params.actor)
  return { ...synced, payment: toPayment(data as PaymentRow) }
}

export async function deleteDistributorPayment(params: {
  settlement: DistributorSettlementRecord
  paymentId: string
  actor: string
}) {
  const { data, error } = await createSupabaseAdminClient()
    .from(PAYMENTS)
    .delete()
    .eq("id", params.paymentId)
    .eq("settlement_id", params.settlement.id)
    .select("id")
  if (error) throwDbError(error, "총판 입금 기록을 지우지 못했습니다.")
  if (!data || data.length === 0) return null
  return syncSettlementPaidAmount(params.settlement, params.actor)
}

/* ─── 미수금 목록 ────────────────────────────────────────── */

export interface DistributorReceivableRow extends DistributorSettlementRecord {
  quoteNumber: string | null
  customerName: string | null
  dealTitle: string | null
}

interface ReceivableJoinRow extends SettlementRow {
  quote_documents?: {
    quote_number?: string | null
    deals?: { title?: string | null; customers?: { name?: string | null } | null } | null
  } | null
}

/** 발행된 정산(미수·완납). includePaid=false 면 아직 다 받지 못한 건만. */
export async function listDistributorReceivables(
  options: { includePaid?: boolean } = {}
): Promise<DistributorRead<DistributorReceivableRow[]>> {
  const statuses = options.includePaid ? ["issued", "partial", "paid"] : ["issued", "partial"]
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .select(`${SETTLEMENT_COLUMNS}, quote_documents(quote_number, deals(title, customers(name)))`)
    .in("status", statuses)
    .order("issued_at", { ascending: false })
    .limit(500)
  if (error) {
    if (isDistributorTableMissing(error)) {
      return { available: false, warning: DISTRIBUTOR_SETTLEMENTS_NOT_READY_MESSAGE, value: null }
    }
    throw new Error(error.message ?? "총판 미수금을 불러오지 못했습니다.")
  }
  const rows = (data ?? []) as unknown as ReceivableJoinRow[]
  return {
    available: true,
    warning: null,
    value: rows.map((row) => ({
      ...toDistributorSettlementRecord(row),
      quoteNumber: row.quote_documents?.quote_number ?? null,
      customerName: row.quote_documents?.deals?.customers?.name ?? null,
      dealTitle: row.quote_documents?.deals?.title ?? null,
    })),
  }
}

/** 새 정산의 총판 기본값 — 가장 최근에 저장한 총판 정보(총판은 사실상 한 곳이다). */
export async function getLatestDistributorContact(): Promise<
  Pick<DistributorSettlementRecord, "distributorName" | "distributorContactName" | "distributorEmail" | "distributorPhone"> | null
> {
  const { data, error } = await createSupabaseAdminClient()
    .from(SETTLEMENTS)
    .select("distributor_name, distributor_contact_name, distributor_email, distributor_phone")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    if (isDistributorTableMissing(error)) return null
    throw new Error(error.message ?? "총판 기본 정보를 불러오지 못했습니다.")
  }
  if (!data) return null
  const row = data as Pick<SettlementRow, "distributor_name" | "distributor_contact_name" | "distributor_email" | "distributor_phone">
  return {
    distributorName: row.distributor_name,
    distributorContactName: row.distributor_contact_name,
    distributorEmail: row.distributor_email,
    distributorPhone: row.distributor_phone,
  }
}

/* ─── 단가 템플릿 ────────────────────────────────────────── */

export async function listDistributorPriceTemplates(): Promise<DistributorRead<DistributorPriceTemplate[]>> {
  const { data, error } = await createSupabaseAdminClient()
    .from(TEMPLATES)
    .select(TEMPLATE_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200)
  if (error) {
    if (isDistributorTableMissing(error)) {
      return { available: false, warning: DISTRIBUTOR_SETTLEMENTS_NOT_READY_MESSAGE, value: null }
    }
    throw new Error(error.message ?? "원가 템플릿을 불러오지 못했습니다.")
  }
  return { available: true, warning: null, value: ((data ?? []) as TemplateRow[]).map(toTemplate) }
}

export async function createDistributorPriceTemplate(
  input: { name: string; rules: DistributorPriceRule[]; notes: string | null },
  actor: string
) {
  const { data, error } = await createSupabaseAdminClient()
    .from(TEMPLATES)
    .insert({ ...input, created_by: actor, updated_by: actor })
    .select(TEMPLATE_COLUMNS)
    .single()
  if (error) throwDbError(error, "원가 템플릿을 저장하지 못했습니다.")
  return toTemplate(data as TemplateRow)
}

export async function updateDistributorPriceTemplate(
  id: string,
  input: { name: string; rules: DistributorPriceRule[]; notes: string | null },
  actor: string
) {
  const { data, error } = await createSupabaseAdminClient()
    .from(TEMPLATES)
    .update({ ...input, updated_by: actor })
    .eq("id", id)
    .is("archived_at", null)
    .select(TEMPLATE_COLUMNS)
    .maybeSingle()
  if (error) throwDbError(error, "원가 템플릿을 저장하지 못했습니다.")
  return data ? toTemplate(data as TemplateRow) : null
}

export async function archiveDistributorPriceTemplate(id: string, actor: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from(TEMPLATES)
    .update({ archived_at: new Date().toISOString(), updated_by: actor })
    .eq("id", id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle()
  if (error) throwDbError(error, "원가 템플릿을 보관하지 못했습니다.")
  return Boolean(data)
}
