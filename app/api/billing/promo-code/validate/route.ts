import { NextRequest, NextResponse } from "next/server"

import { validatePromoCode, type PromoTargetProduct } from "@/lib/billing/promo-codes"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

function parseTarget(value: unknown): PromoTargetProduct {
  if (value === "subscription") return "subscription"
  if (value === "any") return "any"
  return "business_recharge"
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "billing-promo-code-validate", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      code?: string
      target?: string
      baseAmount?: number | string
      currency?: string
    } | null

    const code = typeof body?.code === "string" ? body.code : ""
    const target = parseTarget(body?.target)
    const normalizedCode = code.trim().toUpperCase()
    if (normalizedCode) {
      const codeLimit = checkRateLimit(normalizedCode, "billing-promo-code-value", {
        windowMs: 5 * 60_000,
        max: 25,
      })
      if (!codeLimit.allowed) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429 })
      }
    }
    const baseAmount =
      typeof body?.baseAmount === "number"
        ? body.baseAmount
        : Number.parseFloat(String(body?.baseAmount ?? ""))
    const currency = typeof body?.currency === "string" ? body.currency.toUpperCase() : "CNY"

    if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
      return NextResponse.json({
        ok: false,
        reason: "invalid",
        message: "먼저 결제 금액을 설정해 주세요.",
      })
    }

    const result = await validatePromoCode({ rawCode: code, target, baseAmount, currency })
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, message: result.message })
    }

    return NextResponse.json({
      ok: true,
      promo: {
        id: result.promo.id,
        code: result.promo.code,
        label: result.promo.label,
        discountType: result.promo.discountType,
        discountValue: result.promo.discountValue,
      },
      amountBefore: result.amountBefore,
      amountAfter: result.amountAfter,
      discountAmount: result.discountAmount,
      currency: result.currency,
    })
  } catch (error) {
    console.error("[billing/promo-code/validate] POST error:", error)
    return NextResponse.json({ error: "코드 검증에 실패했습니다." }, { status: 500 })
  }
}
