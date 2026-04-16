import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { validateRechargeAmount } from "@/lib/billing/recharge"
import {
  findQuoteCodeByCode,
  generateQuoteCode,
  type QuoteCodeKind,
} from "@/lib/billing/quote-codes"

function normalizeString(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function parseKind(value: unknown): QuoteCodeKind {
  if (value === "subscription") return "subscription"
  return "business_recharge"
}

function parseAmount(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

async function generateUniqueCode(kind: QuoteCodeKind) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = generateQuoteCode(kind)
    const existing = await findQuoteCodeByCode(candidate)
    if (!existing) return candidate
  }
  // 극단적 충돌. 현실에서는 거의 불가능.
  return `${generateQuoteCode(kind)}-${Date.now().toString(36).toUpperCase().slice(-3)}`
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("software_quote_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw error
    return NextResponse.json({ codes: data ?? [] })
  } catch (error) {
    console.error("[admin/software-quote-codes] GET error:", error)
    return NextResponse.json({ error: "코드 조회에 실패했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 })
    }

    const kind = parseKind(body.kind)
    const amountCny = kind === "business_recharge" ? parseAmount(body.amountCny) : null
    const amountUsd = kind === "subscription" ? parseAmount(body.amountUsd) : null

    if (kind === "business_recharge") {
      if (amountCny == null) {
        return NextResponse.json({ error: "충전 금액(CNY)을 입력해 주세요." }, { status: 400 })
      }
      const validation = validateRechargeAmount(amountCny)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 })
      }
    } else if (amountUsd == null) {
      return NextResponse.json({ error: "금액(USD)을 입력해 주세요." }, { status: 400 })
    }

    const expiresAtRaw = normalizeString(body.expiresAt)
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null
    const code = await generateUniqueCode(kind)

    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("software_quote_codes")
      .insert({
        code,
        kind,
        amount_cny: amountCny,
        amount_usd: amountUsd,
        organization_name: normalizeString(body.organizationName) || null,
        buyer_name: normalizeString(body.buyerName) || null,
        buyer_email: normalizeString(body.buyerEmail) || null,
        notes: normalizeString(body.notes) || null,
        expires_at: expiresAt,
        created_by: normalizeString(body.createdBy) || null,
      })
      .select("*")
      .single()
    if (error) throw error

    return NextResponse.json({ code: data }, { status: 201 })
  } catch (error) {
    console.error("[admin/software-quote-codes] POST error:", error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "코드 발급에 실패했습니다.",
      },
      { status: 500 }
    )
  }
}
