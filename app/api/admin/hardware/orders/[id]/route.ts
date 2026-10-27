import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  requireAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import {
  approveSalesOrder,
  cancelApprovedSalesOrder,
  rejectSalesOrder,
  remindRejectedSalesOrder,
  SalesOrderError,
} from "@/lib/repositories/sales-orders"

// remind = 반려된 오더를 영업 쪽에 다시 알린다(반려 때 한 번은 자동으로 나간다 — 반려·취소 카드의 "다시 알리기").
const ORDER_ACTIONS = ["approve", "reject", "cancel", "remind"] as const

/**
 * 하드웨어 오더 승인·반려·취소. 하드웨어가 들어간 오더는 hardware.finalize 권한자(지금은 이왕찬 계정,
 * 비상 시 슈퍼 어드민)만 결정한다 — 2026-10-22 운영자 결정. 결정은 감사 로그에 남는다.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const capabilityError = requireAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY)
  if (capabilityError) return capabilityError

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const action = readRequiredEnum(body, "action", "오더 액션", ORDER_ACTIONS)
    const reason = readOptionalString(body, "reason", "사유") ?? ""
    const actor = admin.name ?? admin.userId ?? admin.role

    const order =
      action === "approve"
        ? await approveSalesOrder(id, { actor })
        : action === "reject"
          ? await rejectSalesOrder(id, { actor, reason })
          : action === "cancel"
            ? await cancelApprovedSalesOrder(id, { actor, reason })
            : await remindRejectedSalesOrder(id, { actor })

    await logAdminAudit({
      admin,
      action: `hardware.order.${action}`,
      targetType: "sales_order",
      targetId: id,
      payload: { orderNo: order.orderNo, status: order.status, reason: reason || null },
    })
    return NextResponse.json({ order })
  } catch (error) {
    if (error instanceof SalesOrderError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return toErrorResponse(error, "오더를 처리하지 못했습니다.")
  }
}
