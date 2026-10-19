import { NextRequest, NextResponse } from "next/server"

import { CRM_STAFF_ADMIN_API_ROLES, requireVerifiedAdminContext } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { logAdminAudit } from "@/lib/auth/audit"
import { readStoredSegmentFilter } from "@/lib/crm/customer-segment-filter"
import type {
  SavedSegmentDetailResponse,
  SavedSegmentMutationResponse,
} from "@/lib/crm/saved-segment-api"
import {
  canEditSavedSegment,
  canManageSavedSegmentAutoTag,
  isDegradedSegmentPoint,
  isSavedSegmentOwner,
  isSavedSegmentVisibleTo,
  segmentAutoTagMarker,
  validateSavedSegmentInput,
  type SavedSegmentRecord,
} from "@/lib/crm/saved-segments"
import { detachSegmentAutoTags } from "@/lib/repositories/crm-customer-tags"
import {
  SavedSegmentsNotReadyError,
  archiveSavedSegment,
  getSavedSegment,
  updateSavedSegment,
  type UpdateSavedSegmentPatch,
} from "@/lib/repositories/crm-saved-segments"

import {
  buildSingleSegmentItem,
  evaluateSegmentsLive,
  isSegmentId,
  loadSegmentDailyPoints,
  readJsonObject,
  segmentActor,
  segmentNotFoundResponse,
  segmentNotReadyReadResponse,
  segmentTrendOf,
  segmentViewer,
  segmentWriteErrorResponse,
  toSegmentListItem,
  todayKst,
} from "../segment-response"

// 세그먼트 허브(C안 ②, 2026-09-25) — 저장 세그먼트 상세·수정·보관.
//
// GET    — 역할 CRM_STAFF(보이는 세그먼트만). 상세 + 최근 56일 일별 점 + 라이브 평가(그룹별 건수·원천별 건수).
// PATCH  {name?, description?, spec?, visibility?, autoTag?:{enabled?, label?, untag?, detachExisting?}, restore?:true}
//        — 소유자, 또는 팀 세그먼트면 관리자(STAFF_ADMIN). 자동 태그 설정은 관리자만. 자동 태그가 켜진 세그먼트의
//        조건·공유 범위도 관리자만(조건을 바꾸면 매일 붙는 대상이 바뀐다). 조건을 바꾸면 spec_hash 가 바뀌어 추이가 끊긴다.
// DELETE ?detachAutoTags=1 — 보관(물리 삭제 아님, 운영 결정 §4). 자동 태그도 끈다(붙은 태그는 둔다 — detachAutoTags=1
//        이면 이 세그먼트가 붙인 자동 태그만 뗀다, 관리자만). 복구는 PATCH {restore:true}.
// 자동 태그·공유 범위 변경·보관·복구는 감사 로그로 남긴다.

type RouteContext = { params: Promise<{ id: string }> }

