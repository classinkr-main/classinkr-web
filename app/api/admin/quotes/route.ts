import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { adminCachedJson } from "@/lib/admin-api-response";
import { listQuotes, createQuote, generateQuoteNumber } from "@/lib/repositories/quotes";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const quotes = await listQuotes(partnerId);
    return adminCachedJson({ quotes });
  } catch (e) {
    console.error("[GET /api/admin/quotes]", e);
    return NextResponse.json({ error: "Failed to fetch quotes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const { items = [], ...body } = await req.json();
    if (!body.quote_number) {
      body.quote_number = await generateQuoteNumber();
    }
    const quote = await createQuote(body, items);
    return NextResponse.json({ quote }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/quotes]", e);
    return NextResponse.json({ error: "Failed to create quote" }, { status: 500 });
  }
}
