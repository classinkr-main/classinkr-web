import { NextRequest, NextResponse } from "next/server"

import {
  PUBLIC_QUOTE_REVIEW_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import { getPublicQuoteByToken } from "@/lib/portal/repositories/quote-documents"

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: "token 필수" }, { status: 400 })
  }

  try {
    const result = await getPublicQuoteByToken(token)
    if (result.status === "not_found") {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 })
    }
    if (result.status === "expired") {
      return NextResponse.json({ error: "만료된 견적서입니다." }, { status: 410 })
    }

    const { document, version, share } = result
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

    const log = await ensureQuoteInteractionLog({
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
