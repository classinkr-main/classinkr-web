// 세그먼트 허브(C안 ②, 2026-09-25) — 클라이언트 호출·정규화·표시 문구의 순수 헬퍼.
//
// 서버 계약은 lib/crm/saved-segment-api.ts(고정 타입)가 정본이다. 이 파일은 그 계약대로 부르고, 응답을
// 방어적으로 읽고(평평한 JSON 또는 { data } 봉투 — bulk-actions.ts 와 같은 unwrap 규약), 화면 문구를 만든다.
//  - GET/POST   /api/admin/crm/segments                 목록(범위·보관)·생성
//  - GET/PATCH/DELETE /api/admin/crm/segments/[id]       상세·수정(자동 태그 포함)·보관
//  - POST       /api/admin/crm/segments/[id]/run         { dryRun } — 자동 태그 미리보기/적용
//  - GET        /api/admin/crm/segments/[id]/members     추천순 행 키 → 일괄 태그·할 일·담당 배정 입력
// 일괄 행동은 기존 라우트를 그대로 쓴다(계약 불변): tags/bulk(500) · tasks/bulk(200) · customers/export(관리자만) ·
// leads/assignment-preview → leads/bulk-assign(리드만, 안전 미리보기 토큰 필수). 메시지 발송은 이 화면에 없다.
//
// OR 필터 URL 규약(기본 키 그대로 + `or=<그룹 정규형 쿼리>` 반복)은 서버 모듈 lib/crm/customer-segment-filter.ts
// 가 정본이다. 허브는 미리보기·CSV URL 을 만들 때만 같은 모양으로 싣는다(서버가 다시 파싱·정규화한다).

import { adminFetchJson, adminFetchJsonCached, clearAdminRequestCache, getCachedAdminJson } from "@/lib/admin-client"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import {
  SEGMENT_KIND_LABELS,
  activeSegmentConditionKeys,
  describeSegmentSpec,
  normalizeSegmentSpec,
  segmentSpecQueryString,
  type CustomerSegmentSpec,
  type SegmentConditionKey,
} from "@/lib/crm/customer-segment-spec"
import {
  SAVED_SEGMENT_DESCRIPTION_MAX,
  SAVED_SEGMENT_NAME_MAX,
  SEGMENT_OR_MAX_GROUPS,
  withSegmentAllOwners,
  type CustomerSegmentFilter,
  type SavedSegmentAutoTag,
  type SavedSegmentCreateRequest,
  type SavedSegmentDetailResponse,
  type SavedSegmentListItem,
  type SavedSegmentListResponse,
  type SavedSegmentLiveStatus,
  type SavedSegmentMembersResponse,
  type SavedSegmentRunDetail,
  type SavedSegmentRunResponse,
  type SavedSegmentScope,
  type SavedSegmentUpdateRequest,
  type SavedSegmentVisibility,
  type SegmentAutoTagStatus,
  type SegmentQualityFlag,
  type SegmentTrendPoint,
} from "@/lib/crm/saved-segment-api"
import {
  describeSegmentFilter,
  isSegmentFilterEmpty,
  normalizeSegmentFilter,
  segmentFilterGroups,
  segmentFilterHasOr,
  segmentFilterQueryString,
  segmentFilterTags,
} from "@/lib/crm/customer-segment-filter"
import { parseUnifiedCustomerTargetKey } from "@/lib/crm/unified-customer-key"
import type { CrmUnifiedCustomerSource } from "@/lib/crm/unified-view-rules"
import { BULK_TAG_MAX_KEYS, BULK_TAG_MAX_LENGTH, BULK_TASK_MAX_KEYS, BULK_TASK_TITLE_MAX_LENGTH } from "../unified/bulk-actions"
import { UNIFIED_CUSTOMERS_PATH } from "../unified/shared"

// ── 경로·상수 ────────────────────────────────────────────────────────────────

export const SEGMENTS_API = "/api/admin/crm/segments"
export const SEGMENT_HUB_PATH = "/admin/crm/customers/segments"
/** 태그 관리(고객DB 보조탭 — 전원 기본 숨김이지만 주소·⌘K 로 열린다). 태그 행동 결과의 확인 링크. */
export const CRM_TAG_ADMIN_PATH = "/admin/crm/customers/tags"
/** 현황(오늘 연락 패널) — "오늘 연락에 넣기" 결과의 확인 링크. */
export const CRM_TODAY_CONTACTS_PATH = "/admin/crm"
/** 미리보기 표 행 수(통합 목록 GET limit). */
export const SEGMENT_PREVIEW_LIMIT = 50
/** 일괄 행동별 회원 키 상한 — 라우트 상한과 같다(태그 500 · 할 일 200 · 담당 배정 500). */
export const SEGMENT_TAG_MEMBER_LIMIT = BULK_TAG_MAX_KEYS
export const SEGMENT_TASK_MEMBER_LIMIT = BULK_TASK_MAX_KEYS
export const SEGMENT_ASSIGN_MEMBER_LIMIT = 500
export const SEGMENT_AUTO_TAG_LABEL_MAX = BULK_TAG_MAX_LENGTH
/** "오늘 연락에 넣기" 할 일 기한 — 오늘 18:00 KST(2026-09-25 결정). */
export const SEGMENT_TASK_DUE_KST_HOUR = 18
export const SEGMENT_TASK_TITLE_PREFIX = "[세그먼트]"
export const SEGMENT_AUTO_TAG_DEFAULT_SCHEDULE = "매일 06시"

export const SEGMENT_SCOPE_OPTIONS: ReadonlyArray<{ key: SavedSegmentScope; label: string }> = [
  { key: "all", label: "전체" },
  { key: "team", label: "팀 공유" },
  { key: "mine", label: "내 것" },
]

export const SEGMENT_VISIBILITY_LABEL: Record<SavedSegmentVisibility, string> = {
  team: "팀 공유",
  mine: "내 것",
}

