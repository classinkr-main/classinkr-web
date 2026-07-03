import { NextRequest, NextResponse } from "next/server"

import { BRANCH_READ_ADMIN_API_ROLES, CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { captureRevDbImport, getActiveRevImportStatus } from "@/lib/repositories/sales-ledger-rev-import"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

function isMissingTableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes("does not exist") || message.includes("42p01") || message.includes("schema cache")
}

// 액티브 REV 소스 상태 — 워크벤치가 "동기화 후 재캡처를 이어 붙일지"를 서버 원장 기준으로
// 판별한다(localStorage 추정 금지: 시트 모드로 되돌린 배포를 조용히 DB-native로 재전환하는
// 사고 방지). 읽기 전용이므로 BRANCH_READ 롤까지 허용.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const status = await getActiveRevImportStatus()
    return NextResponse.json(status)
  } catch (error) {
    console.error("[GET /api/admin/branch/ledger/db-import]", error)
    const message = error instanceof Error ? error.message : "액티브 소스 조회에 실패했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
