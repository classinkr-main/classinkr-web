import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getHwSale, updateHwSale, deleteHwSale } from "@/lib/repositories/hw-sales";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  const hwSale = await getHwSale(id);
  if (!hwSale) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ hwSale });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    const { items, ...body } = await req.json();
    const hwSale = await updateHwSale(id, body, items);
    return NextResponse.json({ hwSale });
  } catch (e) {
    console.error("[PUT /api/admin/hw-sales/[id]]", e);
    return NextResponse.json({ error: "Failed to update hw sale" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteHwSale(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/hw-sales/[id]]", e);
    return NextResponse.json({ error: "Failed to delete hw sale" }, { status: 500 });
  }
}
