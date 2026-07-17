import { NextRequest, NextResponse } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
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
//
// R5 항목 3. 형제 라우트(heatmap/pipeline/kpi/data-quality/hw)와 달리 이 GET만 캐시 헤더
// 없이 NextResponse.json을 직접 썼다 — adminCachedJson(30초/스테일 120초)으로 맞춘다.
// 신선도 점검: 이 경로는 lib/admin-client.ts의 LONG_RUNNING_ADMIN_PATHS에 있지만 그
// 목록은 클라이언트 fetch 타임아웃만 끄는 용도라 캐시 여부와 무관하다. 실제 폴링 여부는
// SalesLedgerWorkbench.tsx에서 확인 — 이 GET은 마운트 시 1회만 호출되고(useEffect deps
// []) 반복 폴링 루프가 없다. 재동기화(POST)는 adminFetch의 mutation-scope 무효화를 탄다
// (resourceBaseFromUrl이 "/api/admin/branch"까지만 잘라 이 GET을 포함한 branch 전체
// 스코프를 60초간 no-cache로 우회) — POST 직후 재조회는 항상 서버 최신값을 받으므로
// 30초 캐시를 얹어도 "재동기화 → 즉시 반영" 경로는 깨지지 않는다. 남는 유일한 stale
// 창은 앱 밖 스크립트가 sales_ledger_active_sources를 직접 upsert하는 경우인데, 이는
// 아래 getActiveRevImportStatus가 이미 감내하는 10초 unstable_cache TTL과 같은 종류의
// 트레이드오프라 표준 30초 캐시를 그대로 적용한다(형제 라우트와 동일 정책 유지).
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, BRANCH_READ_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const status = await getActiveRevImportStatus()
    return adminCachedJson(status)
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
