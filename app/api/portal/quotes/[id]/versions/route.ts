import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import { getDeal } from "@/lib/portal/repositories/deals";
import {
  getQuoteDocument,
  createQuoteDocumentVersion,
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
    const doc = await getQuoteDocument(id);
    if (!doc) return NextResponse.json({ error: "견적서 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const deal = await getDeal(doc.deal_id);
      if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    // 동의(accepted)·계약 전환(archived)된 견적은 버전을 올리지 않는다 — 현재 버전이 바뀌면 오더·총판 정산은
    // 새 버전 금액을, 계약서는 동의한 버전 금액을 읽어 서로 어긋난다. 고칠 내용은 새 견적으로 만든다.
    if (doc.status === "accepted" || doc.status === "archived") {
      return NextResponse.json(
        { error: "고객이 동의했거나 계약으로 전환된 견적은 수정할 수 없습니다. 새 견적으로 작성해 주세요." },
        { status: 409 }
      );
    }

    const body = await req.json();
    const version = await createQuoteDocumentVersion({
      quote_document_id: id,
      version_number: body.version_number ?? 1,
      title: body.title ?? "견적서",
      content_html: body.content_html ?? null,
      structured_json: body.structured_json ?? null,
      subtotal: body.subtotal ?? 0,
      discount_amount: body.discount_amount ?? 0,
      tax_amount: body.tax_amount ?? 0,
      total_amount: body.total_amount ?? 0,
      valid_until: body.valid_until ?? null,
      created_by: ctx.userId ?? null,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    console.error("[portal/quotes/[id]/versions] POST error:", err);
    return NextResponse.json({ error: "견적 버전 생성 실패" }, { status: 500 });
  }
}
