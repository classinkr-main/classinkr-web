import { NextRequest, NextResponse } from "next/server"

import {
  PUBLIC_QUOTE_ACCEPT_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import {
  getPublicQuoteByToken,
  updateQuoteDocument,
} from "@/lib/portal/repositories/quote-documents"

async function markDocumentAccepted(documentId: string, currentStatus: string) {
  if (currentStatus === "accepted" || currentStatus === "archived" || currentStatus === "expired") {
    return
  }

  try {
    await updateQuoteDocument(documentId, { status: "accepted" })
  } catch (error) {
    console.warn("[share/quote/[token]/accept] status update skipped", error)
  }
}

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

    if (existing.acceptedAt) {
      await markDocumentAccepted(document.id, document.status)
      return NextResponse.json({ acceptedAt: existing.acceptedAt })
    }

    const log = await ensureQuoteInteractionLog({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: document.deal_id,
      actor_user_id: null,
      actor_role: "public",
      action_type: PUBLIC_QUOTE_ACCEPT_ACTION,
      target_type: "quote_document",
      target_id: document.id,
      summary: `견적서 ${document.quote_number} 고객 진행 요청`,
      before_json: {
        quote_status: document.status,
      },
      after_json: {
        quote_number: document.quote_number,
        version_id: version.id,
        share_id: share.id,
        token,
        requested_action: "convert_to_contract",
      },
      dedupeByVersion: version.id,
      dedupeByShare: share.id,
      dedupeByToken: token,
      dedupeWindowMinutes: 24 * 60,
    })

    await markDocumentAccepted(document.id, document.status)

    return NextResponse.json({ acceptedAt: log.created_at })
  } catch (error) {
    console.error("[share/quote/[token]/accept] POST error:", error)
    return NextResponse.json({ error: "견적 진행 요청 저장 실패" }, { status: 500 })
  }
}
