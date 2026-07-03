import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { captureRevDbImport } from "@/lib/repositories/sales-ledger-rev-import"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("does not exist") || message.includes("42p01") || message.includes("schema cache")
}

// REV 자체 DB화 재동기화: 시트 미러(branch_rev_deals)를 버전드 DB 임포트로 스냅샷하고
// active_sources를 그 런으로 전환한다. 이후 REV는 그 DB 임포트를 원천으로 읽는다.
export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const result = await captureRevDbImport(adminActorName(admin))
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: "DB 임포트 테이블이 아직 준비되지 않았습니다. sales_ledger_db_native_import 마이그레이션을 적용하세요." },
        { status: 503 },
      )
    }
    console.error("[POST /api/admin/branch/ledger/db-import]", error)
    const message = error instanceof Error ? error.message : "DB 재동기화에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
