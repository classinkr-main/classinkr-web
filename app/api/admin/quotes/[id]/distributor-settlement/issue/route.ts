import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import type { DistributorIssueReason } from "@/lib/distributor-settlements"
import { getDistributorSettlementByQuote } from "@/lib/repositories/distributor-settlements"
import { distributorActor, distributorWriteError, readJsonObject } from "@/lib/server/distributor-settlement-api"
import {
  distributorShareUrl,
  issueDistributorSettlement,
  loadQuoteContext,
  sendDistributorSettlementEmail,
} from "@/lib/server/distributor-settlement-issue"

// 총판용 견적서 발행(2026-10-23).
//
// POST {reason: "installation_completed" | "manual"} — 사람이 발행한다(설치 완료 처리 또는 지금 발행).
//      201 {settlement, shareUrl} · 409 이미 발행 · 422 발행 불가 사유(단가 미입력·견적 버전 변경 등) · 503 표 미적용.
// POST {action: "resend_email"} — 발행된 건의 총판 이메일을 다시 보낸다. 200 {settlement}.

type RouteParams = { params: Promise<{ id: string }> }

const MANUAL_REASONS = new Set<DistributorIssueReason>(["installation_completed", "manual"])

export async function POST(req: NextRequest, { params }: RouteParams) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params

  const body = (await readJsonObject(req)) ?? {}
  const actor = distributorActor(admin)

  try {
    if (body.action === "resend_email") {
      const read = await getDistributorSettlementByQuote(id)
      if (!read.available) return NextResponse.json({ error: read.warning }, { status: 503 })
      const settlement = read.value
      if (!settlement?.shareToken || (settlement.status !== "issued" && settlement.status !== "partial")) {
        return NextResponse.json({ error: "발행된 총판 견적서만 다시 보낼 수 있습니다." }, { status: 409 })
      }
      if (!settlement.distributorEmail) {
        return NextResponse.json({ error: "총판 이메일이 없습니다. 링크를 직접 전달해 주세요." }, { status: 422 })
      }
      const context = await loadQuoteContext(id)
      const updated = await sendDistributorSettlementEmail(settlement, {
        quoteNumber: context?.document.quote_number ?? "",
        customerName: context?.customerName ?? null,
        shareUrl: distributorShareUrl(settlement.shareToken, req.nextUrl.origin),
      })
      await logAdminAudit({
        admin,
        action: "quotes.distributor_settlement.resend_email",
        targetType: "distributor_settlement",
        targetId: settlement.id,
        payload: { quoteDocumentId: id, emailStatus: updated.emailStatus },
      })
      return NextResponse.json({ settlement: updated })
    }

    const reason = MANUAL_REASONS.has(body.reason as DistributorIssueReason)
      ? (body.reason as DistributorIssueReason)
      : "manual"
    const outcome = await issueDistributorSettlement({
      quoteDocumentId: id,
      reason,
      mode: "manual",
      actor,
      origin: req.nextUrl.origin,
    })

    switch (outcome.status) {
      case "issued":
        await logAdminAudit({
          admin,
          action: "quotes.distributor_settlement.issue",
          targetType: "distributor_settlement",
          targetId: outcome.settlement.id,
          payload: { quoteDocumentId: id, reason, totalAmount: outcome.settlement.totalAmount },
        })
        return NextResponse.json({ settlement: outcome.settlement, shareUrl: outcome.shareUrl }, { status: 201 })
      case "already_issued":
        return NextResponse.json(
          { error: "이미 발행된 총판 견적서입니다.", settlement: outcome.settlement },
          { status: 409 }
        )
      case "blocked":
        return NextResponse.json({ error: outcome.reason, settlement: outcome.settlement }, { status: 422 })
      case "skipped":
        return NextResponse.json({ error: outcome.reason }, { status: 422 })
      default:
        return NextResponse.json({ error: "원가을 먼저 저장해 주세요." }, { status: 404 })
    }
  } catch (error) {
    return distributorWriteError(error, "POST distributor-settlement/issue", "총판 견적서를 발행하지 못했습니다.")
  }
}
