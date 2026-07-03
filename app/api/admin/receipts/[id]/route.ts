import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { deleteReceipt } from "@/lib/repositories/receipts";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
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
