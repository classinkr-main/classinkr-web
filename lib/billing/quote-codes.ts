import "server-only"

import { randomBytes } from "crypto"

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
  amountCny: number | null
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
  amount_cny: number | string | null
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
    amountCny: numericToNumber(row.amount_cny),
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

export async function markQuoteCodeRedeemed(codeId: string, orderId: string) {
  const supabase = createSupabaseAdminClient()
  const { error } = await supabase
    .from("software_quote_codes")
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_order_id: orderId,
    })
    .eq("id", codeId)
    .is("redeemed_at", null)

  if (error) throw error
}

export function generateQuoteCode(kind: QuoteCodeKind = "business_recharge") {
  const prefix = kind === "subscription" ? "QS" : "QB"
  const year = new Date().getFullYear()
  const random = randomBytes(8)
    .toString("base64url")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10)
  return `${prefix}-${year}-${random}`
}

export interface QuoteCodeCreateInput {
  kind: QuoteCodeKind
  amountCny: number | null
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
  return `${generateQuoteCode(kind)}-${Date.now().toString(36).toUpperCase().slice(-3)}`
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
      amount_cny: input.amountCny,
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
