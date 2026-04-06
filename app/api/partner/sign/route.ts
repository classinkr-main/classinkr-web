import { NextRequest, NextResponse } from "next/server";
import { getContractByToken, applyPartnerSignature } from "@/lib/repositories/contracts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function sanitizeContract<T extends { sign_token: unknown; partner_signed_ip: unknown }>(contract: T) {
  const { sign_token, partner_signed_ip, ...safe } = contract;
  void sign_token;
  void partner_signed_ip;
  return safe;
}

/**
 * GET  /api/partner/sign?token=xxx  — 계약서 공개 조회 (토큰 기반)
 * POST /api/partner/sign            — 파트너 서명 제출
 */

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const contract = await getContractByToken(token);
  if (!contract) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  // 서명용 응답 — 민감 필드 제외
  return NextResponse.json({ contract: sanitizeContract(contract) });
}

export async function POST(req: NextRequest) {
  try {
    const { token, signature_data } = await req.json();
    if (!token || !signature_data) {
      return NextResponse.json({ error: "token and signature_data required" }, { status: 400 });
    }

    const contract = await getContractByToken(token);
    if (!contract) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (contract.partner_signed_at) {
      return NextResponse.json({ error: "이미 서명된 계약서입니다" }, { status: 400 });
    }
    if (!["sent", "draft"].includes(contract.status)) {
      return NextResponse.json({ error: "서명 불가능한 상태입니다" }, { status: 400 });
    }

    // base64 이미지 → Storage 업로드
    const base64 = signature_data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const path = `contracts/${contract.id}/partner_signature.png`;

    const supabase = createSupabaseAdminClient();
    const { error: uploadErr } = await supabase.storage
      .from("signatures")
      .upload(path, buffer, { contentType: "image/png", upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage.from("signatures").getPublicUrl(path);

    // IP 추출
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    const updated = await applyPartnerSignature(contract.id, urlData.publicUrl, ip);
    return NextResponse.json({ contract: sanitizeContract(updated) });
  } catch (error) {
    console.error("[POST /api/partner/sign]", error);
    return NextResponse.json({ error: "서명 처리 중 오류가 발생했습니다" }, { status: 500 });
  }
}
