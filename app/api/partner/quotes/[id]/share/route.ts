import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDeals } from "@/lib/partner-portal/repositories/partner-read";
import {
  ensureQuoteDocumentShare,
  getQuoteDocument,
} from "@/lib/partner-portal/repositories/quote-documents";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const quote = await getQuoteDocument(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { deals } = await loadPartnerDeals(context);
  if (!deals.find((d) => d.id === quote.deal_id)) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const { share } = await ensureQuoteDocumentShare({
    quote_document_id: id,
    access_mode: "view",
    created_by: context.userId ?? null,
  });

  const origin = req.nextUrl.origin;
  const shareUrl = `${origin}/partner/quote/${share.token}`;

  return NextResponse.json({ share, token: share.token, shareUrl });
}
