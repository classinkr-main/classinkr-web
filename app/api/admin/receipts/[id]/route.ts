import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getReceipt, updateReceipt, deleteReceipt } from "@/lib/repositories/receipts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  const receipt = await getReceipt(id);
  if (!receipt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ receipt });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    const body = await req.json();
    const receipt = await updateReceipt(id, body);
    return NextResponse.json({ receipt });
  } catch (e) {
    console.error("[PUT /api/admin/receipts/[id]]", e);
    return NextResponse.json({ error: "Failed to update receipt" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteReceipt(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/receipts/[id]]", e);
    return NextResponse.json({ error: "Failed to delete receipt" }, { status: 500 });
  }
}
