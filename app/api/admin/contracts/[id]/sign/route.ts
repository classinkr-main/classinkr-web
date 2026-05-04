import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getContract, applyAdminSignature } from "@/lib/repositories/contracts";
import { decodePngDataUrl } from "@/lib/server/image-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_SIGNATURE_BYTES = 512 * 1024;

/**
 * POST /api/admin/contracts/[id]/sign
 * 어드민 서명 적용 — base64 서명 이미지를 Storage에 업로드 후 계약서 완료 처리
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req);
  if (err) return err;
  const { id } = await params;

  try {
    const contract = await getContract(id);
    if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (contract.status !== "partner_signed") {
      return NextResponse.json(
        { error: "파트너 서명 후 어드민 서명이 가능합니다" },
        { status: 400 }
      );
    }

    const { signature_data, admin_user_id } = await req.json();
    if (!signature_data) return NextResponse.json({ error: "signature_data required" }, { status: 400 });

    // base64 → Buffer 업로드
    const decoded = decodePngDataUrl(signature_data, MAX_SIGNATURE_BYTES);
    if (!decoded.ok) {
      return NextResponse.json({ error: "Invalid signature image" }, { status: 400 });
    }
    const buffer = decoded.buffer;
    const path = `contracts/${id}/admin/${crypto.randomUUID()}.png`;

    const supabase = createSupabaseAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from("signatures")
      .upload(path, buffer, { contentType: "image/png", upsert: false });
    if (uploadErr) throw uploadErr;

    const updated = await applyAdminSignature(id, path, admin_user_id ?? "");
    return NextResponse.json({ contract: updated });
  } catch (e) {
    console.error("[POST /api/admin/contracts/[id]/sign]", e);
    return NextResponse.json({ error: "Failed to apply admin signature" }, { status: 500 });
  }
}
