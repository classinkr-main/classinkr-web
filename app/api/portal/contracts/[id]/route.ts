import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { authorizeForAccount } from "@/lib/partner-portal/portal-authorize";
import { getDeal } from "@/lib/partner-portal/repositories/deals";
import {
  getContractDocument,
  updateContractDocument,
} from "@/lib/partner-portal/repositories/contract-documents";

export async function GET(
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

    if (ctx.type === "partner") {
      const deal = await getDeal(doc.deal_id);
      if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    return NextResponse.json({ contract: doc });
  } catch (err) {
    console.error("[portal/contracts/[id]] GET error:", err);
    return NextResponse.json({ error: "계약서 조회 실패" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const existing = await getContractDocument(id);
    if (!existing) return NextResponse.json({ error: "계약서 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const deal = await getDeal(existing.deal_id);
      if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = await req.json();
    const doc = await updateContractDocument(id, body);
    return NextResponse.json({ contract: doc });
  } catch (err) {
    console.error("[portal/contracts/[id]] PUT error:", err);
    return NextResponse.json({ error: "계약서 수정 실패" }, { status: 500 });
  }
}
