import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDeals } from "@/lib/partner-portal/repositories/partner-read";
import {
  createQuoteDocument,
  createQuoteDocumentVersion,
} from "@/lib/partner-portal/repositories/quote-documents";

export async function POST(req: NextRequest) {
  const context = await resolvePartnerAccountContext(req);
  if (!context?.partnerAccountId && !context?.legacyPartnerId) {
    return NextResponse.json(
      { error: "Partner account is required" },
      { status: 409 }
    );
  }

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

    const {
      deal_id,
      title,
      subtotal = 0,
      discount_amount = 0,
      tax_amount = 0,
      total_amount = 0,
      content_html = null,
      structured_json = null,
      valid_until = null,
    } = body;

    if (!deal_id || !title) {
      return NextResponse.json(
        { error: "deal_id and title are required" },
        { status: 400 }
      );
    }

    // deal이 이 파트너 계정 소속인지 검증
    const { deals } = await loadPartnerDeals(context);
    const deal = deals.find((d) => d.id === deal_id);
    if (!deal) {
      return NextResponse.json(
        { error: "Deal not found or access denied" },
        { status: 403 }
      );
    }

    // 견적서 생성
    const document = await createQuoteDocument({
      deal_id,
      status: "draft",
      current_version_id: null,
      created_by: context.userId ?? null,
    });

    // 첫 버전 생성
    const version = await createQuoteDocumentVersion({
      quote_document_id: document.id,
      version_number: 1,
      title,
      content_html,
      structured_json,
      subtotal,
      discount_amount,
      tax_amount,
      total_amount,
      valid_until,
      created_by: context.userId ?? null,
    });

    return NextResponse.json({ document, version }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/partner/quotes]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quote" },
      { status: 500 }
    );
  }
}
