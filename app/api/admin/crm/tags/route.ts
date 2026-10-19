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
import { listActiveAutoTagLabels } from "@/lib/repositories/crm-saved-segments"

// 세그먼트 자동 태그 라벨 보호(세그먼트 허브, 2026-09-25) — 저장 세그먼트가 매일 자동으로 붙이는 라벨을 여기서
// 이름 변경·병합하면, 다음 날 자동 떼기·붙이기가 되돌린다(마커 행의 라벨이 바뀌어 "옛 라벨"로 보인다). 그래서 from 에
// 활성 자동 라벨이 있으면 409 로 막고 세그먼트 허브에서 라벨을 바꾸라고 안내한다. 세그먼트 표를 못 읽으면 막지 않는다
// (태그 관리가 세그먼트 표 장애에 묶이지 않게 — 최악은 다음 날 세그먼트가 옛 라벨을 다시 붙여 두 라벨이 함께 남는 것.
// 이름을 바꾼 행은 아래 규칙으로 사람 소유가 돼 자동 떼기가 지우지 않는다).
// to 가 자동 라벨(켜짐·꺼짐·보관 무관)인 병합은 막지 않는다 — 정당한 정리 작업이다. 대신 저장소가 대상의 `to` 가 자동
// 태그 마커 행뿐이면 그 행을 사람 소유로 넘긴 뒤 사람 행을 정리한다(사람 라벨이 마커 행에 흡수돼 자동 떼기로 사라지지
// 않게). 꺼지거나 보관된 세그먼트의 라벨(from — 409 대상 아님)을 이름 변경·병합해 마커 행이 `to` 로 남을 때도 이름과
// 함께 소유를 실행한 사람으로 넘긴다(그 세그먼트를 다시 켜 떼기가 돌거나 detach 해도 사람이 정리한 라벨이 남게 —
// lib/repositories/crm-customer-tags.ts consolidateCustomerTags). 그래서 실행한 사람(actor)을 넘긴다.
async function autoTagLabelConflict(fromTags: readonly string[]): Promise<NextResponse | null> {
  let labels: Awaited<ReturnType<typeof listActiveAutoTagLabels>> = []
  try {
    labels = await listActiveAutoTagLabels()
  } catch (error) {
    console.warn("[PATCH /api/admin/crm/tags] 자동 태그 라벨 조회 실패", error instanceof Error ? error.name : "Error")
    return null
  }
  if (!Array.isArray(labels) || labels.length === 0) return null
  const groupKey = (tag: string) => tag.trim().replace(/\s+/g, " ").toLowerCase()
  const fromKeys = new Set(fromTags.map(groupKey))
  const hit = labels.find((entry) => fromKeys.has(groupKey(entry.label)))
  if (!hit) return null
  return NextResponse.json(
    {
      error: `'${hit.label}' 은(는) 세그먼트 '${hit.segmentName}' 이(가) 매일 자동으로 붙이는 라벨입니다. 세그먼트 허브에서 자동 태그 라벨을 바꿔 주세요.`,
      code: "auto_tag_label_locked",
      segmentId: hit.segmentId,
    },
    { status: 409 }
  )
}

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

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
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
  const actor = adminActorName(admin)

  if (action === "rename") {
    const fromRaw = typeof body?.from === "string" ? body.from : ""
    const toRaw = typeof body?.to === "string" ? body.to : ""
    const validated = validateRenameInput(fromRaw, toRaw)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const locked = await autoTagLabelConflict([validated.from])
    if (locked) return locked

    try {
      const result: TagBulkResult = await renameCustomerTag(validated.from, validated.to, { dryRun, actor })
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
    const locked = await autoTagLabelConflict(validated.from)
    if (locked) return locked

    try {
      const result: TagBulkResult = await mergeCustomerTags(validated.from, validated.to, { dryRun, actor })
      return NextResponse.json({ ...result, dryRun, from: validated.from, to: validated.to })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] merge", error)
      return NextResponse.json({ error: "태그 병합에 실패했습니다." }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "action은 rename 또는 merge여야 합니다." }, { status: 400 })
}
