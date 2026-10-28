import { NextRequest, NextResponse } from "next/server"

import {
  HardwareApiValidationError,
  readOptionalBoolean,
  readOptionalDate,
  readOptionalEnum,
  readOptionalNonNegativeInt,
  readOptionalNonNegativeNumber,
  readOptionalString,
  readOptionalUuid,
  readRequestBody,
  readRequiredEnum,
  readRequiredPositiveInt,
  readRequiredString,
  readStringArray,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
  toHardwareActor,
} from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { HARDWARE_OUTBOUND_TYPES } from "@/lib/hardware/inventory-process"
import { advanceDealForShippedMovementSafely } from "@/lib/orders/deal-stage"
import {
  confirmPlannedHardwareMovement,
  HARDWARE_MOVEMENT_TYPES,
  updateHardwareMovement,
  voidHardwareMovement,
  type ConfirmLotAllocationInput,
} from "@/lib/repositories/hardware-inventory"

const HARDWARE_MOVEMENT_ACTIONS = ["confirm-planned", "void", "update"] as const

/** 확정 물류번호 배정 — [{ lotNo, quantity }]. 없으면 undefined. */
function readLotAllocations(body: Record<string, unknown>): ConfirmLotAllocationInput[] | undefined {
  const value = body.lotAllocations
  if (value == null) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new HardwareApiValidationError("물류번호 배정은 1~20개 배열이어야 합니다.")
  }
  return value.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new HardwareApiValidationError(`물류번호 배정 ${index + 1}번째 항목이 올바르지 않습니다.`)
    }
    const record = entry as Record<string, unknown>
    return {
      lotNo: readRequiredString(record, "lotNo", "물류번호"),
      quantity: readRequiredPositiveInt(record, "quantity", "물류번호별 수량"),
    }
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const action = readRequiredEnum(body, "action", "원본 액션", HARDWARE_MOVEMENT_ACTIONS)

    // 권한(갭 문서 §7-2)은 저장소가 기록을 읽고 판정한다 — 배송 예정은 본인 건 또는 입고관리 권한자,
    // 실현 기록 수정·취소는 입고관리 권한자. 오더 승인·스냅샷 복원만 hardware.finalize 로 남는다.
    const actorContext = toHardwareActor(admin)

    if (action === "confirm-planned") {
      const movement = await confirmPlannedHardwareMovement(id, {
        occurredAt: readOptionalDate(body, "occurredAt", "출고일"),
        confirmQty: readOptionalNonNegativeInt(body, "confirmQty", "확정 수량"),
        actor: admin.name ?? admin.userId ?? admin.role,
        actorContext,
        lotNo: readOptionalString(body, "lotNo", "물류번호"),
        lotAllocations: readLotAllocations(body),
      })
      // 오더로 만든 배송 예정이면 그 딜을 설치 단계로 올린다(전진만, 실패해도 확정은 그대로).
      await advanceDealForShippedMovementSafely(movement)
      await logAdminAudit({
        admin,
        action: "hardware.movement.finalize",
        targetType: "hardware_movement",
        targetId: id,
        payload: {
          confirmQty: typeof body.confirmQty === "number" ? body.confirmQty : null,
          lotNo: movement.lot_no ?? null,
        },
      })
      return NextResponse.json({ movement })
    }

    if (action === "update") {
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
        outboundType: readOptionalEnum(body, "outboundType", "출고 유형", HARDWARE_OUTBOUND_TYPES),
        isFree: readOptionalBoolean(body, "isFree", "무상 여부"),
        customerId: readOptionalUuid(body, "customerId", "CRM 고객"),
        ownerUserId: readOptionalUuid(body, "ownerUserId", "담당자 계정"),
        expectedReturnAt: readOptionalDate(body, "expectedReturnAt", "반납 예정일"),
      }, { actor: actorContext })
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

    const movement = await voidHardwareMovement(id, {
      reason: readOptionalString(body, "reason", "취소 사유"),
      actor: admin.name ?? admin.userId ?? admin.role,
      actorContext,
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
