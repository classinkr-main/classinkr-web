import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import { loadPartnerDeals } from "@/lib/partner-portal/repositories/partner-read";
import {
  createQuoteDocumentVersion,
  getQuoteDocument,
} from "@/lib/partner-portal/repositories/quote-documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { QuoteDocumentVersion } from "@/lib/partner-portal/types";

async function getCurrentVersion(quoteDocumentId: string, currentVersionId: string | null) {
  const db = createSupabaseAdminClient();

  if (currentVersionId) {
    const { data } = await db
      .from("quote_document_versions")
      .select("*")
      .eq("id", currentVersionId)
      .maybeSingle();
    if (data) return data as QuoteDocumentVersion;
  }

  const { data } = await db
    .from("quote_document_versions")
    .select("*")
    .eq("quote_document_id", quoteDocumentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as QuoteDocumentVersion | null;
}

async function getNextVersionNumber(quoteDocumentId: string): Promise<number> {
  const db = createSupabaseAdminClient();
  const { data } = await db
    .from("quote_document_versions")
    .select("version_number")
    .eq("quote_document_id", quoteDocumentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { version_number: number } | null)?.version_number ?? 0) + 1;
}

/* ── GET — 견적서 + 현재 버전 + 거래 정보 조회 ─────────────── */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const quote = await getQuoteDocument(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { deals } = await loadPartnerDeals(context);
  const deal = deals.find((d) => d.id === quote.deal_id);
  if (!deal) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const version = await getCurrentVersion(id, quote.current_version_id);

  return NextResponse.json({ quote, version, deal });
}

/* ── PATCH — 새 버전으로 라인 아이템 저장 ──────────────────── */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const quote = await getQuoteDocument(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { deals } = await loadPartnerDeals(context);
  const deal = deals.find((d) => d.id === quote.deal_id);
  if (!deal) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const body = (await req.json()) as {
    title?: string;
    validUntil?: string | null;
    recipientCompanyName?: string;
    lineItems?: Array<{
      sortOrder: number;
      itemName: string;
      itemDescription?: string;
      unitPrice: number;
      quantity: number;
      lineSupplyAmount: number;
    }>;
  };

  const lineItems = body.lineItems ?? [];
  const subtotal = lineItems.reduce((s, l) => s + l.lineSupplyAmount, 0);
  const taxAmount = Math.round(subtotal * 0.1);
  const totalAmount = subtotal + taxAmount;

  const structuredJson = {
    lineItems,
    recipientCompanyName: body.recipientCompanyName ?? deal.customer_name ?? "",
    issuedAt: new Date().toISOString().slice(0, 10),
    validUntil: body.validUntil ?? null,
  };

  const nextVersion = await getNextVersionNumber(id);

  const version = await createQuoteDocumentVersion({
    quote_document_id: id,
    version_number: nextVersion,
    title: body.title ?? deal.title,
    content_html: null,
    structured_json: structuredJson,
    subtotal,
    discount_amount: 0,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    valid_until: body.validUntil ?? null,
    created_by: context.userId ?? null,
  });

  return NextResponse.json({ quote, version });
}
