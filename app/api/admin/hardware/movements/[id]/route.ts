import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalDate,
  readOptionalString,
  readRequestBody,
  readRequiredEnum,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import {
  confirmPlannedHardwareMovement,
  voidHardwareMovement,
} from "@/lib/repositories/hardware-inventory"

const HARDWARE_MOVEMENT_ACTIONS = ["confirm-planned", "void"] as const

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const action = readRequiredEnum(body, "action", "원장 액션", HARDWARE_MOVEMENT_ACTIONS)

    if (action === "confirm-planned") {
      const movement = await confirmPlannedHardwareMovement(id, {
        occurredAt: readOptionalDate(body, "occurredAt", "출고일"),
        actor: admin.name ?? admin.userId ?? admin.role,
      })
      return NextResponse.json({ movement })
    }

    const movement = await voidHardwareMovement(id, {
      reason: readOptionalString(body, "reason", "취소 사유"),
      actor: admin.name ?? admin.userId ?? admin.role,
    })
    return NextResponse.json({ movement })
  } catch (error) {
    return toErrorResponse(error, "Failed to update hardware movement")
  }
}