/** 표 미적용(available:false) 배너에 붙이는 안내 — 저장 대신 통합 목록 URL 로 공유. */
export const SEGMENT_NOT_READY_SHARE_HINT =
  "그동안 조건은 통합 목록 URL로 공유하세요 — 통합 목록에서 조건 칩을 고르면 주소창에 조건이 실립니다."

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 86_400_000

export type HubTone = "ok" | "warning" | "danger" | "idle"

// ── 응답 읽기(방어적) ───────────────────────────────────────────────────────

function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {}
  const record = body as Record<string, unknown>
  const inner = record.data
  if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner as Record<string, unknown>
  return record
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asCount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0
}

function asNullableCount(value: unknown): number | null {
  if (value == null) return null
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null
}

const AUTO_TAG_STATUSES: readonly SegmentAutoTagStatus[] = [
  "off",
  "applied",
  "partial",
  "failed",
  "skipped_neo_stale",
  "skipped_degraded",
  "skipped_too_many",
  "skipped_spike",
  "skipped_unreadable",
  "skipped_time_budget",
]

const QUALITY_FLAGS: readonly SegmentQualityFlag[] = [
  "compass_down",
  "compass_partial",
  "source_incomplete",
  "neo_stale",
  "truncated",
]

function asAutoTagStatus(value: unknown): SegmentAutoTagStatus | null {
  return typeof value === "string" && (AUTO_TAG_STATUSES as readonly string[]).includes(value)
    ? (value as SegmentAutoTagStatus)
    : null
}

function asFlags(value: unknown): SegmentQualityFlag[] {
  return Array.isArray(value)
    ? value.filter((flag): flag is SegmentQualityFlag => (QUALITY_FLAGS as readonly string[]).includes(String(flag)))
    : []
}

function asBySource(value: unknown): Record<CrmUnifiedCustomerSource, number> {
  const record = asRecord(value)
  // 계약 타입(Record<CrmUnifiedCustomerSource, number>)이 우선순위 원천의 task 키까지 요구한다 — 세그먼트는
  // 고객 행(리드·NEO·전환 고객)만 세므로 보통 0 이다.
  return {
    lead: asCount(record.lead),
    neo_account: asCount(record.neo_account),
    customer: asCount(record.customer),
    task: asCount(record.task),
  }
}

function asTrend(value: unknown): SegmentTrendPoint[] {
  if (!Array.isArray(value)) return []
  return value.map((raw) => {
    const point = asRecord(raw)
    return {
      weekEnd: asString(point.weekEnd) ?? "",
      total: asNullableCount(point.total),
      specChanged: point.specChanged === true,
      degraded: point.degraded === true,
    }
  })
}

function asRunDetail(value: unknown): SavedSegmentRunDetail | null {
  if (!value || typeof value !== "object") return null
  const record = asRecord(value)
  return {
    tagged: asCount(record.tagged),
    untagged: asCount(record.untagged),
    failed: asCount(record.failed),
    invalid: asCount(record.invalid),
    flags: asFlags(record.flags),
    blockedUntag: record.blockedUntag === true,
  }
}

function asAutoTag(value: unknown): SavedSegmentAutoTag {
  const record = asRecord(value)
  return {
    enabled: record.enabled === true,
    label: asString(record.label),
    untag: record.untag === true,
    scheduleLabel: asString(record.scheduleLabel) ?? SEGMENT_AUTO_TAG_DEFAULT_SCHEDULE,
  }
}

function asFilter(value: unknown): CustomerSegmentFilter {
  const record = asRecord(value)
  const base = normalizeSegmentSpec(record as CustomerSegmentSpec)
  const groups = Array.isArray(record.anyOf)
    ? (record.anyOf as unknown[]).map((group) => normalizeSegmentSpec(asRecord(group) as CustomerSegmentSpec))
    : []
  return groups.length ? { ...base, anyOf: groups } : base
}

/** 목록·상세·변경 응답의 세그먼트 한 개. id 가 없으면 null(그리지 않는다). */
export function normalizeSegmentItem(raw: unknown): SavedSegmentListItem | null {
  const record = asRecord(raw)
  const id = asString(record.id)
  if (!id) return null
  const owner = asRecord(record.owner)
  const visibility: SavedSegmentVisibility = record.visibility === "team" ? "team" : "mine"
  const spec = asFilter(record.spec)
  const specVersion = asCount(record.specVersion) || 1
  // 읽을 수 없는 판(서버가 specReadable:false) — asFilter 가 모르는 키를 버려 spec 이 넓어져 있다. 그 spec 에서 라벨·
  // 목록 링크를 파생하지 않는다(서버가 준 labels:[]·listHref:null 을 그대로 둔다).
  const specReadable = record.specReadable !== false
  const andOnly = typeof record.andOnly === "boolean" ? record.andOnly : !segmentFilterHasOr(spec)
  return {
    id,
    name: asString(record.name) ?? "(이름 없음)",
    description: asString(record.description),
    visibility,
    owner: { userId: asString(owner.userId), name: asString(owner.name) },
    isMine: record.isMine === true,
    canEdit: record.canEdit === true,
    canManageAutoTag: record.canManageAutoTag === true,
    spec,
    specVersion,
    specReadable,
    andOnly,
    labels: Array.isArray(record.labels)
      ? record.labels.filter((label): label is string => typeof label === "string")
      : specReadable
        ? describeSegmentFilter(spec)
        : [],
    listHref: specReadable ? (asString(record.listHref) ?? unifiedListHref(spec)) : null,
    count: asNullableCount(record.count),
    lastCount: asNullableCount(record.lastCount),
    lastEvaluatedAt: asString(record.lastEvaluatedAt),
    lastRunStatus: asAutoTagStatus(record.lastRunStatus),
    lastRunDetail: asRunDetail(record.lastRunDetail),
    autoTag: asAutoTag(record.autoTag),
    trend: asTrend(record.trend),
    trendDays: asCount(record.trendDays),
    archivedAt: asString(record.archivedAt),
    createdAt: asString(record.createdAt) ?? "",
    updatedAt: asString(record.updatedAt) ?? "",
  }
}

