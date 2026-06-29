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
import { isCrossOriginRequest } from "@/lib/server/same-origin"

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
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // CSRF 방어: cross-site 자동 제출 폼이 고객 동의 상태를 변경하지 못하도록 차단.
  if (isCrossOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { token } = await params

  if (!token) {
    return NextResponse.json({ error: "token 필수" }, { status: 400 })
  }

  // 수신자 바인딩: 공유 레코드에는 별도 수신자 이메일 컬럼이 없으므로,
  // 거래 고객 이메일을 진위 확인용으로 사용한다. 호출자는 본문에
  // recipientEmail 을 보내야 하고, 고객 이메일과 대소문자 무시 일치해야 한다.
  // (링크만으로는 상태를 바꿀 수 없게 하는 가벼운 실 바인딩.)
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
