import { NextRequest, NextResponse } from "next/server"

import {
  readOptionalBoolean,
  readOptionalEnum,
  readOptionalNonNegativeInt,
  readOptionalString,
  readOptionalStringArray,
  readRequestBody,
  toErrorResponse,
} from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  requireHardwareInventoryManager,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { HARDWARE_REPORT_GROUPS } from "@/lib/hardware/inventory-process"
import { updateHardwareItem } from "@/lib/repositories/hardware-inventory"

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  // 품목 설정(최소재고·물류번호 관리·보고 묶음 등)은 입고관리 권한자만(갭 문서 §7-2).
  const forbidden = requireHardwareInventoryManager(admin)
  if (forbidden) return forbidden

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
      lotTracked: readOptionalBoolean(body, "lotTracked", "물류번호 관리"),
      reportGroup: readOptionalEnum(body, "reportGroup", "보고 묶음", HARDWARE_REPORT_GROUPS),
      sortOrder: body.sortOrder === null ? null : readOptionalNonNegativeInt(body, "sortOrder", "정렬 순서"),
    })

    return NextResponse.json({ item })
  } catch (error) {
    return toErrorResponse(error, "Failed to update hardware item")
  }
}
