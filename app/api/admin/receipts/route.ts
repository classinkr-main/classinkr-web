import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { listReceipts, createReceipt, generateReceiptNumber } from "@/lib/repositories/receipts";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const contractId = req.nextUrl.searchParams.get("contract_id") ?? undefined;
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const receipts = await listReceipts(contractId, partnerId);
    return NextResponse.json({ receipts });
  } catch (e) {
    console.error("[GET /api/admin/receipts]", e);
    return NextResponse.json({ error: "Failed to fetch receipts" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const body = await req.json();
    if (!body.receipt_number) {
      body.receipt_number = await generateReceiptNumber();
    }
    const receipt = await createReceipt(body);
    return NextResponse.json({ receipt }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/receipts]", e);
    return NextResponse.json({ error: "Failed to create receipt" }, { status: 500 });
  }
}
