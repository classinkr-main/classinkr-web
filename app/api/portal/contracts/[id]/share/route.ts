import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import { getDeal } from "@/lib/portal/repositories/deals";
import {
  ensureContractDocumentShare,
  getContractDocument,
  updateContractDocument,
} from "@/lib/portal/repositories/contract-documents";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const document = await getContractDocument(id);
    if (!document) {
      return NextResponse.json({ error: "계약서 없음" }, { status: 404 });
    }

    const deal = await getDeal(document.deal_id);
    if (!deal) {
      return NextResponse.json({ error: "딜 없음" }, { status: 404 });
    }

    if (ctx.type === "partner") {
      const forbidden = authorizeForAccount(ctx, deal.partner_account_id);
      if (forbidden) return forbidden;
    }

    const ensured = await ensureContractDocumentShare({
      contract_document_id: id,
      access_mode: "sign",
      created_by: ctx.userId ?? null,
    });

    const nextDocument =
      ensured.document.status === "shared"
        ? ensured.document
        : await updateContractDocument(id, { status: "shared" });

    return NextResponse.json(
      { contract: nextDocument, version: ensured.version, share: ensured.share },
      { status: 201 }
    );
  } catch (error) {
    console.error("[portal/contracts/[id]/share] POST error:", error);
    return NextResponse.json({ error: "계약 공유 링크 생성 실패" }, { status: 500 });
  }
}
