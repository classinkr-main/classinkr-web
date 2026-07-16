import { NextRequest, NextResponse } from "next/server"

import {
  HardwareApiValidationError,
  readOptionalDate,
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
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import {
  createHardwareMovementRows,
  HARDWARE_MOVEMENT_TYPES,
} from "@/lib/repositories/hardware-inventory"

function readOptionalRecord(body: Record<string, unknown>, key: string, label: string) {
  const value = body[key]
  if (value == null) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HardwareApiValidationError(`${label}은(는) 객체여야 합니다.`)
  }
  return value as Record<string, unknown>
}

function readMovementInput(body: Record<string, unknown>, createdBy: string | null) {
  const crmLink = readOptionalRecord(body, "crmLink", "CRM 연동 정보")
  return {
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
    createdBy,
    raw: crmLink ? { crmLink } : {},
  }
}

function readMovementBodies(body: Record<string, unknown>) {
  const value = body.movements
  if (value == null) return null
  if (!Array.isArray(value)) {
    throw new HardwareApiValidationError("기록 바구니는 배열이어야 합니다.")
  }
  if (value.length === 0) {
    throw new HardwareApiValidationError("기록 바구니에 저장할 항목이 없습니다.")
  }
  if (value.length > 50) {
    throw new HardwareApiValidationError("기록 바구니는 한 번에 최대 50건까지 저장할 수 있습니다.")
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new HardwareApiValidationError(`기록 바구니 ${index + 1}번째 항목은 객체여야 합니다.`)
    }
    return item as Record<string, unknown>
  })
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await readRequestBody(req)
    const createdBy = admin.name ?? admin.userId ?? admin.role
    const movementBodies = readMovementBodies(body)
    if (movementBodies) {
      const lineResults = []
      const movements = []

      for (const [index, movementBody] of movementBodies.entries()) {
        try {
          const input = readMovementInput(movementBody, createdBy)
          const createdMovements = await createHardwareMovementRows(input)
          movements.push(...createdMovements)
          lineResults.push({
            index,
            ok: true,
            productName: input.productName,
            quantity: input.quantity,
            movement: createdMovements[0],
            movements: createdMovements,
          })
        } catch (error) {
          lineResults.push({
            index,
            ok: false,
            productName:
              typeof movementBody.productName === "string" && movementBody.productName.trim()
                ? movementBody.productName.trim()
                : `#${index + 1}`,
            quantity:
              typeof movementBody.quantity === "number"
                ? movementBody.quantity
                : typeof movementBody.quantity === "string"
                  ? Number(movementBody.quantity) || null
                  : null,
            error: error instanceof Error ? error.message : "저장에 실패했습니다.",
          })
        }
      }

      const failed = lineResults.filter((result) => !result.ok).length
      const success = lineResults.length - failed
      const status = failed === 0 ? 201 : movements.length > 0 ? 207 : 422
      return NextResponse.json(
        { movements, lineResults, summary: { success, failed, created: movements.length } },
        { status }
      )
    }

    const createdMovements = await createHardwareMovementRows(readMovementInput(body, createdBy))
    return NextResponse.json({ movement: createdMovements[0], movements: createdMovements }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error, "Failed to create hardware movement")
  }
}