function asLive(value: unknown): SavedSegmentLiveStatus {
  const record = asRecord(value)
  const compass = record.compass
  return {
    ok: record.ok !== false,
    compass: compass === "down" || compass === "partial" || compass === "skipped" ? compass : "ok",
    neoStale: record.neoStale === true,
    neoLatestSyncedAt: asString(record.neoLatestSyncedAt),
  }
}

export function normalizeSegmentListResponse(body: unknown): SavedSegmentListResponse {
  const record = unwrap(body)
  const scopeCounts = asRecord(record.scopeCounts)
  const segments = Array.isArray(record.segments)
    ? record.segments.map(normalizeSegmentItem).filter((item): item is SavedSegmentListItem => item !== null)
    : []
  return {
    available: record.available !== false,
    warning: asString(record.warning),
    trendWarning: asString(record.trendWarning),
    generatedAt: asString(record.generatedAt) ?? new Date().toISOString(),
    scopeCounts: { all: asCount(scopeCounts.all), team: asCount(scopeCounts.team), mine: asCount(scopeCounts.mine) },
    live: asLive(record.live),
    segments,
  }
}

export function normalizeSegmentDetailResponse(body: unknown): SavedSegmentDetailResponse | null {
  const record = unwrap(body)
  const segment = normalizeSegmentItem(record.segment)
  if (!segment) return null
  return {
    available: record.available !== false,
    warning: asString(record.warning),
    generatedAt: asString(record.generatedAt) ?? new Date().toISOString(),
    live: asLive(record.live),
    segment,
    anyOfCounts: Array.isArray(record.anyOfCounts) ? record.anyOfCounts.map(asCount) : [],
    bySource: asBySource(record.bySource),
    daily: Array.isArray(record.daily)
      ? record.daily.map((raw) => {
          const point = asRecord(raw)
          return {
            date: asString(point.date) ?? "",
            total: asCount(point.total),
            specChanged: point.specChanged === true,
            degraded: point.degraded === true,
            autoTagStatus: asAutoTagStatus(point.autoTagStatus) ?? "off",
          }
        })
      : [],
  }
}

/**
 * 상세 응답의 원천별 건수를 믿을 수 있는지 — 라이브 평가가 성공하고 저장 조건 건수가 있을 때만 그대로, 아니면
 * null("모름"). 서버는 평가가 실패해도 200 에 bySource 를 0 으로 채워 보내므로(정규화도 빠진 필드를 0 으로 채운다)
 * 그대로 쓰면 "리드 0"과 "모름"이 섞여 담당 배정이 "배정할 리드가 없습니다"로 잘못 막힌다.
 * 건수가 있는데 원천 합이 0 이면(필드 누락·옛 서버) 역시 모름으로 본다.
 */
export function knownDetailBySource(
  detail: Pick<SavedSegmentDetailResponse, "live" | "segment" | "bySource"> | null | undefined
): Record<CrmUnifiedCustomerSource, number> | null {
  if (!detail || !detail.live.ok || detail.segment.count == null) return null
  const sum = (detail.bySource.lead ?? 0) + (detail.bySource.neo_account ?? 0) + (detail.bySource.customer ?? 0)
  if (detail.segment.count > 0 && sum === 0) return null
  return detail.bySource
}

/** 상세 응답의 OR 그룹 건수를 믿을 수 있는지 — knownDetailBySource 와 같은 조건(평가 실패의 0 채움을 쓰지 않는다). */
export function knownDetailAnyOfCounts(
  detail: Pick<SavedSegmentDetailResponse, "live" | "segment" | "anyOfCounts"> | null | undefined
): number[] | null {
  if (!detail || !detail.live.ok || detail.segment.count == null) return null
  return detail.anyOfCounts
}

export function normalizeRunResponse(body: unknown): SavedSegmentRunResponse {
  const record = unwrap(body)
  return {
    dryRun: record.dryRun === true,
    total: asCount(record.total),
    bySource: asBySource(record.bySource),
    flags: asFlags(record.flags),
    autoTagStatus: asAutoTagStatus(record.autoTagStatus) ?? "off",
    // 계약은 tagged/untagged 지만 설계 초안의 wouldTag/wouldUntag 이름도 읽는다(드라이런).
    tagged: asCount(record.tagged ?? record.wouldTag),
    untagged: asCount(record.untagged ?? record.wouldUntag),
    failed: asCount(record.failed),
    invalid: asCount(record.invalid),
  }
}

export function normalizeMembersResponse(body: unknown): SavedSegmentMembersResponse {
  const record = unwrap(body)
  const keys = Array.isArray(record.keys) ? record.keys.filter((key): key is string => typeof key === "string") : []
  return {
    total: asCount(record.total) || keys.length,
    keys,
    truncated: record.truncated === true,
    limit: asCount(record.limit) || keys.length,
  }
}

function mutationSegment(body: unknown): SavedSegmentListItem {
  const record = unwrap(body)
  const segment = normalizeSegmentItem(record.segment ?? record)
  if (!segment) throw new Error("세그먼트 응답을 읽지 못했습니다.")
  return segment
}

// ── OR 필터(기본 AND ∧ 그룹 OR) ────────────────────────────────────────────
// 정규화·URL·문구·신호 판정은 서버와 같은 순수 모듈(lib/crm/customer-segment-filter.ts)을 그대로 쓴다 — 사본을 두지 않는다.

