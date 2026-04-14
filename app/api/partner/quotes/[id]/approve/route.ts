import { NextRequest, NextResponse } from "next/server";

import { resolvePartnerAccountContext } from "@/lib/partner-portal/context";
import {
  getQuoteDocument,
  updateQuoteDocument,
} from "@/lib/partner-portal/repositories/quote-documents";

/**
 * POST /api/partner/quotes/[id]/approve
 * 파트너가 어드민 생성 견적을 승인 → pending_approval → draft
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await resolvePartnerAccountContext(req);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 어드민은 자기가 만든 견적을 스스로 승인할 수 없음
  if (context.isSuperAdmin) {
    return NextResponse.json(
      { error: "어드민은 직접 승인할 수 없습니다. 파트너 계정으로 승인해주세요." },
      { status: 403 }
    );
  }

  const { id } = await params;

  try {
    const doc = await getQuoteDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (doc.status !== "pending_approval") {
      return NextResponse.json(
        { error: "승인 대기 상태가 아닙니다.", current_status: doc.status },
        { status: 409 }
      );
    }

    const updated = await updateQuoteDocument(id, {
      status: "draft",
      approved_by: context.userId,
      approved_at: new Date().toISOString(),
    });

    return NextResponse.json({ document: updated });
  } catch (error) {
    console.error("[POST /api/partner/quotes/[id]/approve]", error);
    return NextResponse.json(
      { error: "승인 처리에 실패했습니다." },
      { status: 500 }
    );
  }
}
