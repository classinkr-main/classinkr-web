import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { listHwSales, createHwSale, generateSaleNumber } from "@/lib/repositories/hw-sales";

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const partnerId = req.nextUrl.searchParams.get("partner_id") ?? undefined;
    const contractId = req.nextUrl.searchParams.get("contract_id") ?? undefined;
    const hwSales = await listHwSales({ partnerId, contractId });
    return NextResponse.json({ hwSales });
  } catch (e) {
    console.error("[GET /api/admin/hw-sales]", e);
    return NextResponse.json({ error: "Failed to fetch hw sales" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req);
  if (err) return err;
  try {
    const { items = [], ...body } = await req.json();
    if (!body.sale_number) {
      body.sale_number = await generateSaleNumber();
    }
    const hwSale = await createHwSale(body, items);
    return NextResponse.json({ hwSale }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/hw-sales]", e);
    return NextResponse.json({ error: "Failed to create hw sale" }, { status: 500 });
  }
}
