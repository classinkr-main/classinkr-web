import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, STAFF_ADMIN_API_ROLES, hasAdminApiRole, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { readStoredSegmentFilter } from "@/lib/crm/customer-segment-filter"
import type { SegmentAudiencePreview } from "@/lib/crm/segment-audience"
import { isSavedSegmentVisibleTo } from "@/lib/crm/saved-segments"
import { SavedSegmentsNotReadyError, getSavedSegment } from "@/lib/repositories/crm-saved-segments"
import {
  loadSavedSegmentAudiencePopulation,
  resolveSegmentAudiencePreview,
} from "@/lib/repositories/crm-segment-audience"

import {
  isSegmentId,
  segmentNotFoundResponse,
  segmentNotReadyReadResponse,
  segmentViewer,
} from "../../segment-response"

// GET /api/admin/crm/segments/[id]/audience-preview — 저장 세그먼트의 메시지 발송 대상 미리보기(발송 1단계, 2026-09-25).
//
// 저장된 조건(스펙 v1 = 세그먼트 조건만)을 허브 일괄 평가와 같은 모집단으로 풀고, 원천(leads·customers·NEO 스냅샷)에서
// 연락처를 다시 읽어 동의 규칙(구독 active 만 · 프로필 동의만 제외 · 해지 우선 · 조회 실패 = 거부)으로 건수만 센다.
// 응답 = SegmentAudiencePreview(lib/crm/segment-audience.ts) — 이메일·전화 원문·표본·행 키 없음. 발송·쓰기·감사 로그 없음.
// 역할: CRM_STAFF(보이는 세그먼트만 — 남의 '내 것'은 404). viewer.canSend = SUPER_ADMIN·ADMIN(메시지 탭 넘김 가능).
// 오류: id 가 UUID 가 아니면 400, 표 미적용·없음·안 보임 404, 새 조건 판 409.

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!isSegmentId(id)) return NextResponse.json({ error: "세그먼트 id 형식이 올바르지 않습니다." }, { status: 400 })

  try {
    let segment
    try {
      segment = await getSavedSegment(id)
    } catch (error) {
      if (error instanceof SavedSegmentsNotReadyError) return segmentNotReadyReadResponse()
      throw error
    }
    if (!segment || !isSavedSegmentVisibleTo(segment, segmentViewer(admin))) return segmentNotFoundResponse()
    const read = readStoredSegmentFilter(segment.spec, segment.specVersion)
    if (!read.readable) {
      return NextResponse.json(
        { error: "이 세그먼트는 새 판 조건으로 저장돼 이 배포에서 대상을 계산할 수 없습니다." },
        { status: 409 }
      )
    }

    const population = await loadSavedSegmentAudiencePopulation(read.filter)
    const body: SegmentAudiencePreview = await resolveSegmentAudiencePreview(population, {
      id: segment.id,
      name: segment.name,
      archived: Boolean(segment.archivedAt),
      canSend: hasAdminApiRole(admin.role, STAFF_ADMIN_API_ROLES),
    })
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[GET /api/admin/crm/segments/[id]/audience-preview]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "발송 대상을 계산하지 못했습니다." }, { status: 500 })
  }
}
