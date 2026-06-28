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
import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  createHardwareMovement,
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

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  try {
    const body = await readRequestBody(req)
    const crmLink = readOptionalRecord(body, "crmLink", "CRM 연동 정보")
    const movement = await createHardwareMovement({
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
      raw: crmLink ? { crmLink } : {},
    })

    return NextResponse.json({ movement }, { status: 201 })
  } catch (error) {
    return toErrorResponse(error, "Failed to create hardware movement")
  }
}
