import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import { getReceipt } from "@/lib/portal/repositories/payments";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;
  const { id } = await params;

  try {
    const receipt = await getReceipt(id);
    if (!receipt) {
      return NextResponse.json({ error: "영수증 없음" }, { status: 404 });
    }
    const forbidden = authorizeForAccount(ctx, receipt.partner_account_id);
    if (forbidden) return forbidden;

    return NextResponse.json({ receipt });
  } catch (err) {
    console.error("[portal/receipts/[id]] GET error:", err);
    return NextResponse.json({ error: "영수증 조회 실패" }, { status: 500 });
  }
}
