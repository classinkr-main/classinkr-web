import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalBoolean,
  readOptionalNonNegativeInt,
  readOptionalString,
  readOptionalStringArray,
  readRequestBody,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import { requireVerifiedAdminContext } from "@/lib/admin-auth"
import { updateHardwareItem } from "@/lib/repositories/hardware-inventory"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req)
  if (admin instanceof NextResponse) return admin

  try {
    const { id } = await params
    const body = await readRequestBody(req)
    const item = await updateHardwareItem(id, {
      reorderPoint: readOptionalNonNegativeInt(body, "reorderPoint", "최소재고"),
      leadTimeDays: readOptionalNonNegativeInt(body, "leadTimeDays", "리드타임"),
      category: readOptionalString(body, "category", "카테고리"),
      sku: readOptionalString(body, "sku", "SKU"),
      sourceAliases: readOptionalStringArray(body, "sourceAliases", "제품 alias"),
      active: readOptionalBoolean(body, "active", "사용 여부"),
    })

    return NextResponse.json({ item })
  } catch (error) {
    return toErrorResponse(error, "Failed to update hardware item")
  }
}
