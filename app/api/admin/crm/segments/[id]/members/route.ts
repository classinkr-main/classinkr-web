import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { readStoredSegmentFilter } from "@/lib/crm/customer-segment-filter"
import type { SavedSegmentMembersResponse } from "@/lib/crm/saved-segment-api"
import { isSavedSegmentVisibleTo } from "@/lib/crm/saved-segments"
import { SavedSegmentsNotReadyError, getSavedSegment } from "@/lib/repositories/crm-saved-segments"
import { getCrmUnifiedCustomersForExport } from "@/lib/repositories/crm-unified-customers"

import {
  isSegmentId,
  segmentNotFoundResponse,
  segmentNotReadyReadResponse,
  segmentViewer,
} from "../../segment-response"

// GET /api/admin/crm/segments/[id]/members?limit=500 — 저장 세그먼트의 회원 행 키(추천순, 통합 목록과 같은 계산·정렬).
// "전체 선택" 뒤 일괄 라우트(tags/bulk 500 · tasks/bulk 200)의 입력이 된다. 역할 CRM_STAFF(보이는 세그먼트만).
// 키만 돌려준다(이름·연락처 없음). limit 기본 500, 최대 1,000 — 넘치면 truncated.

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1_000

type RouteContext = { params: Promise<{ id: string }> }

function parseLimit(value: string | null) {
  const parsed = Number(value ?? DEFAULT_LIMIT)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.max(1, Math.min(Math.floor(parsed), MAX_LIMIT))
}

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
        { error: "이 세그먼트는 새 판 조건으로 저장돼 이 배포에서 평가할 수 없습니다." },
        { status: 409 }
      )
    }

    const limit = parseLimit(new URL(req.url).searchParams.get("limit"))
    const result = await getCrmUnifiedCustomersForExport({ segment: read.filter }, limit)
    const body: SavedSegmentMembersResponse = {
      total: result.total,
      keys: result.rows.map((row) => row.key),
      truncated: result.truncated,
      limit,
    }
    // 곧바로 일괄 쓰기의 입력이 되므로 캐시하지 않는다.
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[GET /api/admin/crm/segments/[id]/members]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트 회원을 불러오지 못했습니다." }, { status: 500 })
  }
}
