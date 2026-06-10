import { NextRequest, NextResponse } from "next/server"

import {
  isErrorResponse,
  requirePortalContext,
} from "@/lib/portal/portal-context"
import { authorizeForAccount } from "@/lib/portal/portal-authorize"
import {
  PUBLIC_QUOTE_REVIEW_ACTION,
  ensureQuoteInteractionLog,
  summarizeQuoteInteractions,
} from "@/lib/portal/repositories/activity"
import { getDeal } from "@/lib/portal/repositories/deals"
import {
  getQuoteDocument,
  getResolvableQuoteVersion,
} from "@/lib/portal/repositories/quote-documents"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req)
  if (isErrorResponse(result)) return result
  const ctx = result
  const { id } = await params

  try {
    const document = await getQuoteDocument(id)
    if (!document) {
      return NextResponse.json({ error: "견적서 없음" }, { status: 404 })
    }

    const deal = await getDeal(document.deal_id)
    if (!deal) {
      return NextResponse.json({ error: "딜 없음" }, { status: 404 })
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, deal.partner_account_id)
      if (forbidden) return forbidden
    }

    const version = await getResolvableQuoteVersion(document)
    if (!version) {
      return NextResponse.json({ error: "확인할 견적 버전이 없습니다." }, { status: 404 })
    }

    const existing = await summarizeQuoteInteractions({
      quote_document_id: document.id,
      version_id: version.id,
    })

    if (existing.reviewConfirmedAt) {
      return NextResponse.json({ confirmedAt: existing.reviewConfirmedAt })
    }

    const log = await ensureQuoteInteractionLog({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      actor_user_id: ctx.userId ?? null,
      actor_role: ctx.type,
      action_type: PUBLIC_QUOTE_REVIEW_ACTION,
      target_type: "quote_document",
      target_id: document.id,
      summary: `견적서 ${document.quote_number} 내부 확인`,
      before_json: null,
      after_json: {
        quote_number: document.quote_number,
        version_id: version.id,
        actor_context: ctx.type,
      },
      dedupeByVersion: version.id,
      dedupeWindowMinutes: 24 * 60,
    })

    return NextResponse.json({ confirmedAt: log.created_at })
  } catch (error) {
    console.error("[portal/quotes/[id]/confirm] POST error:", error)
    return NextResponse.json({ error: "견적 확인 기록 저장 실패" }, { status: 500 })
  }
}
