import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isTagCategory, validateMergeInput, validateRenameInput } from "@/lib/crm/tag-admin"
import {
  listCustomerTagStats,
  mergeCustomerTags,
  renameCustomerTag,
  type TagBulkResult,
} from "@/lib/repositories/crm-customer-tags"
import {
  applyAutoTagRules,
  listTagDefinitions,
  listTagRules,
  setTagRuleEnabled,
  syncTagDefinitionsOnRename,
  upsertTagDefinition,
} from "@/lib/repositories/crm-tag-rules"

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

// T5·T6(§11.3) — GET에 definitions(태그→범주·자동 여부)·rules(자동 태그 규칙 목록·마지막 실행)를
// additive로 얹는다. 셋 다 소규모 테이블 전량 조회라 한 응답에 묶어도 비용이 크지 않다.
export async function GET(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  try {
    const [tags, definitions, rules] = await Promise.all([
      listCustomerTagStats(),
      listTagDefinitions(),
      listTagRules(),
    ])
    return adminCachedJson({ tags, definitions, rules, generatedAt: new Date().toISOString() })
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
  tag?: unknown
  category?: unknown
  ruleId?: unknown
  enabled?: unknown
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
      if (!dryRun) {
        // 정의 테이블 동기화는 best-effort — 실패해도 이미 커밋된 이름 변경 자체를 되돌리지
        // 않는다(별도 코어 경로 분리 원칙, db-migration-runbook.md 배포 순서 규칙과 같은 결).
        await syncTagDefinitionsOnRename([validated.from], validated.to).catch((syncError) => {
          console.error("[PATCH /api/admin/crm/tags] rename definition sync", syncError)
        })
      }
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
      if (!dryRun) {
        await syncTagDefinitionsOnRename(validated.from, validated.to).catch((syncError) => {
          console.error("[PATCH /api/admin/crm/tags] merge definition sync", syncError)
        })
      }
      return NextResponse.json({ ...result, dryRun, from: validated.from, to: validated.to })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] merge", error)
      return NextResponse.json({ error: "태그 병합에 실패했습니다." }, { status: 500 })
    }
  }

  // T6 — 태그 범주 즉시 변경(관리 패널 셀렉트).
  if (action === "set_category") {
    const tag = typeof body?.tag === "string" ? body.tag.trim() : ""
    const category = body?.category
    if (!tag) return NextResponse.json({ error: "태그가 필요합니다." }, { status: 400 })
    if (!isTagCategory(category)) {
      return NextResponse.json({ error: "올바른 범주를 선택하세요." }, { status: 400 })
    }
    try {
      const definition = await upsertTagDefinition(tag, category)
      return NextResponse.json({ definition })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] set_category", error)
      return NextResponse.json({ error: "태그 범주 변경에 실패했습니다." }, { status: 500 })
    }
  }

  // T5 — 자동 태그 규칙 켜기/끄기.
  if (action === "set_rule_enabled") {
    const ruleId = typeof body?.ruleId === "string" ? body.ruleId.trim() : ""
    const enabledRaw = body?.enabled
    if (!ruleId || typeof enabledRaw !== "boolean") {
      return NextResponse.json({ error: "ruleId와 enabled(boolean)가 필요합니다." }, { status: 400 })
    }
    try {
      const rule = await setTagRuleEnabled(ruleId, enabledRaw)
      return NextResponse.json({ rule })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] set_rule_enabled", error)
      return NextResponse.json({ error: "규칙 상태 변경에 실패했습니다." }, { status: 500 })
    }
  }

  // T5 — "지금 미리보기". CRON_SECRET 없이도(관리자 인증만으로) applyAutoTagRules를
  // dryRun으로 태워 실제 적용/제거 건수를 보여준다. 별도 라우트를 만들지 않는다.
  if (action === "preview_rules") {
    try {
      const report = await applyAutoTagRules({ dryRun: true })
      return NextResponse.json({ report })
    } catch (error) {
      console.error("[PATCH /api/admin/crm/tags] preview_rules", error)
      return NextResponse.json({ error: "규칙 미리보기 계산에 실패했습니다." }, { status: 500 })
    }
  }

  return NextResponse.json(
    { error: "action은 rename, merge, set_category, set_rule_enabled, preview_rules 중 하나여야 합니다." },
    { status: 400 }
  )
}