// 담당: 세그먼트 건수는 전체 기준이라 세 URL 모두 전체 담당(`owner=`)을 밝힌다 — 통합 목록·API·CSV 는 owner 생략이
// 로그인 담당이다(2026-10-16 기본 담당 계약, lib/crm/saved-segment-api.ts withSegmentAllOwners).

/** 통합 목록 딥링크 — 같은 조건(AND + or= 반복)·전체 담당. */
export function unifiedListHref(filter: CustomerSegmentFilter | null | undefined): string | null {
  // 통합 목록은 or= 를 받아 같은 결과를 보이고 OR 안내를 띄운다(편집은 AND 만) — OR 세그먼트도 링크를 준다.
  return `${UNIFIED_CUSTOMERS_PATH}?${withSegmentAllOwners(segmentFilterQueryString(filter))}`
}

/** 허브 미리보기 — 통합 목록 GET(추천순 앞 50행 + 조건 요약), 전체 담당. */
export function segmentPreviewUrl(filter: CustomerSegmentFilter | null | undefined): string {
  const params = new URLSearchParams({ limit: String(SEGMENT_PREVIEW_LIMIT), offset: "0" })
  return `/api/admin/crm/customers/unified?${params.toString()}&${withSegmentAllOwners(segmentFilterQueryString(filter))}`
}

/** 세그먼트 CSV — 통합 고객 내보내기(관리자만)에 같은 조건·전체 담당을 싣는다. */
export function segmentExportUrl(filter: CustomerSegmentFilter | null | undefined): string {
  return `/api/admin/crm/customers/export?${withSegmentAllOwners(segmentFilterQueryString(filter))}`
}

export function segmentsListUrl(scope: SavedSegmentScope, archived: boolean): string {
  const params = new URLSearchParams()
  if (scope !== "all") params.set("scope", scope)
  if (archived) params.set("archived", "1")
  const qs = params.toString()
  return qs ? `${SEGMENTS_API}?${qs}` : SEGMENTS_API
}

export function segmentHubHref(id: string | null): string {
  return id ? `${SEGMENT_HUB_PATH}?id=${encodeURIComponent(id)}` : SEGMENT_HUB_PATH
}

// ── 편집 초안 ────────────────────────────────────────────────────────────────

export interface SegmentDraft {
  name: string
  description: string
  visibility: SavedSegmentVisibility
  /** 기본 조건(AND) */
  base: CustomerSegmentSpec
  /** OR 그룹 — 편집 중에는 빈 그룹도 둔다(저장 검증이 막는다). */
  groups: CustomerSegmentSpec[]
}

export function emptySegmentDraft(): SegmentDraft {
  return { name: "", description: "", visibility: "mine", base: {}, groups: [] }
}

export function draftFromSegment(item: SavedSegmentListItem): SegmentDraft {
  return {
    name: item.name,
    description: item.description ?? "",
    visibility: item.visibility,
    base: normalizeSegmentSpec(item.spec),
    groups: (item.spec.anyOf ?? []).map((group) => normalizeSegmentSpec(group)),
  }
}

/** 초안 → 저장 필터(정규형). */
export function draftToFilter(draft: Pick<SegmentDraft, "base" | "groups">): CustomerSegmentFilter {
  return normalizeSegmentFilter({ ...draft.base, anyOf: draft.groups })
}

/** 저장본과 달라졌는지 — 이름·설명·공유 범위·조건(정규형 문자열) 비교. 새 초안(item=null)은 항상 true. */
export function isDraftDirty(draft: SegmentDraft, item: SavedSegmentListItem | null): boolean {
  if (!item) return true
  if (draft.name.trim() !== item.name.trim()) return true
  if (draft.description.trim() !== (item.description ?? "").trim()) return true
  if (draft.visibility !== item.visibility) return true
  if (draft.groups.length !== (item.spec.anyOf ?? []).length) return true
  return segmentFilterQueryString(draftToFilter(draft)) !== segmentFilterQueryString(item.spec)
}

export function emptyGroupIndexes(groups: readonly CustomerSegmentSpec[]): number[] {
  return groups.flatMap((group, index) => (segmentSpecQueryString(group) === "" ? [index] : []))
}

/** 저장 전 검증 — 통과면 null, 아니면 인라인 문구(서버도 같은 규칙으로 400). */
export function validateSegmentDraft(
  draft: SegmentDraft,
  options: { autoTagEnabled?: boolean } = {}
): string | null {
  const name = draft.name.trim()
  if (!name) return "세그먼트 이름을 입력하세요."
  if (name.length > SAVED_SEGMENT_NAME_MAX) return `이름은 ${SAVED_SEGMENT_NAME_MAX}자 이하로 입력하세요.`
  if (draft.description.trim().length > SAVED_SEGMENT_DESCRIPTION_MAX) {
    return `설명은 ${SAVED_SEGMENT_DESCRIPTION_MAX}자 이하로 입력하세요.`
  }
  if (draft.groups.length > SEGMENT_OR_MAX_GROUPS) return `OR 그룹은 최대 ${SEGMENT_OR_MAX_GROUPS}개입니다.`
  const empty = emptyGroupIndexes(draft.groups)
  if (empty.length) return `빈 OR 그룹(${empty.map((index) => `그룹 ${index + 1}`).join("·")})이 있습니다 — 조건을 고르거나 그룹을 지우세요.`
  if (isSegmentFilterEmpty(draftToFilter(draft))) return "조건이 없으면 저장할 수 없습니다(통합 고객 전체와 같습니다)."
  if (options.autoTagEnabled && draft.visibility === "mine") {
    return "자동 태그가 켜진 세그먼트는 '내 것'으로 바꿀 수 없습니다 — 먼저 자동 태그를 끄세요."
  }
  return null
}

export function buildCreateRequest(draft: SegmentDraft): SavedSegmentCreateRequest {
  const description = draft.description.trim()
  return {
    name: draft.name.trim(),
    description: description || null,
    spec: draftToFilter(draft),
    visibility: draft.visibility,
  }
}

