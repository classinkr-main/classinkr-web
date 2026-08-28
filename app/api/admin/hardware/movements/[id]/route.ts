import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalDate,
  readOptionalNonNegativeInt,
  readOptionalNonNegativeNumber,
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  readRequiredPositiveInt,
  readRequiredString,
  readStringArray,
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
  confirmPlannedHardwareMovement,
  HARDWARE_MOVEMENT_TYPES,
  updateHardwareMovement,
  voidHardwareMovement,
} from "@/lib/repositories/hardware-inventory"

const HARDWARE_MOVEMENT_ACTIONS = ["confirm-planned", "void", "update"] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const action = readRequiredEnum(body, "action", "원장 액션", HARDWARE_MOVEMENT_ACTIONS)

    if (action === "confirm-planned") {
      const capabilityError = requireAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY)
      if (capabilityError) return capabilityError

      const movement = await confirmPlannedHardwareMovement(id, {
        occurredAt: readOptionalDate(body, "occurredAt", "출고일"),
        confirmQty: readOptionalNonNegativeInt(body, "confirmQty", "확정 수량"),
        actor: admin.name ?? admin.userId ?? admin.role,
      })
      await logAdminAudit({
        admin,
        action: "hardware.movement.finalize",
        targetType: "hardware_movement",
        targetId: id,
        payload: {
          confirmQty: typeof body.confirmQty === "number" ? body.confirmQty : null,
        },
      })
      return NextResponse.json({ movement })
    }

    if (action === "update") {
      // 예정 행 편집은 에디터 업무 — 실현 기록 수정·예정→실현 전환만 finalize 요구(리포에서 판정).
      const canFinalize = !requireAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY)
      const movement = await updateHardwareMovement(id, {
        itemId: readOptionalString(body, "itemId", "품목 ID"),
        productName: readRequiredString(body, "productName", "제품명"),
        movementType: readRequiredEnum(body, "movementType", "입출고 유형", HARDWARE_MOVEMENT_TYPES),
        quantity: readRequiredPositiveInt(body, "quantity", "수량"),
        occurredAt: readOptionalDate(body, "occurredAt", "처리일"),
        fromLocation: readOptionalString(body, "fromLocation", "출발 위치"),
        toLocation: readOptionalString(body, "toLocation", "도착 위치"),
        owner: readOptionalString(body, "owner", "담당자"),
        status: readOptionalString(body, "status", "상태"),
        referenceNo: readOptionalString(body, "referenceNo", "참조 번호"),
        memo: readOptionalString(body, "memo", "메모"),
        lotNo: readOptionalString(body, "lotNo", "물류 번호"),
        unitPrice: readOptionalNonNegativeNumber(body, "unitPrice", "단가(USD)"),
        amountUsd: readOptionalNonNegativeNumber(body, "amountUsd", "금액(USD)"),
        amountCny: readOptionalNonNegativeNumber(body, "amountCny", "금액(CNY)"),
        storageLocation: readOptionalString(body, "storageLocation", "보관 장소"),
        importer: readOptionalString(body, "importer", "수입자"),
        serials: readStringArray(body, "serials", "시리얼 번호"),
        createdBy: admin.name ?? admin.userId ?? admin.role,
      }, { canFinalize })
      // 원장 재작성도 확정·취소와 같은 감사 대상 — 무엇이 어떻게 바뀌었는지 최소 페이로드를 남긴다.
      await logAdminAudit({
        admin,
        action: "hardware.movement.update",
        targetType: "hardware_movement",
        targetId: id,
        payload: {
          productName: movement.product_name,
          movementType: movement.movement_type,
          quantity: movement.quantity,
          occurredAt: movement.occurred_at,
          status: movement.status,
        },
      })
      return NextResponse.json({ movement })
    }

    const capabilityError = requireAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY)
    if (capabilityError) return capabilityError

    const movement = await voidHardwareMovement(id, {
      reason: readOptionalString(body, "reason", "취소 사유"),
      actor: admin.name ?? admin.userId ?? admin.role,
    })
    await logAdminAudit({
      admin,
      action: "hardware.movement.void",
      targetType: "hardware_movement",
      targetId: id,
      payload: { reason: readOptionalString(body, "reason", "취소 사유") },
    })
    return NextResponse.json({ movement })
  } catch (error) {
    return toErrorResponse(error, "Failed to update hardware movement")
  }
}
