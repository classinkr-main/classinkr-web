import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/portal/portal-authorize";
import { getDeal } from "@/lib/portal/repositories/deals";
import { getQuoteDocument } from "@/lib/portal/repositories/quote-documents";
import { convertQuoteToContract } from "@/lib/portal/repositories/contract-documents";
import { logActivity } from "@/lib/portal/repositories/activity";

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

    const deal = await getDeal(doc.deal_id);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const { contractDocument, version } = await convertQuoteToContract(
      id,
      doc.deal_id,
      ctx.userId ?? null
    );
    const sourceQuote =
      version.structured_json &&
      typeof version.structured_json === "object" &&
      !Array.isArray(version.structured_json) &&
      version.structured_json.sourceQuote &&
      typeof version.structured_json.sourceQuote === "object" &&
      !Array.isArray(version.structured_json.sourceQuote)
        ? (version.structured_json.sourceQuote as Record<string, unknown>)
        : null;

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      ...actor,
      action_type: "convert",
      target_type: "contract_document",
      target_id: contractDocument.id,
      summary: `견적 ${doc.quote_number} → 계약 ${contractDocument.contract_number} 전환`,
      before_json: {
        quote_document_id: id,
        quote_number: doc.quote_number,
      },
      after_json: {
        contract_document_id: contractDocument.id,
        contract_number: contractDocument.contract_number,
        contract_version_id: version.id,
        source_quote: sourceQuote,
      },
    });

    return NextResponse.json(
      { contract: contractDocument, version },
      { status: 201 }
    );
  } catch (err) {
    console.error("[portal/quotes/[id]/convert] POST error:", err);
    return NextResponse.json({ error: "계약 전환 실패" }, { status: 500 });
  }
}
