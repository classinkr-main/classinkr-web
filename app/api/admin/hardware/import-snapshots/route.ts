import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import {
  BRANCH_READ_ADMIN_API_ROLES,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { listHardwareSheetImportSnapshots } from "@/lib/repositories/hardware-inventory"

// 감사(2026-09-07 #4) — 시트 이관 스냅샷 목록. 복원 자체(POST .../[id]/restore)는 hardware.finalize
// capability를 요구하지만, 이 GET은 대시보드와 같은 읽기 권한(BRANCH_READ_ADMIN_API_ROLES)만 있으면
// 된다 — "무엇을 복원할 수 있는지 보기"와 "실제로 복원하기"는 다른 위험 등급이다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const limitParam = Number(req.nextUrl.searchParams.get("limit"))
    const limit = Number.isInteger(limitParam) && limitParam > 0 && limitParam <= 50 ? limitParam : 10
    const snapshots = await listHardwareSheetImportSnapshots(limit)
    return NextResponse.json({ snapshots })
  } catch (error) {
    return toErrorResponse(error, "Failed to list hardware sheet import snapshots")
  }
}
