import "server-only"

import { NextResponse } from "next/server"

import { STAFF_ADMIN_API_ROLES, hasAdminApiRole, type VerifiedAdminContext } from "@/lib/admin-auth"
import {
  readStoredSegmentFilter,
  segmentFilterHasOr,
  segmentFilterQueryString,
  describeSegmentFilter,
} from "@/lib/crm/customer-segment-filter"
import type {
  CustomerSegmentFilter,
  SavedSegmentListItem,
  SavedSegmentLiveStatus,
  SegmentTrendPoint,
} from "@/lib/crm/saved-segment-api"
import {
  SEGMENT_AUTO_TAG_SCHEDULE_LABEL,
  SEGMENT_DETAIL_DAILY_DAYS,
  addDaysToDateKey,
  buildSegmentWeeklyTrend,
  canEditSavedSegment,
  canManageSavedSegmentAutoTag,
  isSavedSegmentOwner,
  kstDateKeyOf,
  type SavedSegmentDailyPoint,
  type SavedSegmentRecord,
  type SavedSegmentViewer,
} from "@/lib/crm/saved-segments"
import { DAILY_SYNC_STALE_AFTER_HOURS, isSyncStale } from "@/lib/crm/sync-freshness"
import {
  SAVED_SEGMENTS_NOT_READY_MESSAGE,
  SavedSegmentAutoTagLabelConflictError,
  SavedSegmentConstraintError,
  SavedSegmentsNotReadyError,
  listSavedSegmentDailyPoints,
} from "@/lib/repositories/crm-saved-segments"
import {
  evaluateCrmSegmentFilters,
  type CrmSegmentEvaluationBatch,
  type CrmSegmentFilterResult,
} from "@/lib/repositories/crm-unified-customers"

