import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import { getDeal } from "@/lib/portal/repositories/deals";
import {
  ensureQuoteDocumentShare,
  getQuoteDocument,
  updateQuoteDocument,
} from "@/lib/portal/repositories/quote-documents";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const document = await getQuoteDocument(id);
    if (!document) {
      return NextResponse.json({ error: "견적서 없음" }, { status: 404 });
    }

    const deal = await getDeal(document.deal_id);
    if (!deal) {
      return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, deal.partner_account_id);
      if (forbidden) return forbidden;
    }

    if (ctx.type === "partner" && document.status === "pending_approval") {
      return NextResponse.json(
        { error: "파트너 승인 대기 중인 견적은 공유할 수 없습니다." },
        { status: 403 }
      );
    }

    // 견적 발송의 목적은 고객 응답(검토 확인/진행 요청) 수집이므로 "sign" 모드로 발급한다.
    // "view"로 발급하면 공유 페이지가 응답 버튼을 숨겨 응답 퍼널이 끊긴다.
    const ensured = await ensureQuoteDocumentShare({
      quote_document_id: id,
      access_mode: "sign",
      created_by: ctx.userId ?? null,
    });

    const nextDocument =
      ensured.document.status === "shared"
        ? ensured.document
        : await updateQuoteDocument(id, { status: "shared" });

    const origin = req.nextUrl.origin;
    const shareUrl = `${origin}/share/quote/${ensured.share.token}`;

    return NextResponse.json(
      {
        quote: nextDocument,
        document: nextDocument,
        version: ensured.version,
        share: ensured.share,
        token: ensured.share.token,
        shareUrl,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[portal/quotes/[id]/share] POST error:", error);
    return NextResponse.json({ error: "견적 공유 링크 생성 실패" }, { status: 500 });
  }
}
