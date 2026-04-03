import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { listPartners, createPartner } from "@/lib/repositories/partners";

export async function GET(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  try {
    const partners = await listPartners();
    return NextResponse.json({ partners });
  } catch (e) {
    console.error("[GET /api/admin/partners]", e);
    return NextResponse.json({ error: "Failed to fetch partners" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const err = verifyAdmin(req);
  if (err) return err;
  try {
    const body = await req.json();
    const partner = await createPartner(body);
    return NextResponse.json({ partner }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/partners]", e);
    return NextResponse.json({ error: "Failed to create partner" }, { status: 500 });
  }
}
