import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { getContract, applyAdminSignature } from "@/lib/repositories/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    const base64 = signature_data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const path = `contracts/${id}/admin_signature.png`;

    const supabase = createSupabaseAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from("signatures")
      .upload(path, buffer, { contentType: "image/png", upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(path);
    const signatureUrl = urlData.publicUrl;

    const updated = await applyAdminSignature(id, signatureUrl, admin_user_id ?? "");
    return NextResponse.json({ contract: updated });
  } catch (e) {
    console.error("[POST /api/admin/contracts/[id]/sign]", e);
    return NextResponse.json({ error: "Failed to apply admin signature" }, { status: 500 });
  }
}
