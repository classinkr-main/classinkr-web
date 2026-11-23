import { NextRequest, NextResponse } from "next/server";

import {
  requirePortalContext,
  isErrorResponse,
} from "@/lib/portal/portal-context";
import { authorizeForAccount, getActorInfo } from "@/lib/portal/portal-authorize";
import { getDeal, updateDeal } from "@/lib/portal/repositories/deals";
import { getQuoteDocument } from "@/lib/portal/repositories/quote-documents";
import {
  convertQuoteToContract,
  findContractDocumentBySourceQuote,
} from "@/lib/portal/repositories/contract-documents";
import { getLatestAcceptedQuoteInteraction, logActivity } from "@/lib/portal/repositories/activity";
import {
  completeCrmTask,
  listActiveTasksForDealByType,
} from "@/lib/repositories/crm-tasks";

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

    const deal = await getDeal(doc.deal_id);
    if (!deal) return NextResponse.json({ error: "딜 없음" }, { status: 404 });

    if (ctx.type === "partner") {
      const f = authorizeForAccount(ctx, deal.partner_account_id);
      if (f) return f;
    }

    // 이미 이 견적에서 만든 계약이 있으면 상태와 무관하게 거절한다(같은 견적으로 계약서가 두 번 생기는 것을 막는다).
    // 전환이 끝난 견적은 archived 가 되지만, 보관만 한 견적일 수도 있어 실제 계약을 찾아 번호로 안내한다.
    let existingNumber: string | null = null;
    try {
      existingNumber = (await findContractDocumentBySourceQuote(id))?.contract_number ?? null;
    } catch (lookupError) {
      console.error("[portal/quotes/[id]/convert] existing contract lookup skipped:", lookupError);
    }
    if (existingNumber || doc.status === "archived") {
      return NextResponse.json(
        {
          error: existingNumber
            ? `이미 계약 ${existingNumber}(으)로 전환된 견적입니다. 견적·문서의 계약서 탭에서 '견적 전환' 표시가 붙은 계약을 확인하세요.`
            : "보관된 견적은 계약으로 전환할 수 없습니다. 이미 전환했다면 견적·문서의 계약서 탭에서 확인하세요.",
          contract_number: existingNumber,
        },
        { status: 409 }
      );
    }

    // 고객이 동의한(accepted) 견적만 전환한다 — 견적 큐의 "계약 전환" 단계
    // (components/admin/documents/quote-queue.ts getQuoteQueueKey === "convert")와 같은 조건.
    // 삭제된 견적은 getQuoteDocument 가 null 을 돌려줘 위에서 404 로 끝난다.
    // 화면은 상태가 아직 안 따라왔어도 동의 기록(acceptedAt)이 있으면 전환 버튼을 보여 주므로 여기서도 같이 본다.
    let accepted = doc.status === "accepted";
    if (!accepted) {
      try {
        accepted = Boolean(await getLatestAcceptedQuoteInteraction({ quote_document_id: id }));
      } catch (acceptLookupError) {
        console.error("[portal/quotes/[id]/convert] accept lookup failed:", acceptLookupError);
      }
    }
    if (!accepted) {
      return NextResponse.json(
        { error: "고객이 동의한 견적만 계약으로 전환할 수 있습니다." },
        { status: 409 }
      );
    }

    const { contractDocument, version } = await convertQuoteToContract(
      id,
      doc.deal_id,
      ctx.userId ?? null
    );
    const sourceQuote =
      version.structured_json &&
      typeof version.structured_json === "object" &&
      !Array.isArray(version.structured_json) &&
      version.structured_json.sourceQuote &&
      typeof version.structured_json.sourceQuote === "object" &&
      !Array.isArray(version.structured_json.sourceQuote)
        ? (version.structured_json.sourceQuote as Record<string, unknown>)
        : null;

    const actor = getActorInfo(ctx);
    await logActivity({
      partner_account_id: deal.partner_account_id,
      customer_id: deal.customer_id,
      deal_id: deal.id,
      ...actor,
      action_type: "convert",
      target_type: "contract_document",
      target_id: contractDocument.id,
      summary: `견적 ${doc.quote_number} → 계약 ${contractDocument.contract_number} 전환`,
      before_json: {
        quote_document_id: id,
        quote_number: doc.quote_number,
      },
      after_json: {
        contract_document_id: contractDocument.id,
        contract_number: contractDocument.contract_number,
        contract_version_id: version.id,
        source_quote: sourceQuote,
      },
    });

    // 딜 stage 전진: 아직 계약 이전 단계(contact/quote)일 때만 contract로 올린다.
    // 전진만 허용하고 후퇴·건너뛰기는 하지 않는다(이미 contract 이상이면 그대로 둔다).
    // 실패해도 전환 응답을 막지 않는다.
    if (deal.current_stage === "contact" || deal.current_stage === "quote") {
      try {
        await updateDeal(deal.id, { current_stage: "contract" });
      } catch (stageError) {
        console.error(
          "[portal/quotes/[id]/convert] deal stage advance skipped:",
          stageError
        );
      }
    }

    // 견적 수락으로 만들어진 "계약 전환" CRM 카드를 자동 소거한다(작업 1의 카드).
    // 실패해도 전환 응답을 막지 않는다.
    try {
      const openQuoteTasks = await listActiveTasksForDealByType(deal.id, "quote");
      for (const task of openQuoteTasks) {
        await completeCrmTask(task.id, {
          outcome: `계약 ${contractDocument.contract_number} 전환 완료`,
        });
      }
    } catch (taskError) {
      console.error(
        "[portal/quotes/[id]/convert] CRM task auto-complete skipped:",
        taskError
      );
    }

    return NextResponse.json(
      { contract: contractDocument, version },
      { status: 201 }
    );
  } catch (err) {
    console.error("[portal/quotes/[id]/convert] POST error:", err);
    return NextResponse.json({ error: "계약 전환 실패" }, { status: 500 });
  }
}
