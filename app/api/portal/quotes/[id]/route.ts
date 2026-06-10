import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount } from "@/lib/portal/portal-authorize";
import { getDeal } from "@/lib/portal/repositories/deals";
import {
  getLatestQuoteDocumentShare,
  getQuoteDocument,
  getResolvableQuoteVersion,
  updateQuoteDocument,
} from "@/lib/portal/repositories/quote-documents";
import type { UpdateQuoteDocument } from "@/lib/supabase/database.types.v2";

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function pickQuotePatch(
  body: Record<string, unknown>,
  isAdmin: boolean
): UpdateQuoteDocument {
  const patch: UpdateQuoteDocument = {};

  if (typeof body.status === "string" && (isAdmin || body.status === "accepted")) {
    patch.status = body.status as UpdateQuoteDocument["status"];
  }
  if (isAdmin && hasOwn(body, "current_version_id")) {
    patch.current_version_id =
      typeof body.current_version_id === "string" ? body.current_version_id : null;
  }
  if (isAdmin && hasOwn(body, "approved_by")) {
    patch.approved_by = typeof body.approved_by === "string" ? body.approved_by : null;
  }
  if (isAdmin && hasOwn(body, "approved_at")) {
    patch.approved_at = typeof body.approved_at === "string" ? body.approved_at : null;
  }

  return patch;
}

export async function GET(
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

    if (req.nextUrl.searchParams.get("include") === "viewer") {
      const deal = await getDeal(doc.deal_id);
      const version = await getResolvableQuoteVersion(doc);
      const share = version ? await getLatestQuoteDocumentShare(version.id) : null;

      return NextResponse.json({
        quote: doc,
        document: doc,
        version,
        share,
        deal,
      });
    }

    return NextResponse.json({ quote: doc });
  } catch (err) {
    console.error("[portal/quotes/[id]] GET error:", err);
    return NextResponse.json({ error: "견적서 조회 실패" }, { status: 500 });
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
    const existing = await getQuoteDocument(id);
    if (!existing) return NextResponse.json({ error: "견적서 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const deal = await getDeal(existing.deal_id);
      if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    const body = (await req.json()) as Record<string, unknown>;
    const patch = pickQuotePatch(body, ctx.type === "admin");
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
    }

    const doc = await updateQuoteDocument(id, patch);
    return NextResponse.json({ quote: doc });
  } catch (err) {
    console.error("[portal/quotes/[id]] PUT error:", err);
    return NextResponse.json({ error: "견적서 수정 실패" }, { status: 500 });
  }
}
