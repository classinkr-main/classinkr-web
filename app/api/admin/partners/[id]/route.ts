import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getPartner, updatePartner, deletePartner } from "@/lib/repositories/partners";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  const partner = await getPartner(id);
  if (!partner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ partner });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    const body = await req.json();
    const partner = await updatePartner(id, body);
    return NextResponse.json({ partner });
  } catch (e) {
    console.error("[PUT /api/admin/partners/[id]]", e);
    return NextResponse.json({ error: "Failed to update partner" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deletePartner(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/partners/[id]]", e);
    return NextResponse.json({ error: "Failed to delete partner" }, { status: 500 });
  }
}
