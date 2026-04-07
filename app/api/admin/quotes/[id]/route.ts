import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getQuote, updateQuote, deleteQuote } from "@/lib/repositories/quotes";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ quote });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    const { items, ...body } = await req.json();
    const quote = await updateQuote(id, body, items);
    return NextResponse.json({ quote });
  } catch (e) {
    console.error("[PUT /api/admin/quotes/[id]]", e);
    return NextResponse.json({ error: "Failed to update quote" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteQuote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/quotes/[id]]", e);
    return NextResponse.json({ error: "Failed to delete quote" }, { status: 500 });
  }
}
