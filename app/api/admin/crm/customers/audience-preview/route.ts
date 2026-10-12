import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, STAFF_ADMIN_API_ROLES, hasAdminApiRole, requireVerifiedAdminContext } from "@/lib/admin-auth"
import type { SegmentAudiencePreview } from "@/lib/crm/segment-audience"
import { parseUnifiedQueryOptions } from "@/lib/crm/unified-query-options"
import {
  loadQueryAudiencePopulation,
  resolveSegmentAudiencePreview,
} from "@/lib/repositories/crm-segment-audience"

// POST /api/admin/crm/customers/audience-preview — 저장 전 조건의 메시지 발송 대상 미리보기(발송 1단계, 2026-09-25).
//
// 본문: { params: string } — 통합 목록 쿼리스트링(q · source · lifecycle · view · owner(__me 는 조회자 기준) · tag ·
//   includeUnconfirmed · 세그먼트 조건 + OR 그룹 · sort). 검색어 q 가 URL·접근 로그에 남지 않게 본문으로 받는다.
//   파서는 통합 목록·CSV 내보내기와 같은 lib/crm/unified-query-options.ts(같은 조건 = 같은 건수).
//   keys(선택 행)는 받지 않는다 — 조건 전체 기준이다. limit/offset/force 도 읽지 않는다.
// 응답: SegmentAudiencePreview(건수만 — 이메일·전화 원문·표본·행 키 없음), Cache-Control: no-store. segment.id 는 null
//   (저장되지 않은 조건은 메시지 탭으로 넘기지 않는다). 쓰기·감사 로그·발송 없음.
// 역할: CRM_STAFF(SUPER_ADMIN·ADMIN·BRANCH·EDITOR). viewer.canSend = SUPER_ADMIN·ADMIN.

const MAX_PARAMS_LENGTH = 4_000
const IGNORED_PARAMS = ["keys", "limit", "offset", "force"] as const

export async function POST(req: NextRequest) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin

  const body = (await req.json().catch(() => null)) as { params?: unknown } | null
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })
  }
  const raw = body.params ?? ""
  if (typeof raw !== "string" || raw.length > MAX_PARAMS_LENGTH) {
    return NextResponse.json({ error: "params 는 통합 목록 쿼리 문자열이어야 합니다." }, { status: 400 })
  }

  try {
    const searchParams = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw)
    for (const key of IGNORED_PARAMS) searchParams.delete(key)
    const options = await parseUnifiedQueryOptions(searchParams, admin)
    const population = await loadQueryAudiencePopulation(options)
    const preview: SegmentAudiencePreview = await resolveSegmentAudiencePreview(population, {
      id: null,
      name: null,
      archived: false,
      canSend: hasAdminApiRole(admin.role, STAFF_ADMIN_API_ROLES),
    })
    return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[POST /api/admin/crm/customers/audience-preview]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "발송 대상을 계산하지 못했습니다." }, { status: 500 })
  }
}
