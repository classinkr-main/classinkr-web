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
import {
  createCrmTask,
  listActiveTasksForDealByType,
} from "@/lib/repositories/crm-tasks"
import type { QuoteDocument } from "@/lib/portal/types"
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

// 고객이 견적을 수락하면 CRM 액션 큐에 "계약 전환" 카드를 남긴다.
// - 필드는 서버가 조회한 문서/딜/고객 값만 사용한다(공개 라우트이므로 사용자 입력 금지).
// - 같은 deal + quote task가 이미 살아있으면 새로 만들지 않는다.
// - 실패해도 수락 응답을 막지 않도록 호출부에서 try/catch 한다.
async function materializeQuoteAcceptTask(input: {
  dealId: string
  document: Pick<QuoteDocument, "quote_number">
  customerName: string | null
}) {
  const existing = await listActiveTasksForDealByType(input.dealId, "quote")
  if (existing.length > 0) return

  const quoteNumber = input.document.quote_number
  const customerLabel = input.customerName?.trim() || null
  const title = customerLabel
    ? `${customerLabel} · 견적 ${quoteNumber} 수락 → 계약 전환`
    : `견적 ${quoteNumber} 수락 → 계약 전환`

  await createCrmTask({
    targetType: "deal",
    targetId: input.dealId,
    targetLabel: customerLabel,
    taskType: "quote",
    title,
    detail: "고객이 견적을 수락했습니다. 계약 전환을 진행하세요. (requested_action: convert_to_contract)",
    priority: "high",
    // 즉시 처리 대상: 마감을 지금으로 두어 큐 상단에 뜨게 한다.
    dueAt: new Date().toISOString(),
  })
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

    const { document, version, share, customer_email, customer_name } = result

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

    const { log, created } = await ensureQuoteInteractionLog({
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

    // 실제 새 수락 로그가 만들어졌을 때만(24h dedupe 통과) CRM 카드를 1건 남긴다.
    // task 생성 실패는 수락 응답을 막지 않는다.
    if (created) {
      try {
        await materializeQuoteAcceptTask({
          dealId: document.deal_id,
          document,
          customerName: customer_name,
        })
      } catch (taskError) {
        console.error(
          "[share/quote/[token]/accept] CRM task materialize skipped",
          taskError
        )
      }
    }

    await markDocumentAccepted(document.id, document.status)

    return NextResponse.json({ acceptedAt: log.created_at })
  } catch (error) {
    console.error("[share/quote/[token]/accept] POST error:", error)
    return NextResponse.json({ error: "견적 진행 요청 저장 실패" }, { status: 500 })
  }
}
