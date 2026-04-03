import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import {
  getContract,
  updateContract,
  deleteContract,
  listContractVersions,
} from "@/lib/repositories/contracts";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const versions = await listContractVersions(id);
  return NextResponse.json({ contract, versions });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    const { change_reason, ...body } = await req.json();
    const contract = await updateContract(id, body, change_reason);
    return NextResponse.json({ contract });
  } catch (e) {
    console.error("[PUT /api/admin/contracts/[id]]", e);
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = verifyAdmin(req);
  if (err) return err;
  const { id } = await params;
  try {
    await deleteContract(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/admin/contracts/[id]]", e);
    return NextResponse.json({ error: "Failed to delete contract" }, { status: 500 });
  }
}
