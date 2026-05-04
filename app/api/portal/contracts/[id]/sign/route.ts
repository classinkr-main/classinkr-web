import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  getContractDocument,
  applySignature,
} from "@/lib/partner-portal/repositories/contract-documents";
import { logActivity } from "@/lib/partner-portal/repositories/activity";
import { decodePngDataUrl } from "@/lib/server/image-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_SIGNATURE_BYTES = 512 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const doc = await getContractDocument(id);
    if (!doc) return NextResponse.json({ error: "계약서 없음" }, { status: 404 });
    if (!doc.current_version_id) {
      return NextResponse.json({ error: "계약 버전 없음" }, { status: 400 });
    }

    const deal = await getDeal(doc.deal_id);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = await req.json();
    const signatureData = body.signature_data;
    if (!signatureData) {
      return NextResponse.json({ error: "서명 데이터 필수" }, { status: 400 });
    }

    // 서명 이미지 Supabase Storage에 업로드
    const signerType = ctx.type === "admin" ? "admin" : "partner";
    const supabase = createSupabaseAdminClient();
    const decoded = decodePngDataUrl(signatureData, MAX_SIGNATURE_BYTES);
    if (!decoded.ok) {
      return NextResponse.json({ error: "Invalid signature image" }, { status: 400 });
    }
    const buffer = decoded.buffer;
    const storagePath = `contracts/${id}/${signerType}/${crypto.randomUUID()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(storagePath, buffer, {
        contentType: "image/png",
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const version = await applySignature(
      doc.current_version_id,
      storagePath,
      signerType
    );

    // 계약서 상태 업데이트
    const newStatus = signerType === "partner" ? "partner_signed" : "admin_signed";
    const { updateContractDocument } = await import(
      "@/lib/partner-portal/repositories/contract-documents"
    );
    await updateContractDocument(id, { status: newStatus });

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      ...actor,
      action_type: "sign",
      target_type: "contract_document",
      target_id: id,
      summary: `계약서 ${doc.contract_number} ${signerType} 서명`,
      before_json: null,
      after_json: { version_id: version.id, signer: signerType },
    });

    return NextResponse.json({ version });
  } catch (err) {
    console.error("[portal/contracts/[id]/sign] POST error:", err);
    return NextResponse.json({ error: "서명 실패" }, { status: 500 });
  }
}
