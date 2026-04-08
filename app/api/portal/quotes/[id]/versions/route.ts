import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  getQuoteDocument,
  createQuoteDocumentVersion,
} from "@/lib/partner-portal/repositories/quote-documents";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const doc = await getQuoteDocument(id);
    if (!doc) return NextResponse.json({ error: "견적서 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const deal = await getDeal(doc.deal_id);
      if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = await req.json();
    const version = await createQuoteDocumentVersion({
      quote_document_id: id,
      version_number: body.version_number ?? 1,
      title: body.title ?? "견적서",
      content_html: body.content_html ?? null,
      structured_json: body.structured_json ?? null,
      subtotal: body.subtotal ?? 0,
      discount_amount: body.discount_amount ?? 0,
      tax_amount: body.tax_amount ?? 0,
      total_amount: body.total_amount ?? 0,
      valid_until: body.valid_until ?? null,
      created_by: ctx.userId ?? null,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    console.error("[portal/quotes/[id]/versions] POST error:", err);
    return NextResponse.json({ error: "견적 버전 생성 실패" }, { status: 500 });
  }
}
