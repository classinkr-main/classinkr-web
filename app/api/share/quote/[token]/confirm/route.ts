import { NextRequest, NextResponse } from "next/server"

import {
  PUBLIC_QUOTE_REVIEW_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import { getPublicQuoteByToken } from "@/lib/portal/repositories/quote-documents"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

// 고객 확인은 담당자가 발송 후 잊고 있던 견적이 "읽혔는지"를 알려주는 첫 신호다.
// 알림 전송 실패가 확인 기록 저장 자체를 막으면 안 되므로 항상 흡수(catch)한다.
function notifyQuoteReviewConfirmed(input: {
  documentId: string
  quoteNumber: string
  dealTitle: string
  dealId: string
  customerName: string | null
  versionId: string
  versionNumber: number
  totalAmount: number
  shareId: string
  token: string
  recipientEmail: string | null
  recipientVerified: boolean
}) {
  emitNotificationEvent({
    eventType: "quote.review_confirmed",
    notificationType: "status_update",
    categoryTag: "lead",
    severity: "info",
    scopeTag: "org_admin",
    title: `견적서 ${input.quoteNumber} 고객 확인 완료`,
    message: [
      `${input.customerName?.trim() || "고객"}님이 견적서를 확인했습니다.`,
      `거래: ${input.dealTitle}`,
      `버전 v${input.versionNumber} · 합계 ${input.totalAmount.toLocaleString("ko-KR")}원`,
    ].join("\n"),
    routeUrl: `/admin/quotes/${input.documentId}/view`,
    source: "quote",
    sourceId: input.documentId,
    payload: {
      quoteNumber: input.quoteNumber,
      dealId: input.dealId,
      dealTitle: input.dealTitle,
      customerName: input.customerName,
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      shareId: input.shareId,
      token: input.token,
      recipientEmail: input.recipientEmail,
      recipientVerified: input.recipientVerified,
    },
    channels: ["wecom_webhook"],
  }).catch((notifyError) => {
    console.error("[share/quote/[token]/confirm] notification emit failed:", notifyError)
  })
}

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

    const { document, version, share, customer_email, customer_name } = result

    // 등록된 고객 이메일이 있을 때만 대조한다. CRM에 이메일이 없는 고객이 많아
    // 무조건 대조하면 응답 버튼이 영구히 403으로 죽는다. 이메일이 없으면
    // 링크 소지 자체를 1차 인증으로 보고, 검증 여부를 로그에 남긴다.
    const expectedEmail = customer_email?.trim().toLowerCase() || null
    const providedEmail = recipientEmail?.trim().toLowerCase() || null
    if (expectedEmail && expectedEmail !== providedEmail) {
      return NextResponse.json(
        { error: "견적서를 받으신 이메일과 등록된 고객 이메일이 일치하지 않습니다. 담당자에게 확인해 주세요." },
        { status: 403 }
      )
    }
    const recipientVerified = Boolean(expectedEmail && expectedEmail === providedEmail)

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
        recipient_email: providedEmail,
        recipient_verified: recipientVerified,
      },
      dedupeByVersion: version.id,
      dedupeByShare: share.id,
      dedupeByToken: token,
      dedupeWindowMinutes: 24 * 60,
    })

    notifyQuoteReviewConfirmed({
      documentId: document.id,
      quoteNumber: document.quote_number,
      dealTitle: deal.title,
      dealId: document.deal_id,
      customerName: customer_name,
      versionId: version.id,
      versionNumber: version.version_number,
      totalAmount: version.total_amount,
      shareId: share.id,
      token,
      recipientEmail: providedEmail,
      recipientVerified,
    })

    return NextResponse.json({ confirmedAt: log.created_at })
  } catch (error) {
    console.error("[share/quote/[token]/confirm] POST error:", error)
    return NextResponse.json({ error: "견적 확인 기록 저장 실패" }, { status: 500 })
  }
}
