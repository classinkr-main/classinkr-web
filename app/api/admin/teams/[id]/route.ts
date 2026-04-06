import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { updateTeam, deleteTeam } from "@/lib/repositories/teams";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    return NextResponse.json({ team: await updateTeam(id, await req.json()) });
  } catch {
    return NextResponse.json({ error: "Failed to update team" }, { status: 500 });
  }
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteTeam(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete team" }, { status: 500 });
  }
}