/** 바뀐 필드만 싣는 PATCH 본문 — 조건이 그대로면 spec 을 싣지 않는다(추이 끊김 방지). */
export function buildUpdateRequest(draft: SegmentDraft, item: SavedSegmentListItem): SavedSegmentUpdateRequest {
  const request: SavedSegmentUpdateRequest = {}
  const name = draft.name.trim()
  if (name !== item.name.trim()) request.name = name
  const description = draft.description.trim()
  if (description !== (item.description ?? "").trim()) request.description = description || null
  if (draft.visibility !== item.visibility) request.visibility = draft.visibility
  const filter = draftToFilter(draft)
  if (segmentFilterQueryString(filter) !== segmentFilterQueryString(item.spec)) request.spec = filter
  return request
}

// ── 조건별 건수(통합 목록 요약) ─────────────────────────────────────────────

export interface ConditionCountRow {
  key: string
  label: string
  count: number | null
}

/** 기본 조건 하나씩의 단독 건수(현재 베이스 기준) — 통합 목록 요약 conditionCounts. */
export function baseConditionCountRows(
  base: CustomerSegmentSpec,
  conditionCounts: Partial<Record<SegmentConditionKey, number>> | undefined
): ConditionCountRow[] {
  const normalized = normalizeSegmentSpec(base)
  return activeSegmentConditionKeys(normalized).map((key) => ({
    key,
    label: describeSegmentSpec({ [key]: normalized[key] } as CustomerSegmentSpec)[0] ?? key,
    count: conditionCounts?.[key] ?? null,
  }))
}

/**
 * 통합 목록 요약의 OR 그룹 건수(기본 ∧ 그룹 i, 서버 정규형 순서) — 서버가 anyOfCounts 를 아직 싣지 않으면
 * (옛 서버 — OR 을 모를 수 있다) null.
 */
export function readAnyOfCounts(summary: unknown): Array<number | null> | null {
  const raw = asRecord(summary).anyOfCounts
  return Array.isArray(raw) ? raw.map(asNullableCount) : null
}

/**
 * 서버 그룹 건수(정규형 순서 — 빈 그룹 제거·중복 제거·정렬)를 편집기 그룹 순서에 맞춘다.
 * serverGroups 는 서버가 그 건수를 잰 그룹(요약의 anyOf 메아리 또는 저장된 spec.anyOf). 없으면 허브의 정규형
 * 순서(segmentFilterGroups — 서버와 같은 정규화)로 가정한다. 빈 그룹·못 찾은 그룹은 null.
 */
export function alignGroupCounts(
  editorGroups: readonly CustomerSegmentSpec[],
  counts: ReadonlyArray<number | null>,
  serverGroups?: readonly CustomerSegmentSpec[] | null
): Array<number | null> {
  const order = (serverGroups ?? segmentFilterGroups({ anyOf: [...editorGroups] })).map((group) =>
    segmentSpecQueryString(group)
  )
  return editorGroups.map((group) => {
    const key = segmentSpecQueryString(group)
    if (!key) return null
    const index = order.indexOf(key)
    return index >= 0 ? (counts[index] ?? null) : null
  })
}

/** 통합 목록 요약이 OR 그룹을 메아리로 싣는지(anyOf) — 옛 서버면 null. */
export function readSummaryAnyOf(summary: unknown): CustomerSegmentSpec[] | null {
  const raw = asRecord(summary).anyOf
  return Array.isArray(raw) ? raw.map((group) => normalizeSegmentSpec(asRecord(group) as CustomerSegmentSpec)) : null
}

export function describeSpecShort(spec: CustomerSegmentSpec): string {
  const parts = describeSegmentSpec(spec)
  return parts.length ? parts.join(" · ") : "조건 없음"
}

// ── 회원 키 → 행동 대상 ─────────────────────────────────────────────────────

export interface MemberKeySplit {
  /** 리드 id(소문자 uuid) — 담당 배정 대상 */
  leadIds: string[]
  neoCount: number
  customerCount: number
  invalidCount: number
}

export function splitMemberKeys(keys: readonly string[]): MemberKeySplit {
  const leadIds: string[] = []
  const seen = new Set<string>()
  let neoCount = 0
  let customerCount = 0
  let invalidCount = 0
  for (const key of keys) {
    const target = parseUnifiedCustomerTargetKey(key)
    if (!target) {
      invalidCount += 1
      continue
    }
    if (target.targetType === "lead") {
      if (!seen.has(target.targetId)) {
        seen.add(target.targetId)
        leadIds.push(target.targetId)
      }
    } else if (target.targetType === "neo_account") neoCount += 1
    else customerCount += 1
  }
  return { leadIds, neoCount, customerCount, invalidCount }
}

/** "[세그먼트] 이름" — 할 일 제목 상한(120자)에 맞춘다. */
export function segmentTaskTitle(name: string): string {
  return `${SEGMENT_TASK_TITLE_PREFIX} ${name.trim()}`.slice(0, BULK_TASK_TITLE_MAX_LENGTH).trim()
}

/** 오늘(KST 날짜) hour:00 KST 의 UTC ISO — 호스트 타임존과 무관. */
export function kstTodayAtIso(hour: number, nowMs: number): string {
  const shifted = new Date(nowMs + KST_OFFSET_MS)
  const ms = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), hour, 0, 0) - KST_OFFSET_MS
  return new Date(ms).toISOString()
}

/** 추천순 앞 N명만 쓰는지 안내 — 잘리지 않았으면 null. */
export function memberTruncationNote(members: Pick<SavedSegmentMembersResponse, "total" | "keys" | "truncated">): string | null {
  if (!members.truncated && members.keys.length >= members.total) return null
  return `전체 ${members.total.toLocaleString("ko-KR")}명 중 추천순 앞 ${members.keys.length.toLocaleString("ko-KR")}명만(한 번 상한)`
}

