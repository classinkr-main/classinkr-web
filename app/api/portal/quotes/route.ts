import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  createQuoteDocument,
  createQuoteDocumentVersion,
} from "@/lib/partner-portal/repositories/quote-documents";
import { logActivity } from "@/lib/partner-portal/repositories/activity";

export async function POST(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  try {
    const body = (await req.json()) as {
      deal_id?: string;
      title?: string;
      subtotal?: number;
      discount_amount?: number;
      tax_amount?: number;
      total_amount?: number;
      content_html?: string | null;
      structured_json?: Record<string, unknown> | null;
      valid_until?: string | null;
    };
    if (!body.deal_id) {
      return NextResponse.json({ error: "deal_id 필수" }, { status: 400 });
    }

    const deal = await getDeal(body.deal_id);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const isAdmin = ctx.type === "admin";
    const quoteDoc = await createQuoteDocument({
      deal_id: body.deal_id,
      status: "draft",
      current_version_id: null,
      created_by: ctx.userId ?? null,
      created_by_role: isAdmin ? "admin" : "partner",
      approved_by: null,
      approved_at: null,
    });

    const version = body.title
      ? await createQuoteDocumentVersion({
          quote_document_id: quoteDoc.id,
          version_number: 1,
          title: body.title,
          content_html: body.content_html ?? null,
          structured_json: body.structured_json ?? null,
          subtotal: body.subtotal ?? 0,
          discount_amount: body.discount_amount ?? 0,
          tax_amount: body.tax_amount ?? 0,
          total_amount: body.total_amount ?? 0,
          valid_until: body.valid_until ?? null,
          created_by: ctx.userId ?? null,
        })
      : null;

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

    return NextResponse.json(
      { quote: quoteDoc, document: quoteDoc, version },
      { status: 201 }
    );
  } catch (err) {
    console.error("[portal/quotes] POST error:", err);
    return NextResponse.json({ error: "견적서 생성 실패" }, { status: 500 });
  }
}