// 세그먼트 허브 API(app/api/admin/crm/segments/**) 공용 조립 — 레코드 → 응답 항목(lib/crm/saved-segment-api.ts 계약),
// 라이브 건수(스냅샷 캐시 위 일괄 평가), 8주 추이, 오류 → 응답 매핑. 라우트 파일이 아니다(Next 가 라우트로 보지 않는다).

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSegmentId(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export function segmentViewer(admin: Pick<VerifiedAdminContext, "userId" | "role">): SavedSegmentViewer {
  return { userId: admin.userId ?? null, isStaffAdmin: hasAdminApiRole(admin.role, STAFF_ADMIN_API_ROLES) }
}

export function segmentActor(admin: Pick<VerifiedAdminContext, "name" | "userId" | "role">): string {
  return admin.name?.trim() || admin.userId || admin.role
}

// ── 라이브 평가 ──────────────────────────────────────────────────────────────

export interface SegmentLiveEvaluation {
  status: SavedSegmentLiveStatus
  /** 세그먼트 id → 평가 결과(읽을 수 있는 조건만) */
  results: Map<string, CrmSegmentFilterResult>
}

const LIVE_UNAVAILABLE: SavedSegmentLiveStatus = { ok: false, compass: "skipped", neoStale: false, neoLatestSyncedAt: null }

/**
 * 핵심 원천 일부가 실패한 미완성 스냅샷(sources.complete=false — 예: 전환 고객·리드 읽기 실패)이나 라벨 읽기 실패
 * (sources.tagsOk=false)면 건수가 실제보다 작게 무너진다("kinds=customer" 는 0, 라벨 조건은 0). 그 값은 "지금 건수"가
 * 아니다 — ok:false 로 내려 라우트가 no-store 로 응답하고 화면은 lastCount 폴백·경고로 간다. 매일 잡은 같은 상황을
 * source_incomplete 로 표시한다. Compass·NEO 상태는 그대로 싣는다(화면 안내용).
 */
export function liveStatusOf(batch: CrmSegmentEvaluationBatch | null): SavedSegmentLiveStatus {
  if (!batch) return LIVE_UNAVAILABLE
  return {
    ok: batch.sources.complete && batch.sources.tagsOk,
    compass: batch.meta.compass,
    neoStale: isSyncStale(batch.sources.neoLatestSyncedAt, DAILY_SYNC_STALE_AFTER_HOURS),
    neoLatestSyncedAt: batch.sources.neoLatestSyncedAt,
  }
}

/**
 * 읽을 수 있는 세그먼트의 지금 건수 — 통합 스냅샷 캐시(60초)를 그대로 탄다(크론만 bypass). 실패하거나 스냅샷이
 * 미완성이면 ok:false 와 빈 결과(count=null — 화면은 lastCount 로 폴백 표기). 실패·과소 건수를 0·"지금 건수"로
 * 보이지 않는다.
 */
export async function evaluateSegmentsLive(segments: readonly SavedSegmentRecord[]): Promise<SegmentLiveEvaluation> {
  const readable: Array<{ id: string; filter: CustomerSegmentFilter }> = []
  for (const segment of segments) {
    const read = readStoredSegmentFilter(segment.spec, segment.specVersion)
    if (read.readable) readable.push({ id: segment.id, filter: read.filter })
  }
  try {
    const batch = await evaluateCrmSegmentFilters(readable.map((entry) => entry.filter))
    const status = liveStatusOf(batch)
    if (!status.ok) {
      console.warn("[crm-segments] 라이브 평가 원천 미완성 — 건수를 싣지 않는다", {
        complete: batch.sources.complete,
        tagsOk: batch.sources.tagsOk,
        leadsOk: batch.sources.leadsOk,
        neoAccountsOk: batch.sources.neoAccountsOk,
        portalCustomersOk: batch.sources.portalCustomersOk,
      })
      return { status, results: new Map() }
    }
    const results = new Map<string, CrmSegmentFilterResult>()
    readable.forEach((entry, index) => results.set(entry.id, batch.results[index]))
    return { status, results }
  } catch (error) {
    console.error("[crm-segments] 라이브 평가 실패", error instanceof Error ? error.name : "Error")
    return { status: LIVE_UNAVAILABLE, results: new Map() }
  }
}

// ── 추이 ─────────────────────────────────────────────────────────────────────

export interface SegmentTrendLoad {
  available: boolean
  warning: string | null
  pointsById: Map<string, SavedSegmentDailyPoint[]>
}

/** 최근 56일 일별 점(세그먼트별, 오래된 날 → 최근 날). 일별 표가 없으면 available:false(추이만 빈다). */
export async function loadSegmentDailyPoints(segmentIds: readonly string[], todayKst: string): Promise<SegmentTrendLoad> {
  const pointsById = new Map<string, SavedSegmentDailyPoint[]>()
  if (segmentIds.length === 0) return { available: true, warning: null, pointsById }
  const listed = await listSavedSegmentDailyPoints(segmentIds, addDaysToDateKey(todayKst, -(SEGMENT_DETAIL_DAILY_DAYS - 1)))
  if (!listed.available) return { available: false, warning: listed.warning, pointsById }
  for (const point of listed.points) {
    const list = pointsById.get(point.segmentId)
    if (list) list.push(point)
    else pointsById.set(point.segmentId, [point])
  }
  for (const list of pointsById.values()) list.sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1))
  return { available: true, warning: null, pointsById }
}

export function segmentTrendOf(points: readonly SavedSegmentDailyPoint[], specHash: string, todayKst: string): SegmentTrendPoint[] {
  return buildSegmentWeeklyTrend(
    points.map((point) => ({ date: point.snapshotDate, total: point.total, specHash: point.specHash, flags: point.flags })),
    specHash,
    todayKst
  )
}

export function todayKst(now: Date = new Date()) {
  return kstDateKeyOf(now)
}

// ── 응답 항목 ────────────────────────────────────────────────────────────────

const UNIFIED_LIST_PATH = "/admin/crm/customers/unified"

