import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/partner-portal/portal-context";
import { getReceipt } from "@/lib/partner-portal/repositories/payments";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const { id } = await params;

  try {
    const receipt = await getReceipt(id);
    if (!receipt) {
      return NextResponse.json({ error: "영수증 없음" }, { status: 404 });
    }
    return NextResponse.json({ receipt });
  } catch (err) {
    console.error("[portal/receipts/[id]] GET error:", err);
    return NextResponse.json({ error: "영수증 조회 실패" }, { status: 500 });
  }
}