function visibleOrNull(segment: SavedSegmentRecord | null, viewer: ReturnType<typeof segmentViewer>) {
  return segment && isSavedSegmentVisibleTo(segment, viewer) ? segment : null
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!isSegmentId(id)) return NextResponse.json({ error: "세그먼트 id 형식이 올바르지 않습니다." }, { status: 400 })

  try {
    const viewer = segmentViewer(admin)
    let segment: SavedSegmentRecord | null
    try {
      segment = visibleOrNull(await getSavedSegment(id), viewer)
    } catch (error) {
      if (error instanceof SavedSegmentsNotReadyError) return segmentNotReadyReadResponse()
      throw error
    }
    if (!segment) return segmentNotFoundResponse()

    const today = todayKst()
    const [live, trends] = await Promise.all([
      evaluateSegmentsLive([segment]),
      loadSegmentDailyPoints([segment.id], today).catch(() => null),
    ])
    const result = live.results.get(segment.id) ?? null
    const points = trends?.pointsById.get(segment.id) ?? []
    const read = readStoredSegmentFilter(segment.spec, segment.specVersion)
    const groupCount = read.readable ? (read.filter.anyOf?.length ?? 0) : 0

    const body: SavedSegmentDetailResponse = {
      available: true,
      warning: trends && !trends.available ? trends.warning : null,
      generatedAt: new Date().toISOString(),
      live: live.status,
      segment: toSegmentListItem(segment, viewer, {
        count: result?.total ?? null,
        trend: segmentTrendOf(points, segment.specHash, today),
        trendDays: points.length,
      }),
      anyOfCounts: result?.anyOfCounts ?? new Array<number>(groupCount).fill(0),
      bySource: result?.bySource ?? { lead: 0, neo_account: 0, customer: 0, task: 0 },
      daily: points.map((point) => ({
        date: point.snapshotDate,
        total: point.total,
        specChanged: point.specHash !== segment.specHash,
        degraded: isDegradedSegmentPoint(point.flags),
        autoTagStatus: point.autoTagStatus,
      })),
    }
    // 강등된 응답(라이브 평가 실패·원천 미완성 스냅샷 → count=null·원천별 0 채움, 추이 실패)은 캐시하지 않는다.
    if (!live.status.ok || !trends || !trends.available) {
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } })
    }
    return adminCachedJson(body)
  } catch (error) {
    console.error("[GET /api/admin/crm/segments/[id]]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트를 불러오지 못했습니다." }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!isSegmentId(id)) return NextResponse.json({ error: "세그먼트 id 형식이 올바르지 않습니다." }, { status: 400 })

  const body = await readJsonObject(req)
  if (!body) return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 })

  try {
    const viewer = segmentViewer(admin)
    const segment = visibleOrNull(await getSavedSegment(id), viewer)
    if (!segment) return segmentNotFoundResponse()
    if (!canEditSavedSegment(segment, viewer)) {
      return NextResponse.json({ error: "이 세그먼트를 바꿀 권한이 없습니다." }, { status: 403 })
    }

    const autoTagTouched = body.autoTag !== undefined && body.autoTag !== null
    if (autoTagTouched && !canManageSavedSegmentAutoTag(segment, viewer)) {
      return NextResponse.json({ error: "자동 태그 설정은 관리자만 바꿀 수 있습니다." }, { status: 403 })
    }
    if (segment.autoTagEnabled && (body.spec !== undefined || body.visibility !== undefined) && !viewer.isStaffAdmin) {
      return NextResponse.json(
        { error: "자동 태그가 켜진 세그먼트의 조건·공유 범위는 관리자만 바꿀 수 있습니다." },
        { status: 403 }
      )
    }

    const read = readStoredSegmentFilter(segment.spec, segment.specVersion)
    if (!read.readable && body.spec !== undefined) {
      return NextResponse.json(
        { error: "이 세그먼트는 새 판 조건으로 저장돼 이 화면에서 조건을 바꿀 수 없습니다." },
        { status: 409 }
      )
    }

    const restore = body.restore === true
    const validated = validateSavedSegmentInput(body, "update", {
      visibility: segment.visibility,
      spec: read.readable ? read.filter : null,
      autoTagEnabled: segment.autoTagEnabled,
      autoTagLabel: segment.autoTagLabel,
      archived: Boolean(segment.archivedAt) && !restore,
    })
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const value = validated.value

    const nextVisibility = value.visibility ?? segment.visibility
    if (nextVisibility === "mine" && segment.visibility !== "mine") {
      // "내 것"으로 바꾸면 소유자 말고는 아무도 못 본다 — 소유자만, 소유자 id 가 있는 세그먼트만.
      if (!isSavedSegmentOwner(segment, viewer)) {
        return NextResponse.json({ error: "'내 것'으로 바꾸기는 소유자만 할 수 있습니다." }, { status: 403 })
      }
    }

    const patch: UpdateSavedSegmentPatch = { actor: segmentActor(admin) }
    if (value.name !== undefined) patch.name = value.name
    if (value.description !== undefined) patch.description = value.description
    if (value.spec !== undefined) patch.spec = value.spec
    if (value.visibility !== undefined) patch.visibility = value.visibility
    if (value.autoTag?.enabled !== undefined) patch.autoTagEnabled = value.autoTag.enabled
    if (value.autoTag?.label !== undefined) patch.autoTagLabel = value.autoTag.label
    if (value.autoTag?.untag !== undefined) patch.autoUntag = value.autoTag.untag
    if (restore) patch.restore = true

    const updated = await updateSavedSegment(id, patch)
    if (!updated) return segmentNotFoundResponse()

    // 붙은 자동 태그 떼기(관리자만 — autoTag 권한 검사를 이미 지났다). 이 세그먼트 마커 행만, 수동 태그는 그대로.
    let detached: number | null = null
    if (value.autoTag?.detachExisting === true) {
      const result = await detachSegmentAutoTags(segmentAutoTagMarker(id))
      detached = result.removed
    }

    const autoTagChanged =
      updated.autoTagEnabled !== segment.autoTagEnabled ||
      updated.autoTagLabel !== segment.autoTagLabel ||
      updated.autoUntag !== segment.autoUntag ||
      detached !== null
    if (autoTagChanged) {
      await logAdminAudit({
        admin,
        action: "crm.segments.auto_tag.update",
        targetType: "crm_saved_segment",
        targetId: id,
        payload: {
          name: updated.name,
          before: { enabled: segment.autoTagEnabled, label: segment.autoTagLabel, untag: segment.autoUntag },
          after: { enabled: updated.autoTagEnabled, label: updated.autoTagLabel, untag: updated.autoUntag },
          detached,
        },
      })
    }
    if (updated.visibility !== segment.visibility) {
      await logAdminAudit({
        admin,
        action: "crm.segments.visibility.update",
        targetType: "crm_saved_segment",
        targetId: id,
        payload: { name: updated.name, before: segment.visibility, after: updated.visibility },
      })
    }
    if (restore && segment.archivedAt) {
      await logAdminAudit({
        admin,
        action: "crm.segments.restore",
        targetType: "crm_saved_segment",
        targetId: id,
        payload: { name: updated.name },
      })
    }

    const response: SavedSegmentMutationResponse = { segment: await buildSingleSegmentItem(updated, viewer) }
    return NextResponse.json(response)
  } catch (error) {
    const mapped = segmentWriteErrorResponse(error)
    if (mapped) return mapped
    console.error("[PATCH /api/admin/crm/segments/[id]]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트를 바꾸지 못했습니다." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const admin = await requireVerifiedAdminContext(req, CRM_STAFF_ADMIN_API_ROLES)
  if (admin instanceof NextResponse) return admin
  const { id } = await params
  if (!isSegmentId(id)) return NextResponse.json({ error: "세그먼트 id 형식이 올바르지 않습니다." }, { status: 400 })

  try {
    const viewer = segmentViewer(admin)
    const segment = visibleOrNull(await getSavedSegment(id), viewer)
    if (!segment) return segmentNotFoundResponse()
    if (!canEditSavedSegment(segment, viewer)) {
      return NextResponse.json({ error: "이 세그먼트를 보관할 권한이 없습니다." }, { status: 403 })
    }
    const detach = new URL(req.url).searchParams.get("detachAutoTags") === "1"
    if (detach && !canManageSavedSegmentAutoTag(segment, viewer)) {
      return NextResponse.json({ error: "붙은 자동 태그 떼기는 관리자만 할 수 있습니다." }, { status: 403 })
    }

    // 이미 보관됐으면 다시 쓰지 않는다(멱등) — 떼기 요청만 따로 반영한다.
    const archived = segment.archivedAt ? segment : await archiveSavedSegment(id, segmentActor(admin))
    if (!archived) return segmentNotFoundResponse()
    const detached = detach ? (await detachSegmentAutoTags(segmentAutoTagMarker(id))).removed : 0

    await logAdminAudit({
      admin,
      action: "crm.segments.archive",
      targetType: "crm_saved_segment",
      targetId: id,
      payload: {
        name: archived.name,
        alreadyArchived: Boolean(segment.archivedAt),
        autoTagWasEnabled: segment.autoTagEnabled,
        autoTagLabel: segment.autoTagLabel,
        detachedAutoTags: detached,
      },
    })

    return NextResponse.json({ segment: await buildSingleSegmentItem(archived, viewer), detached })
  } catch (error) {
    const mapped = segmentWriteErrorResponse(error)
    if (mapped) return mapped
    console.error("[DELETE /api/admin/crm/segments/[id]]", error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "세그먼트를 보관하지 못했습니다." }, { status: 500 })
  }
}
