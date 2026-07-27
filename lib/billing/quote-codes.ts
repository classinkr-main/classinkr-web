import "server-only"

import { randomInt } from "crypto"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export type QuoteCodeKind = "business_recharge" | "subscription"

export interface SoftwareQuoteCode {
  id: string
  code: string
  kind: QuoteCodeKind
  organizationName: string | null
  buyerName: string | null
  buyerEmail: string | null
  partnerId: string | null
  /** business_recharge 충전 금액(KRW). 2026-07 CNY→KRW 전환 이후의 유일한 충전 금액 필드. */
  amountKrw: number | null
  amountUsd: number | null
  notes: string | null
  expiresAt: string | null
  redeemedAt: string | null
  redeemedOrderId: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface QuoteCodeRow {
  id: string
  code: string
  kind: QuoteCodeKind
  organization_name: string | null
  buyer_name: string | null
  buyer_email: string | null
  partner_id: string | null
  // amount_cny 는 역사 보존용 컬럼이라 여기서 읽지 않는다(20260727_software_quote_codes_amount_krw.sql).
  amount_krw: number | string | null
  amount_usd: number | string | null
  notes: string | null
  expires_at: string | null
  redeemed_at: string | null
  redeemed_order_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function numericToNumber(value: number | string | null) {
  if (value == null) return null
  if (typeof value === "number") return value
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function mapQuoteCode(row: QuoteCodeRow): SoftwareQuoteCode {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    organizationName: row.organization_name,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    partnerId: row.partner_id,
    amountKrw: numericToNumber(row.amount_krw),
    amountUsd: numericToNumber(row.amount_usd),
    notes: row.notes,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    redeemedOrderId: row.redeemed_order_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type QuoteCodeValidation =
  | {
      ok: true
      code: SoftwareQuoteCode
    }
  | {
      ok: false
      reason: "not_found" | "expired" | "redeemed" | "wrong_kind" | "invalid"
      message: string
    }

function normalizeCode(raw: string) {
  return raw.trim().toUpperCase()
}

export async function findQuoteCodeByCode(rawCode: string) {
  const code = normalizeCode(rawCode)
  if (!code) return null

  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_quote_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle()

  if (error) throw error
  return data ? mapQuoteCode(data as QuoteCodeRow) : null
}

export async function validateQuoteCode(
  rawCode: string,
  kind: QuoteCodeKind
): Promise<QuoteCodeValidation> {
  const code = normalizeCode(rawCode)
  if (!code) {
    return { ok: false, reason: "invalid", message: "코드를 입력해 주세요." }
  }

  const record = await findQuoteCodeByCode(code)
  if (!record) {
    return { ok: false, reason: "not_found", message: "등록되지 않은 코드입니다." }
  }

  if (record.kind !== kind) {
    return { ok: false, reason: "wrong_kind", message: "다른 결제 유형용 코드입니다." }
  }

  if (record.redeemedAt) {
    return { ok: false, reason: "redeemed", message: "이미 사용된 코드입니다." }
  }

  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "expired", message: "유효기간이 지난 코드입니다." }
  }

  return { ok: true, code: record }
}

/**
 * 1회용 코드를 사용 처리한다. `redeemed_at is null` 조건부 UPDATE 라서 다른 주문이 먼저
 * 사용했으면 0행이 갱신된다 — Supabase 는 그걸 오류로 주지 않으므로 select 로 영향 행을
 * 직접 확인해 던진다. 여기서 던져야 markSoftwareCheckoutOrderPaid 의 redemption 실패
 * 알림 경로를 타서 운영자가 "같은 코드가 두 결제에 쓰였다"는 레이스를 알 수 있다.
 */
export async function markQuoteCodeRedeemed(codeId: string, orderId: string) {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_quote_codes")
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_order_id: orderId,
    })
    .eq("id", codeId)
    .is("redeemed_at", null)
    .select("id")

  if (error) throw error

  if (!data || data.length === 0) {
    throw new Error(
      `Quote code ${codeId} was already redeemed by another order (0 rows updated for ${orderId}).`
    )
  }
}

// 사람이 직접 타이핑해 입력하는 코드이므로 혼동되기 쉬운 문자(I/1, O/0)를 제외한 32자 알파벳을 쓴다.
// 32 = 2^5 라서 randomInt(0, 32) 로 뽑아도 모듈로 편향이 없다. crypto.randomInt 는 CSPRNG 기반.
// 키스페이스: 32^8 ≈ 1.1조 조합 (구 포맷의 4자리 숫자 = 1만 조합 대비 브루트포스 사실상 불가능).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
const CODE_RANDOM_LENGTH = 8

function generateSecureCodeSuffix(length: number = CODE_RANDOM_LENGTH) {
  let suffix = ""
  for (let i = 0; i < length; i += 1) {
    suffix += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]
  }
  return suffix
}

export function generateQuoteCode(kind: QuoteCodeKind = "business_recharge") {
  const prefix = kind === "subscription" ? "QS" : "QB"
  const year = new Date().getFullYear()
  const random = generateSecureCodeSuffix()
  return `${prefix}-${year}-${random}`
}

export interface QuoteCodeCreateInput {
  kind: QuoteCodeKind
  /** business_recharge 전용 충전 금액(KRW). subscription 이면 null. */
  amountKrw: number | null
  amountUsd: number | null
  organizationName?: string | null
  buyerName?: string | null
  buyerEmail?: string | null
  notes?: string | null
  expiresAt?: string | null
  createdBy?: string | null
}

export async function listQuoteCodes(limit = 200): Promise<SoftwareQuoteCode[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_quote_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => mapQuoteCode(row as QuoteCodeRow))
}

async function generateUniqueCode(kind: QuoteCodeKind) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateQuoteCode(kind)
    const existing = await findQuoteCodeByCode(candidate)
    if (!existing) return candidate
  }
  // 극히 드문 연속 충돌(6회) 시에도 혼동 문자 없는 안전 알파벳으로 접미사를 더한다.
  return `${generateQuoteCode(kind)}-${generateSecureCodeSuffix(3)}`
}

export async function createQuoteCode(
  input: QuoteCodeCreateInput
): Promise<SoftwareQuoteCode> {
  const code = await generateUniqueCode(input.kind)
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from("software_quote_codes")
    .insert({
      code,
      kind: input.kind,
      amount_krw: input.amountKrw,
      amount_usd: input.amountUsd,
      organization_name: input.organizationName ?? null,
      buyer_name: input.buyerName ?? null,
      buyer_email: input.buyerEmail ?? null,
      notes: input.notes ?? null,
      expires_at: input.expiresAt ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single()
  if (error) throw error
  return mapQuoteCode(data as QuoteCodeRow)
}
