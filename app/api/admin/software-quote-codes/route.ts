import { NextRequest, NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { validateRechargeAmount } from "@/lib/billing/recharge"
import {
  createQuoteCode,
  listQuoteCodes,
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

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (authError) return authError

  try {
    const codes = await listQuoteCodes(200)
    return NextResponse.json({ codes })
  } catch (error) {
    console.error("[admin/software-quote-codes] GET error:", error)
    return NextResponse.json({ error: "코드 조회에 실패했습니다." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req, STAFF_ADMIN_API_ROLES)
  if (authError) return authError

  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) {
      return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 })
    }

    const kind = parseKind(body.kind)
    const amountKrw = kind === "business_recharge" ? parseAmount(body.amountKrw) : null
    const amountUsd = kind === "subscription" ? parseAmount(body.amountUsd) : null

    if (kind === "business_recharge") {
      if (amountKrw == null) {
        return NextResponse.json({ error: "충전 금액(KRW)을 입력해 주세요." }, { status: 400 })
      }
      const validation = validateRechargeAmount(amountKrw)
      if (!validation.ok) {
        return NextResponse.json({ error: validation.reason }, { status: 400 })
      }
    } else if (amountUsd == null) {
      return NextResponse.json({ error: "금액(USD)을 입력해 주세요." }, { status: 400 })
    }

    const expiresAtRaw = normalizeString(body.expiresAt)
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).toISOString() : null

    const code = await createQuoteCode({
      kind,
      amountKrw,
      amountUsd,
      organizationName: normalizeString(body.organizationName) || null,
      buyerName: normalizeString(body.buyerName) || null,
      buyerEmail: normalizeString(body.buyerEmail) || null,
      notes: normalizeString(body.notes) || null,
      expiresAt,
      createdBy: normalizeString(body.createdBy) || null,
    })

    return NextResponse.json({ code }, { status: 201 })
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
