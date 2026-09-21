import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { validateMergeInput, validateRenameInput } from "@/lib/crm/tag-admin"
import {
  listCustomerTagStats,
  mergeCustomerTags,
  renameCustomerTag,
  type TagBulkResult,
} from "@/lib/repositories/crm-customer-tags"

// T4 태그 관리 패널(§14) — GET은 전체 태그·건수 집계, PATCH는 이름 변경·병합을 대상 행 전부에
// 일괄 반영한다. 둘 다 되돌릴 수 없으므로(원래 태그 문자열이 사라진다), 패널은 커밋 전 같은
// PATCH를 `dryRun: true`로 한 번 태워 정확한 미리보기 건수("N건 변경"·"중복 M건 정리")를 받은
// 뒤에만 확인 버튼을 채운다. dryRun은 지정된 PATCH 계약({action, from, to})의 부가 옵션일 뿐
// 별도 액션이나 라우트를 추가하지 않는다 — 실제 업데이트/삭제 없이 같은 계산 경로를 태운다.
//
// 응답에 쓰이는 태그는 lib/repositories/crm-customer-tags.ts의 getAllCustomerTagsMap이 요청마다
// 새로 읽는 값이라(30초 자체 캐시, 쓰기 시 즉시 무효화) 통합 고객 목록의 Data Cache 스냅샷에는
// 태그가 들어있지 않다 — 그래서 이 라우트는 그 스냅샷 태그(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG)를
// revalidateTag하지 않는다. 브라우저 쪽 GET 캐시 무효화는 lib/admin-client.ts의
// invalidationScopesForUrl이 "/api/admin/crm"로 시작하는 모든 경로를 CRM 공용 스코프로 묶어
// 자동으로 처리한다(이 라우트를 위해 별도로 손댈 곳이 없다).

export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const tags = await listCustomerTagStats()
    return adminCachedJson({ tags, generatedAt: new Date().toISOString() })
  } catch (error) {
    console.error("[GET /api/admin/crm/tags]", error)
    return NextResponse.json({ error: "Failed to load CRM tags" }, { status: 500 })
  }
}

interface TagsPatchBody {
  action?: unknown
  from?: unknown
  to?: unknown
  dryRun?: unknown
}

export async function PATCH(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as TagsPatchBody | null
  const action = body?.action
  const dryRun = body?.dryRun === true

  if (action === "rename") {
    const fromRaw = typeof body?.from === "string" ? body.from : ""
    const toRaw = typeof body?.to === "string" ? body.to : ""
    const validated = validateRenameInput(fromRaw, toRaw)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    try {
      const result: TagBulkResult = await renameCustomerTag(validated.from, validated.to, { dryRun })
      return NextResponse.json({ ...result, dryRun, from: validated.from, to: validated.to })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] rename", error)
      return NextResponse.json({ error: "태그 이름 변경에 실패했습니다." }, { status: 500 })
    }
  }

  if (action === "merge") {
    const fromRaw = Array.isArray(body?.from) ? body.from.filter((value): value is string => typeof value === "string") : []
    const toRaw = typeof body?.to === "string" ? body.to : ""
    const validated = validateMergeInput(fromRaw, toRaw)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })

    try {
      const result: TagBulkResult = await mergeCustomerTags(validated.from, validated.to, { dryRun })
      return NextResponse.json({ ...result, dryRun, from: validated.from, to: validated.to })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] merge", error)
      return NextResponse.json({ error: "태그 병합에 실패했습니다." }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "action은 rename 또는 merge여야 합니다." }, { status: 400 })
}
