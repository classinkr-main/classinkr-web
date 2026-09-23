import { NextRequest, NextResponse } from "next/server"

import { toErrorResponse } from "@/app/api/admin/hardware/_validation"
import {
  HARDWARE_EDITOR_ADMIN_API_ROLES,
  HARDWARE_FINALIZE_CAPABILITY,
  requireAdminCapability,
  requireVerifiedAdminContext,
} from "@/lib/admin-auth"
import { logAdminAudit } from "@/lib/auth/audit"
import { restoreHardwareSheetImportSnapshot } from "@/lib/repositories/hardware-inventory"
import { expireSyncCacheTags } from "@/lib/server/sync-cache-tags"

// 감사(2026-09-07 #4) — 스냅샷 복원 노출. 실행하면 현재 시트 이관 원장을 전부 지우고 스냅샷
// 시점으로 되돌리는 비가역 동작이라, 확정·취소와 같은 3중 방어를 그대로 적용한다:
//   1) UI가 hardware.finalize 없으면 버튼을 비활성(HistoryTabPanel/SnapshotRestorePanel)
//   2) 여기(서버)서 requireAdminCapability로 강제
//   3) 감사 로그(logAdminAudit)로 누가 언제 무엇을 복원했는지 남김
// RPC 자체도 fail-closed 가드(20260701_hardware_restore_snapshot_guard.sql — previous_sheet_
// movements가 비었으면 거부)라 4중 방어에 가깝다.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireVerifiedAdminContext(req, HARDWARE_EDITOR_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const capabilityError = requireAdminCapability(admin, HARDWARE_FINALIZE_CAPABILITY)
  if (capabilityError) return capabilityError

  try {
    const { id } = await params
    const actor = admin.name ?? admin.userId ?? admin.role
    const result = await restoreHardwareSheetImportSnapshot(id, actor)
    // 복원은 원장을 되돌린다 — 다음 조회가 옛(복원 전) 대시보드를 받지 않게 즉시 만료(하드웨어 라운드 2 S-2).
    expireSyncCacheTags("hardwareImport")

    await logAdminAudit({
      admin,
      action: "hardware.import.restore_snapshot",
      targetType: "hardware_sheet_import_snapshot",
      targetId: id,
      payload: { restoredCount: result.restoredCount, sheetWinsRevived: result.sheetWinsRevived ?? 0 },
    })

    return NextResponse.json({ restore: result })
  } catch (error) {
    return toErrorResponse(error, "Failed to restore hardware sheet import snapshot")
  }
}
