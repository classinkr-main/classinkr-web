import { NextRequest, NextResponse } from "next/server";

import {
  getPartnerAccountFilter,
  isErrorResponse,
  requirePortalContext,
} from "@/lib/portal/portal-context";
import { listPortalDocuments } from "@/lib/portal/repositories/documents";
import type { PartnerDocumentKind } from "@/lib/portal/types";

const DOCUMENT_TYPES = new Set<PartnerDocumentKind | "all">([
  "all",
  "quote",
  "contract",
  "receipt",
]);

export async function GET(req: NextRequest) {
  const result = await requirePortalContext(req);
  if (isErrorResponse(result)) return result;
  const ctx = result;

  const { searchParams } = new URL(req.url);
  const rawType = searchParams.get("type") ?? "all";
  const type = DOCUMENT_TYPES.has(rawType as PartnerDocumentKind | "all")
    ? (rawType as PartnerDocumentKind | "all")
    : "all";
  const customerId = searchParams.get("customer_id") ?? undefined;
  const dealId = searchParams.get("deal_id") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  try {
    const payload = await listPortalDocuments({
      partnerAccountId: getPartnerAccountFilter(ctx) ?? undefined,
      customerId,
      dealId,
      type,
      status,
    });

    const response = NextResponse.json({
      mode: "v2",
      ...payload,
    });
    response.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60");
    return response;
  } catch (error) {
    console.error("[portal/documents] GET error:", error);
    return NextResponse.json({ error: "문서 목록 조회 실패" }, { status: 500 });
  }
}
