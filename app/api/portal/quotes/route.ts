import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import { createQuoteDocument } from "@/lib/partner-portal/repositories/quote-documents";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function POST(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const body = await req.json();
    if (!body.deal_id) {
      return NextResponse.json({ error: "deal_id 필수" }, { status: 400 });
    }

    const deal = await getDeal(body.deal_id);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const quoteDoc = await createQuoteDocument({
      deal_id: body.deal_id,
      status: "draft",
      current_version_id: null,
      created_by: ctx.userId ?? null,
    });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      ...actor,
      action_type: "create",
      target_type: "quote_document",
      target_id: quoteDoc.id,
      summary: `견적서 ${quoteDoc.quote_number} 생성`,
      before_json: null,
      after_json: quoteDoc as unknown as Record<string, unknown>,
    });

    return NextResponse.json({ quote: quoteDoc }, { status: 201 });
  } catch (err) {
    console.error("[portal/quotes] POST error:", err);
    return NextResponse.json({ error: "견적서 생성 실패" }, { status: 500 });
  }
}
