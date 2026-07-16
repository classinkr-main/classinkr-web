import { NextRequest, NextResponse } from "next/server"

import {
  PUBLIC_QUOTE_REVIEW_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import { getPublicQuoteByToken } from "@/lib/portal/repositories/quote-documents"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // CSRF 방어: cross-site 자동 제출 폼이 고객 확인 기록을 생성하지 못하도록 차단.
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: "token 필수" }, { status: 400 })
  }

  // 수신자 바인딩: 공유 레코드에 수신자 이메일 컬럼이 없으므로 거래 고객
  // 이메일을 진위 확인용으로 사용한다. 본문 recipientEmail 이 고객 이메일과
  // 대소문자 무시 일치해야 상태를 기록한다.
  let recipientEmail: string | null = null
  try {
    const body = (await req.json()) as { recipientEmail?: unknown } | null
    if (body && typeof body.recipientEmail === "string") {
      recipientEmail = body.recipientEmail
    }
  } catch {
    recipientEmail = null
  }

  try {
    const result = await getPublicQuoteByToken(token)
    if (result.status === "not_found") {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })
    }
    if (result.status === "expired") {
      return NextResponse.json({ error: "만료된 견적서입니다." }, { status: 410 })
    }

    const { document, version, share, customer_email } = result

    const expectedEmail = customer_email?.trim().toLowerCase() ?? null
    const providedEmail = recipientEmail?.trim().toLowerCase() ?? null
    if (!expectedEmail || !providedEmail || expectedEmail !== providedEmail) {
      return NextResponse.json(
        { error: "수신자 확인에 실패했습니다." },
        { status: 403 }
      )
    }

    const deal = await getDeal(document.deal_id)
    if (!deal) {
      return NextResponse.json({ error: "거래 정보를 찾을 수 없습니다." }, { status: 404 })
    }

    const existing = await summarizeQuoteInteractions({
      quote_document_id: document.id,
      version_id: version.id,
      share_id: share.id,
      token,
    })

    if (existing.reviewConfirmedAt) {
      return NextResponse.json({ confirmedAt: existing.reviewConfirmedAt })
    }

    const { log } = await ensureQuoteInteractionLog({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: document.deal_id,
      actor_user_id: null,
      actor_role: "public",
      action_type: PUBLIC_QUOTE_REVIEW_ACTION,
      target_type: "quote_document",
      target_id: document.id,
      summary: `견적서 ${document.quote_number} 고객 확인`,
      before_json: null,
      after_json: {
        quote_number: document.quote_number,
        version_id: version.id,
        share_id: share.id,
        token,
      },
      dedupeByVersion: version.id,
      dedupeByShare: share.id,
      dedupeByToken: token,
      dedupeWindowMinutes: 24 * 60,
    })

    return NextResponse.json({ confirmedAt: log.created_at })
  } catch (error) {
    console.error("[share/quote/[token]/confirm] POST error:", error)
    return NextResponse.json({ error: "견적 확인 기록 저장 실패" }, { status: 500 })
  }
}
