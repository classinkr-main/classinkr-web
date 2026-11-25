import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/portal/portal-authorize";
import { logActivity } from "@/lib/portal/repositories/activity";
import {
  CONTRACT_STATUS_LABEL,
  canTransitionContractStatus,
  isContractDocumentStatus,
} from "@/lib/portal/contract-status-flow";
import { getDeal } from "@/lib/portal/repositories/deals";
import {
  getContractDocument,
  updateContractDocument,
} from "@/lib/portal/repositories/contract-documents";
import type { UpdateContractDocument } from "@/lib/supabase/database.types.v2";

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function pickContractPatch(
  body: Record<string, unknown>,
  isAdmin: boolean
): UpdateContractDocument {
  const patch: UpdateContractDocument = {};

  if (isAdmin && typeof body.status === "string") {
    patch.status = body.status as UpdateContractDocument["status"];
  }
  if (isAdmin && hasOwn(body, "current_version_id")) {
    patch.current_version_id =
      typeof body.current_version_id === "string" ? body.current_version_id : null;
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

    const body = (await req.json()) as Record<string, unknown>;
    const isAdmin = ctx.type === "admin";

    // 상태는 "확인 후 체크" 순서(발송함 → 고객 확인 → 계약 확정, 취소, 한 단계 해제)로만 바꾼다.
    if (isAdmin && hasOwn(body, "status")) {
      if (!isContractDocumentStatus(body.status)) {
        return NextResponse.json({ error: "올바르지 않은 계약 상태입니다." }, { status: 400 });
      }
      if (!canTransitionContractStatus(existing.status, body.status)) {
        return NextResponse.json(
          {
            error: `'${CONTRACT_STATUS_LABEL[existing.status]}' 상태에서 '${CONTRACT_STATUS_LABEL[body.status]}'(으)로 바꿀 수 없습니다. 단계를 순서대로 체크하세요.`,
          },
          { status: 409 }
        );
      }
    }

    const patch = pickContractPatch(body, isAdmin);
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no allowed fields" }, { status: 400 });
    }

    const doc = await updateContractDocument(id, patch);

    if (patch.status && patch.status !== existing.status) {
      // 계약 확정(completed) 시점에 매출 원장 초안을 제안한다(서명 API와 같은 방식).
      // draft까지만 넣고 딜 단위로 중복 제거되며, 응답을 막지 않도록 실패는 로그만 남긴다.
      if (patch.status === "completed") {
        try {
          const { proposeLedgerDraftForSignedContract } = await import(
            "@/lib/admin/handoff/contract-to-ledger-draft"
          );
          const proposal = await proposeLedgerDraftForSignedContract({
            contractDocumentId: id,
          });
          if (proposal.status === "error") {
            console.error(
              "[portal/contracts/[id]] ledger draft proposal error:",
              proposal.error
            );
          }
        } catch (handoffError) {
          console.error("[portal/contracts/[id]] ledger draft handoff failed:", handoffError);
        }
      }

      try {
        const deal = await getDeal(existing.deal_id);
        if (!deal) throw new Error("deal not found for activity log");
        await logActivity({
          partner_account_id: deal.partner_account_id,
          customer_id: deal.customer_id,
          deal_id: deal.id,
          ...getActorInfo(ctx),
          action_type: "update",
          target_type: "contract_document",
          target_id: id,
          summary: `계약서 ${existing.contract_number} 상태 변경: ${CONTRACT_STATUS_LABEL[existing.status]} → ${CONTRACT_STATUS_LABEL[patch.status]}`,
          before_json: { status: existing.status },
          after_json: { status: patch.status },
        });
      } catch (logError) {
        console.error("[portal/contracts/[id]] activity log failed:", logError);
      }
    }

    return NextResponse.json({ contract: doc });
  } catch (err) {
    console.error("[portal/contracts/[id]] PUT error:", err);
    return NextResponse.json({ error: "계약서 수정 실패" }, { status: 500 });
  }
}