// ── 표시 문구 ────────────────────────────────────────────────────────────────

function kstParts(iso: string | null | undefined) {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const shifted = new Date(ms + KST_OFFSET_MS)
  const pad = (value: number) => String(value).padStart(2, "0")
  return {
    dayKey: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    monthDay: `${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  }
}

/** "MM-DD"(KST). 읽지 못하면 null. */
export function formatKstMonthDay(iso: string | null | undefined): string | null {
  return kstParts(iso)?.monthDay ?? null
}

/** "오늘 06:02" · "어제 06:01" · "09-22 06:01"(KST). 없으면 "아직 없음". */
export function formatRunAt(iso: string | null | undefined, nowMs: number): string {
  const parts = kstParts(iso)
  if (!parts) return "아직 없음"
  const today = kstParts(new Date(nowMs).toISOString())
  const yesterday = kstParts(new Date(nowMs - DAY_MS).toISOString())
  if (today && parts.dayKey === today.dayKey) return `오늘 ${parts.time}`
  if (yesterday && parts.dayKey === yesterday.dayKey) return `어제 ${parts.time}`
  return `${parts.monthDay} ${parts.time}`
}

const AUTO_TAG_STATUS_TEXT: Record<SegmentAutoTagStatus, { text: string; tone: HubTone }> = {
  off: { text: "건수만 기록", tone: "idle" },
  applied: { text: "자동 태그 적용", tone: "ok" },
  partial: { text: "자동 태그 일부 실패", tone: "warning" },
  failed: { text: "실행 실패", tone: "danger" },
  skipped_neo_stale: { text: "건너뜀 — NEO 값 오래됨", tone: "warning" },
  skipped_degraded: { text: "건너뜀 — Compass 끊김·원천 불완전", tone: "warning" },
  skipped_too_many: { text: "건너뜀 — 1,000명 초과", tone: "warning" },
  // 급변(직전 정상 기록의 3배 초과·1/3 미만) 또는 복구 첫날(직전 기록이 전부 품질 저하라 비교 기준 없음) — 둘 다 하루 보류.
  skipped_spike: { text: "건너뜀 — 건수 급변·비교 기준 없음(하루 보류)", tone: "warning" },
  skipped_unreadable: { text: "건너뜀 — 새 조건 판(이 배포가 못 읽음)", tone: "warning" },
  skipped_time_budget: { text: "건너뜀 — 실행 시간 초과(다음 실행)", tone: "warning" },
}

export function describeAutoTagStatus(
  status: SegmentAutoTagStatus | null | undefined,
  detail?: SavedSegmentRunDetail | null
): { text: string; tone: HubTone } {
  if (!status) return { text: "아직 실행 전", tone: "idle" }
  const base = AUTO_TAG_STATUS_TEXT[status]
  if ((status === "applied" || status === "partial") && detail) {
    const parts = [`+${(detail.tagged ?? 0).toLocaleString("ko-KR")}`, `−${(detail.untagged ?? 0).toLocaleString("ko-KR")}`]
    if (detail.failed) parts.push(`실패 ${detail.failed.toLocaleString("ko-KR")}`)
    if (detail.blockedUntag) parts.push("떼기 상한으로 멈춤")
    return { text: `${base.text} · ${parts.join(" ")}`, tone: detail.blockedUntag ? "warning" : base.tone }
  }
  return base
}

/** 목록 "자동 태그" 열 — 켜짐이면 "매일 06시 · #라벨", 꺼짐이면 "없음". */
export function describeAutoTagColumn(item: Pick<SavedSegmentListItem, "autoTag">): { text: string; tone: HubTone } {
  if (!item.autoTag.enabled || !item.autoTag.label) return { text: "없음", tone: "idle" }
  return { text: `${item.autoTag.scheduleLabel || SEGMENT_AUTO_TAG_DEFAULT_SCHEDULE} · #${item.autoTag.label}`, tone: "ok" }
}

export function describeQualityFlags(flags: readonly SegmentQualityFlag[], neoLatestSyncedAt?: string | null): string[] {
  const neoDay = formatKstMonthDay(neoLatestSyncedAt)
  return flags.map((flag) => {
    switch (flag) {
      case "compass_down":
        return "Compass 연결 끊김(무연락 건수가 부풀 수 있음)"
      case "compass_partial":
        return "Compass 활동 일부만 반영"
      case "source_incomplete":
        return "원천 일부를 읽지 못함"
      case "neo_stale":
        return neoDay ? `NEO 값 ${neoDay} 기준(오래됨)` : "NEO 값 오래됨"
      case "truncated":
        return "상한으로 잘림"
    }
  })
}

/** 드라이런·적용 결과 문구 — "오늘 N명에 붙고 M명에서 뗌" / "N명에 붙이고 M명에서 뗐습니다". */
export function describeRunOutcome(run: SavedSegmentRunResponse): string {
  const tagged = run.tagged.toLocaleString("ko-KR")
  const untagged = run.untagged.toLocaleString("ko-KR")
  const tail: string[] = []
  if (run.failed) tail.push(`실패 ${run.failed.toLocaleString("ko-KR")}`)
  if (run.invalid) tail.push(`대상 아님 ${run.invalid.toLocaleString("ko-KR")}`)
  const head = run.dryRun ? `오늘 ${tagged}명에 붙고 ${untagged}명에서 뗌` : `${tagged}명에 붙이고 ${untagged}명에서 뗐습니다`
  return tail.length ? `${head} · ${tail.join(" · ")}` : head
}

/** 결과 상태가 "건너뜀"류면 사유 문구 — 적용·꺼짐이면 null. */
export function runSkipReason(run: Pick<SavedSegmentRunResponse, "autoTagStatus">): string | null {
  if (run.autoTagStatus.startsWith("skipped_") || run.autoTagStatus === "failed") {
    return AUTO_TAG_STATUS_TEXT[run.autoTagStatus].text
  }
  return null
}

/**
 * 자동 태그 토글을 막는 사유 — 막지 않으면 null. 순서: 권한 → 저장 전 → 보관 → 조건 판 → 공유 범위.
 * (켜기·끄기는 관리자 SUPER_ADMIN·ADMIN 만, 팀 공유 세그먼트만 — 2026-09-25 결정)
 */
export function autoTagBlockReason(
  item: Pick<SavedSegmentListItem, "canManageAutoTag" | "visibility" | "specReadable" | "archivedAt">,
  options: { dirty: boolean; available: boolean }
): string | null {
  if (!item.canManageAutoTag) return "자동 태그는 관리자(SUPER_ADMIN·ADMIN)만 켜고 끌 수 있습니다."
  if (!options.available) return "세그먼트 표가 아직 적용되지 않아 자동 태그를 켤 수 없습니다."
  if (options.dirty) return "바꾼 조건을 먼저 저장하세요 — 자동 태그는 저장된 조건으로 돕니다."
  if (item.archivedAt) return "보관된 세그먼트는 자동 태그를 켤 수 없습니다 — 먼저 복구하세요."
  if (!item.specReadable) return "이 세그먼트는 새 조건 판으로 저장돼 이 화면에서 자동 태그를 다룰 수 없습니다."
  if (item.visibility !== "team") return "자동 태그는 팀 공유 세그먼트에서만 켤 수 있습니다."
  return null
}

/** 자동 태그 라벨 입력 검증 — 1~40자, 자기 조건의 라벨과 같으면 거부(스스로를 붙잡는 조건). */
export function validateAutoTagLabel(label: string, filter: CustomerSegmentFilter | null | undefined): string | null {
  const value = label.trim().replace(/\s+/g, " ")
  if (!value) return "자동으로 붙일 태그를 입력하세요."
  if (value.length > SEGMENT_AUTO_TAG_LABEL_MAX) return `태그는 ${SEGMENT_AUTO_TAG_LABEL_MAX}자 이하로 입력하세요.`
  if (segmentFilterTags(filter).some((tag) => tag.trim().toLowerCase() === value.toLowerCase())) {
    return "이 세그먼트 조건에 쓰인 라벨은 자동 태그로 붙일 수 없습니다(스스로를 붙잡는 조건)."
  }
  return null
}

/** 8주 추이 증감 — 지금 조건으로 잰 점(specChanged 아님) 중 첫 점과 끝 점의 차. 점이 2개 미만이면 null. */
export function trendDelta(trend: readonly SegmentTrendPoint[]): number | null {
  const values = trend.filter((point) => point.total != null && !point.specChanged).map((point) => point.total as number)
  if (values.length < 2) return null
  return values[values.length - 1] - values[0]
}

export function formatDelta(delta: number | null): string | null {
  if (delta == null) return null
  if (delta === 0) return "±0"
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toLocaleString("ko-KR")}`
}

/** 원천별 건수 문구 — "리드 12 · NEO 계정 30 · 전환 고객 2"(0 은 뺀다). */
export function describeBySource(bySource: Partial<Record<CrmUnifiedCustomerSource, number>> | null | undefined): string | null {
  if (!bySource) return null
  const parts = (["lead", "neo_account", "customer"] as const)
    .filter((source) => (bySource[source] ?? 0) > 0)
    .map((source) => `${source === "neo_account" ? "NEO 계정" : SEGMENT_KIND_LABELS[source]} ${(bySource[source] ?? 0).toLocaleString("ko-KR")}`)
  return parts.length ? parts.join(" · ") : null
}

// ── 호출 ─────────────────────────────────────────────────────────────────────

/**
 * 목록 응답을 화면 캐시에 둬도 되는지. 강등 응답(라이브 평가 실패·추이 읽기 실패·표 미적용)은 서버가 no-store 로
 * 주며 "다음 조회가 바로 다시 시도한다" — 화면 캐시(메모리·sessionStorage)에도 남기지 않는다(읽기 오류의 결과를
 * 정상 캐시에 저장하지 않는다는 규약).
 */
export function isSegmentListCacheable(
  data: Pick<SavedSegmentListResponse, "available" | "live" | "trendWarning">
): boolean {
  return data.available && data.live.ok && !data.trendWarning
}

/** 강등 응답을 받았으면 그 목록 캐시를 지운다 — 다음 조회(탭 복귀·새로 고침)가 네트워크로 다시 시도한다. */
function dropDegradedSegmentList(url: string, data: SavedSegmentListResponse): SavedSegmentListResponse {
  if (!isSegmentListCacheable(data)) clearAdminRequestCache(url)
  return data
}

/**
 * 캐시된 목록(없으면 null) — 즉시 그리기용. 강등 응답이 남아 있으면(이 수정 전 저장분 등) 그려는 주되 캐시에서
 * 지워, 이어지는 fetchSegmentList 가 캐시 적중 없이 네트워크로 간다.
 */
export function readCachedSegmentList(url: string): SavedSegmentListResponse | null {
  const raw = getCachedAdminJson<unknown>(url, { cacheKey: url })
  return raw ? dropDegradedSegmentList(url, normalizeSegmentListResponse(raw)) : null
}

/**
 * 목록 GET — CRM 캐시 창(TTL 120초·SWR 10분)을 쓰되, 강등 응답은 받은 즉시(백그라운드 갱신 결과 포함) 캐시에서
 * 지운다. adminFetchJsonCached 는 저장 조건 옵션이 없어 받은 뒤 지우는 방식으로 서버 no-store 의도를 지킨다.
 */
export async function fetchSegmentList(
  url: string,
  options: { force?: boolean; onRevalidated?: (data: SavedSegmentListResponse) => void } = {}
): Promise<SavedSegmentListResponse> {
  const body = await adminFetchJsonCached<unknown>(url, undefined, {
    cacheKey: url,
    ttlMs: CRM_CACHE_TTL_MS,
    staleWhileRevalidateMs: CRM_CACHE_SWR_MS,
    force: options.force,
    onRevalidated: ({ data }) => {
      if (data) options.onRevalidated?.(dropDegradedSegmentList(url, normalizeSegmentListResponse(data)))
    },
  })
  return dropDegradedSegmentList(url, normalizeSegmentListResponse(body))
}

export async function createSavedSegment(request: SavedSegmentCreateRequest): Promise<SavedSegmentListItem> {
  const body = await adminFetchJson<unknown>(SEGMENTS_API, { method: "POST", body: JSON.stringify(request) })
  return mutationSegment(body)
}

export async function updateSavedSegment(id: string, request: SavedSegmentUpdateRequest): Promise<SavedSegmentListItem> {
  const body = await adminFetchJson<unknown>(`${SEGMENTS_API}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(request),
  })
  return mutationSegment(body)
}