export function toSegmentListItem(
  segment: SavedSegmentRecord,
  viewer: SavedSegmentViewer,
  extras: { count: number | null; trend: SegmentTrendPoint[]; trendDays: number }
): SavedSegmentListItem {
  const read = readStoredSegmentFilter(segment.spec, segment.specVersion)
  const filter: CustomerSegmentFilter = read.readable ? read.filter : {}
  const andOnly = read.readable && !segmentFilterHasOr(filter)
  const fullQuery = segmentFilterQueryString(filter)
  return {
    id: segment.id,
    name: segment.name,
    description: segment.description,
    visibility: segment.visibility,
    owner: { userId: segment.ownerUserId, name: segment.ownerName },
    isMine: isSavedSegmentOwner(segment, viewer),
    canEdit: canEditSavedSegment(segment, viewer),
    canManageAutoTag: canManageSavedSegmentAutoTag(segment, viewer),
    // 읽을 수 없는 판이면 원본을 그대로 돌려준다(화면은 specReadable=false 로 "새 판 조건" 안내).
    spec: read.readable ? filter : ((segment.spec ?? {}) as CustomerSegmentFilter),
    specVersion: segment.specVersion,
    specReadable: read.readable,
    andOnly,
    labels: read.readable ? describeSegmentFilter(filter) : [],
    // 통합 목록은 or= 를 받아 같은 결과를 보이고 "OR 조건 포함 — 세그먼트 허브에서 편집"을 띄운다(편집은 AND 만).
    // 그래서 OR 세그먼트도 링크를 준다. 읽을 수 없는 판(새 어휘)만 링크가 없다.
    listHref: read.readable ? (fullQuery ? `${UNIFIED_LIST_PATH}?${fullQuery}` : UNIFIED_LIST_PATH) : null,
    count: extras.count,
    lastCount: segment.lastCount,
    lastEvaluatedAt: segment.lastEvaluatedAt,
    lastRunStatus: segment.lastRunStatus,
    lastRunDetail: segment.lastRunDetail,
    autoTag: {
      enabled: segment.autoTagEnabled,
      label: segment.autoTagLabel,
      untag: segment.autoUntag,
      scheduleLabel: SEGMENT_AUTO_TAG_SCHEDULE_LABEL,
    },
    trend: extras.trend,
    trendDays: extras.trendDays,
    archivedAt: segment.archivedAt,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
  }
}

/** 단건 응답 항목 — 라이브 건수(캐시)와 추이를 함께 붙인다. 어느 쪽이 실패해도 항목은 돌려준다. */
export async function buildSingleSegmentItem(
  segment: SavedSegmentRecord,
  viewer: SavedSegmentViewer
): Promise<SavedSegmentListItem> {
  const today = todayKst()
  const [live, trend] = await Promise.all([
    evaluateSegmentsLive([segment]),
    loadSegmentDailyPoints([segment.id], today).catch(() => null),
  ])
  const points = trend?.pointsById.get(segment.id) ?? []
  return toSegmentListItem(segment, viewer, {
    count: live.results.get(segment.id)?.total ?? null,
    trend: segmentTrendOf(points, segment.specHash, today),
    trendDays: points.length,
  })
}

// ── 오류 → 응답 ──────────────────────────────────────────────────────────────

/** 쓰기 오류 매핑 — 미적용 503 · 자동 라벨 중복 409 · 제약 위반 400. 그 밖은 null(호출부가 500). */
export function segmentWriteErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof SavedSegmentsNotReadyError) {
    return NextResponse.json({ error: SAVED_SEGMENTS_NOT_READY_MESSAGE }, { status: 503 })
  }
  if (error instanceof SavedSegmentAutoTagLabelConflictError) {
    return NextResponse.json({ error: error.message, code: "auto_tag_label_conflict" }, { status: 409 })
  }
  if (error instanceof SavedSegmentConstraintError) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  return null
}

/** 읽기 경로의 미적용 — 상세·회원은 대상이 있을 수 없으므로 404 + available:false + 안내. */
export function segmentNotReadyReadResponse() {
  return NextResponse.json(
    { error: SAVED_SEGMENTS_NOT_READY_MESSAGE, available: false, warning: SAVED_SEGMENTS_NOT_READY_MESSAGE },
    { status: 404 }
  )
}

export function segmentNotFoundResponse() {
  return NextResponse.json({ error: "세그먼트를 찾을 수 없습니다." }, { status: 404 })
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  return body as Record<string, unknown>
}
