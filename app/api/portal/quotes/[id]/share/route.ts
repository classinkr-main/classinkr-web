import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  ensureQuoteDocumentShare,
  getQuoteDocument,
  updateQuoteDocument,
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
    const document = await getQuoteDocument(id);
    if (!document) {
      return NextResponse.json({ error: "견적서 없음" }, { status: 404 });
    }

    const deal = await getDeal(document.deal_id);
    if (!deal) {
      return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, deal.partner_account_id);
      if (forbidden) return forbidden;
    }

    const ensured = await ensureQuoteDocumentShare({
      quote_document_id: id,
      access_mode: "view",
      created_by: ctx.userId ?? null,
    });

    const nextDocument =
      ensured.document.status === "shared"
        ? ensured.document
        : await updateQuoteDocument(id, { status: "shared" });

    return NextResponse.json(
      { quote: nextDocument, version: ensured.version, share: ensured.share },
      { status: 201 }
    );
  } catch (error) {
    console.error("[portal/quotes/[id]/share] POST error:", error);
    return NextResponse.json({ error: "견적 공유 링크 생성 실패" }, { status: 500 });
  }
}