/** 보관(물리 삭제 아님) — 자동 태그는 멈추고 붙은 태그는 둔다(2026-09-25 결정). */
export async function archiveSavedSegment(id: string): Promise<void> {
  await adminFetchJson<unknown>(`${SEGMENTS_API}/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function fetchSegmentDetail(id: string): Promise<SavedSegmentDetailResponse | null> {
  const body = await adminFetchJson<unknown>(`${SEGMENTS_API}/${encodeURIComponent(id)}`)
  return normalizeSegmentDetailResponse(body)
}

/**
 * 자동 태그 실행. dryRun 은 쓰기 0 이라 화면 캐시를 무효화하지 않는다(adminReadOnly).
 * assumeAutoTag — 아직 꺼진 세그먼트를 "이 라벨로 켰다면" 으로 미리 볼 때 서버에 넘기는 가정 설정(선택 필드).
 */
export async function runSavedSegment(
  id: string,
  options: { dryRun: boolean; assumeAutoTag?: { label: string; untag: boolean } }
): Promise<SavedSegmentRunResponse> {
  const payload: Record<string, unknown> = { dryRun: options.dryRun }
  if (options.assumeAutoTag) {
    payload.autoTag = { enabled: true, label: options.assumeAutoTag.label, untag: options.assumeAutoTag.untag }
  }
  const body = await adminFetchJson<unknown>(`${SEGMENTS_API}/${encodeURIComponent(id)}/run`, {
    method: "POST",
    body: JSON.stringify(payload),
    adminReadOnly: options.dryRun,
  })
  return { ...normalizeRunResponse(body), dryRun: options.dryRun }
}

export async function fetchSegmentMembers(id: string, limit: number): Promise<SavedSegmentMembersResponse> {
  const body = await adminFetchJson<unknown>(
    `${SEGMENTS_API}/${encodeURIComponent(id)}/members?limit=${Math.max(1, Math.min(Math.floor(limit), 1_000))}`
  )
  return normalizeMembersResponse(body)
}

// ── 담당 배정(리드만) — 리드 보드와 같은 안전 미리보기 → 수동 검토 배정 ──────────

export interface LeadAssignmentPreview {
  requested: number
  manualReviewReady: number
  safeLeadIds: string[]
  blockedLeadIds: string[]
  blockerCounts: Record<string, number>
  snapshotToken: string
  rosterHealthy: boolean
  rosterMessage: string | null
}

export function normalizeLeadAssignmentPreview(body: unknown): LeadAssignmentPreview {
  const record = unwrap(body)
  const blockers = asRecord(record.blockerCounts)
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [])
  return {
    requested: asCount(record.requested),
    manualReviewReady: asCount(record.manualReviewReady),
    safeLeadIds: ids(record.safeLeadIds),
    blockedLeadIds: ids(record.blockedLeadIds),
    blockerCounts: Object.fromEntries(Object.entries(blockers).map(([key, value]) => [key, asCount(value)])),
    snapshotToken: asString(record.snapshotToken) ?? "",
    rosterHealthy: record.rosterHealthy !== false,
    rosterMessage: asString(record.rosterMessage),
  }
}

const BLOCKER_LABEL: Record<string, string> = {
  unconfirmed: "미확인",
  already_assigned: "이미 배정",
  stale_30d: "30일+ 지난 리드",
  test_lead: "테스트",
  missing_contact: "연락처 없음",
  partial_duplicate_cohort: "부분 중복",
  inactive: "종료·진행",
  missing: "사라짐",
}

/** 차단 사유 요약 — "미확인 3 · 이미 배정 12". 없으면 null. */
export function describeAssignmentBlockers(blockerCounts: Record<string, number>): string | null {
  const parts = Object.entries(blockerCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${BLOCKER_LABEL[key] ?? key} ${count.toLocaleString("ko-KR")}`)
  return parts.length ? parts.join(" · ") : null
}

export async function previewLeadAssignment(ids: readonly string[]): Promise<LeadAssignmentPreview> {
  const body = await adminFetchJson<unknown>("/api/admin/leads/assignment-preview", {
    method: "POST",
    adminReadOnly: true,
    body: JSON.stringify({ ids }),
  })
  return normalizeLeadAssignmentPreview(body)
}

export async function applyLeadAssignment(
  ids: readonly string[],
  ownerKey: string,
  snapshotToken: string
): Promise<{ updated: number }> {
  const body = await adminFetchJson<unknown>("/api/admin/leads/bulk-assign", {
    method: "PATCH",
    body: JSON.stringify({
      ids,
      assigned_to: ownerKey,
      snapshotToken,
      mode: "manual_reviewed",
      reasonCode: "operator_reviewed",
    }),
  })
  return { updated: asCount(unwrap(body).updated) }
}
