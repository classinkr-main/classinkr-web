import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { parseUnifiedCustomerKeyList } from "@/lib/crm/unified-customer-key"
import {
  addCustomerTagToTargets,
  removeCustomerTagFromTargets,
  type CrmBulkTagResult,
} from "@/lib/repositories/crm-customer-tags"

// POST /api/admin/crm/tags/bulk — 통합 고객 목록에서 고른 고객들에게 태그 하나를 한 번에 붙이거나 뗀다(SG6).
//
// 요청: { keys: string[], label: string, action?: "add" | "remove" }
//  - keys: 통합 고객 행 키(`lead:<uuid>` · `neo:<accountId>` · `customer:<uuid>`). 앞뒤 공백을 떼고 중복을
//    제거한 뒤 최대 500개(초과 400). 해석 못 하는 키는 거절하지 않고 invalid 로 되돌려 준다.
//  - label: 단건 태그와 같은 정규화(앞뒤 공백 제거·연속 공백 1칸) 후 1~40자. 단건 경로는 40자를 넘으면
//    조용히 자르지만, 일괄 쓰기는 수백 명에게 잘린 라벨이 퍼지므로 400 으로 거절한다.
//  - action: 기본 add.
// 응답(성공): { applied, skipped, invalid, failed, action, label }
//  - 이미 같은 태그(대소문자·공백 무시)가 있는 대상에 추가 / 태그가 없는 대상에서 제거 → skipped.
//  - failed: 쓰기가 실패한 대상의 행 키(부분 실패). 쓰기를 시도한 대상이 전부 실패하면 500.
// 캐시: 태그는 통합 스냅샷 Data Cache 에 들어있지 않고 저장소의 전체 태그 맵(30초 모듈 캐시)만 쓰기 뒤에
// 무효화하면 된다(단건 경로와 같다 — 저장소가 처리). 브라우저 GET 캐시는 lib/admin-client.ts 가
// "/api/admin/crm" 변경 요청 성공 시 CRM 스코프로 자동 무효화한다.
// 기록: 태그 행 created_by 에 작성자(단건 경로와 같은 관리자 이름)를 남기고, 서버 로그에 건수 요약을 남긴다.

const MAX_BULK_TAG_TARGETS = 500
const MAX_TAG_LENGTH = 40

type BulkTagAction = "add" | "remove"

function adminActorName(admin: { name?: string; userId?: string; role: string }) {
  return admin.name?.trim() || admin.userId || admin.role
}

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const raw = body as Record<string, unknown>

  const actionRaw = raw.action ?? "add"
  if (actionRaw !== "add" && actionRaw !== "remove") {
    return NextResponse.json({ error: "action은 add 또는 remove여야 합니다." }, { status: 400 })
  }
  const action: BulkTagAction = actionRaw

  if (typeof raw.label !== "string") {
    return NextResponse.json({ error: "태그를 입력하세요." }, { status: 400 })
  }
  const label = raw.label.trim().replace(/\s+/g, " ")
  if (!label) return NextResponse.json({ error: "태그를 입력하세요." }, { status: 400 })
  if (label.length > MAX_TAG_LENGTH) {
    return NextResponse.json({ error: `태그는 ${MAX_TAG_LENGTH}자 이하로 입력하세요.` }, { status: 400 })
  }

  const parsed = parseUnifiedCustomerKeyList(raw.keys, MAX_BULK_TAG_TARGETS)
  if (!parsed.ok) {
    return NextResponse.json(
      parsed.reason === "too_many" ? { error: parsed.error, limit: parsed.limit } : { error: parsed.error },
      { status: 400 }
    )
  }
  const { targets, invalid } = parsed

  if (targets.length === 0) {
    return NextResponse.json({ applied: 0, skipped: 0, invalid, failed: [], action, label })
  }

  const actor = adminActorName(admin)
  let result: CrmBulkTagResult
  try {
    result =
      action === "add"
        ? await addCustomerTagToTargets(targets, label, actor)
        : await removeCustomerTagFromTargets(targets, label)
  } catch (error) {
    console.error("[POST /api/admin/crm/tags/bulk]", error)
    return NextResponse.json(
      { error: action === "add" ? "태그 일괄 추가에 실패했습니다." : "태그 일괄 제거에 실패했습니다." },
      { status: 500 }
    )
  }

  console.info(
    `[POST /api/admin/crm/tags/bulk] actor=${actor} action=${action} targets=${targets.length} applied=${result.applied} skipped=${result.skipped} failed=${result.failed.length} invalid=${invalid.length}`
  )

  const payload = {
    applied: result.applied,
    skipped: result.skipped,
    invalid,
    failed: result.failed,
    action,
    label,
  }
  // 쓰기를 시도한 대상이 전부 실패했으면(반영 0건) 성공으로 보이지 않게 500 — 건수는 함께 싣는다.
  if (result.failed.length > 0 && result.applied === 0 && result.failed.length === targets.length - result.skipped) {
    return NextResponse.json(
      { ...payload, error: action === "add" ? "태그 일괄 추가에 실패했습니다." : "태그 일괄 제거에 실패했습니다." },
      { status: 500 }
    )
  }
  return NextResponse.json(payload)
}
