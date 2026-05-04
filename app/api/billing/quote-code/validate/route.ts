import { NextRequest, NextResponse } from "next/server"

import { validateQuoteCode, type QuoteCodeKind } from "@/lib/billing/quote-codes"
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit"

function parseKind(value: unknown): QuoteCodeKind {
  if (value === "subscription") return "subscription"
  return "business_recharge"
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed } = checkRateLimit(ip, "billing-quote-code-validate", {
    windowMs: 60_000,
    max: 20,
  })
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 })
  }

  try {
    const body = (await req.json().catch(() => null)) as {
      code?: string
      kind?: string
    } | null

    const code = typeof body?.code === "string" ? body.code : ""
    const kind = parseKind(body?.kind)
    const normalizedCode = code.trim().toUpperCase()

    if (normalizedCode) {
      const codeLimit = checkRateLimit(normalizedCode, "billing-quote-code-value", {
        windowMs: 5 * 60_000,
        max: 25,
      })
      if (!codeLimit.allowed) {
        return NextResponse.json({ error: "Too many requests." }, { status: 429 })
      }
    }

    const result = await validateQuoteCode(code, kind)
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason, message: result.message })
    }

    return NextResponse.json({
      ok: true,
      code: {
        id: result.code.id,
        code: result.code.code,
        kind: result.code.kind,
        amountCny: result.code.amountCny,
        amountUsd: result.code.amountUsd,
        organizationName: result.code.organizationName,
        expiresAt: result.code.expiresAt,
      },
    })
  } catch (error) {
    console.error("[billing/quote-code/validate] POST error:", error)
    return NextResponse.json({ error: "코드 검증에 실패했습니다." }, { status: 500 })
  }
}
