// 세그먼트 허브(C안 ②, 2026-09-25) — 서버 라우트와 허브 화면이 함께 쓰는 API 계약 타입.
// 순수 타입·상수 파일이다(I/O·server-only·"use client" 없음). 평가·검증 규칙은 lib/crm/saved-segments.ts,
// OR 그룹 필터는 lib/crm/customer-segment-filter.ts, 저장은 lib/repositories/crm-saved-segments.ts 가 맡는다.
//
// 원칙: 평가는 앱(통합 스냅샷 위 메모리 판정)이 한다. DB(crm_saved_segments·crm_saved_segment_daily)는 조건과
// 결과만 담는다. Compass(crm 스키마)에는 아무것도 쓰지 않고, 자동 태그도 Home 의 crm_customer_tags 에만 붙는다.

import type { CustomerSegmentSpec } from "@/lib/crm/customer-segment-spec"
import type { CrmUnifiedCustomerSource } from "@/lib/crm/unified-view-rules"

/**
 * 저장·URL 공통 필터 = 기본 조건(AND) ∧ (anyOf 그룹 중 하나라도 — OR, 그룹 안은 AND).
 * 한 단계만(그룹 안의 anyOf 없음), 그룹 최대 SEGMENT_OR_MAX_GROUPS 개. anyOf 가 없으면 기존 AND 스펙과 같다.
 */
export interface CustomerSegmentFilter extends CustomerSegmentSpec {
  anyOf?: CustomerSegmentSpec[]
}

export const SEGMENT_OR_PARAM = "or"

/**
 * 세그먼트 건수·회원·자동 태그는 담당과 무관한 전체 기준이다. 통합 목록 화면·목록 API·CSV 내보내기는 2026-10-16 기본
 * 담당 계약(lib/admin/data-owner.ts — owner 생략=로그인 담당, 명시적 빈 값=전체)이라, 허브가 그쪽으로 넘기는 URL 은
 * 전체를 `owner=` 로 밝혀야 허브 건수와 미리보기·목록·CSV 건수가 같다(2026-10-19 09-mooni 병합).
 */
export const SEGMENT_ALL_OWNERS_QUERY = "owner="

/** 세그먼트 조건 쿼리(정규형) 앞에 전체 담당(`owner=`)을 붙인다 — 조건이 비어도 담당은 늘 싣는다. */
export function withSegmentAllOwners(query: string): string {
  return query ? `${SEGMENT_ALL_OWNERS_QUERY}&${query}` : SEGMENT_ALL_OWNERS_QUERY
}
export const SEGMENT_OR_MAX_GROUPS = 5
export const SAVED_SEGMENT_SPEC_VERSION = 1
export const SAVED_SEGMENT_NAME_MAX = 60
export const SAVED_SEGMENT_DESCRIPTION_MAX = 500
export const SEGMENT_TREND_WEEKS = 8

export type SavedSegmentVisibility = "team" | "mine"
export type SavedSegmentScope = "all" | "team" | "mine"

export type SegmentAutoTagStatus =
  | "off"
  | "applied"
  | "partial"
  | "failed"
  | "skipped_neo_stale"
  | "skipped_degraded"
  | "skipped_too_many"
  | "skipped_spike"
  | "skipped_unreadable"
  | "skipped_time_budget"

export type SegmentQualityFlag = "compass_down" | "compass_partial" | "source_incomplete" | "neo_stale" | "truncated"

/** 8주 추이 점 — 주 끝(KST 날짜)마다 그 주 마지막 일별 기록. 기록이 없으면 total=null. */
export interface SegmentTrendPoint {
  weekEnd: string
  total: number | null
  /** 그 점이 지금과 다른 조건(spec_hash)으로 잰 값 — 화면은 흐리게 */
  specChanged: boolean
  /** 그 날 품질 플래그(Compass 끊김·원천 미완성·NEO 오래됨·절단)가 있었음 — 화면은 점선 */
  degraded: boolean
}

export interface SavedSegmentAutoTag {
  enabled: boolean
  label: string | null
  untag: boolean
  /** 예: "매일 06시" */
  scheduleLabel: string
}

export interface SavedSegmentRunDetail {
  tagged?: number
  untagged?: number
  failed?: number
  invalid?: number
  flags?: SegmentQualityFlag[]
  blockedUntag?: boolean
}

export interface SavedSegmentListItem {
  id: string
  name: string
  description: string | null
  visibility: SavedSegmentVisibility
  owner: { userId: string | null; name: string | null }
  isMine: boolean
  /** 이름·조건·공유 범위를 바꿀 수 있는지(소유자, 또는 팀 세그먼트면 관리자) */
  canEdit: boolean
  /** 자동 태그를 켜고 끌 수 있는지(관리자 SUPER_ADMIN·ADMIN 만 — 2026-09-25 결정) */
  canManageAutoTag: boolean
  spec: CustomerSegmentFilter
  specVersion: number
  /** 앱이 읽을 수 있는 조건 판인지(구 배포가 새 어휘를 버려 조건이 넓어지는 사고 방지) */
  specReadable: boolean
  /** OR 그룹이 없는지 — true 면 통합 목록에서 조건을 그대로 편집할 수 있다(OR 은 목록에서 보기만) */
  andOnly: boolean
  /** 조건 문구(캡션용, OR 은 "(A) 또는 (B)") */
  labels: string[]
  /**
   * 통합 고객 딥링크(/admin/crm/customers/unified?… — OR 그룹은 or= 로 실린다. 통합 목록은 OR 을 보여 주기만 하고
   * 편집은 허브에서 한다). 읽을 수 없는 판(specReadable=false)이면 null.
   */
  listHref: string | null
  /** 지금 조건으로 센 건수 — 평가 실패면 null(화면은 lastCount 로 폴백 표기) */
  count: number | null
  lastCount: number | null
  lastEvaluatedAt: string | null
  lastRunStatus: SegmentAutoTagStatus | null
  lastRunDetail: SavedSegmentRunDetail | null
  autoTag: SavedSegmentAutoTag
  /** 길이 SEGMENT_TREND_WEEKS, 오래된 주 → 최근 주 */
  trend: SegmentTrendPoint[]
  /** 일별 기록이 쌓인 날 수 — 적으면 화면이 "기록 N일째" */
  trendDays: number
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SavedSegmentLiveStatus {
  ok: boolean
  /** 통합 목록 meta.compass 와 같은 뜻 */
  compass: "ok" | "down" | "partial" | "skipped"
  neoStale: boolean
  neoLatestSyncedAt: string | null
}

/** GET /api/admin/crm/segments?scope=all|team|mine&archived=0|1 */
export interface SavedSegmentListResponse {
  /** 표 미적용이면 false — segments 는 빈 배열, warning 에 적용 안내 */
  available: boolean
  warning: string | null
  /** 일별 표만 없을 때의 안내(추이가 비어 있음) */
  trendWarning?: string | null
  generatedAt: string
  scopeCounts: Record<SavedSegmentScope, number>
  live: SavedSegmentLiveStatus
  segments: SavedSegmentListItem[]
}

/** GET /api/admin/crm/segments/[id] */
export interface SavedSegmentDetailResponse {
  available: boolean
  warning: string | null
  generatedAt: string
  live: SavedSegmentLiveStatus
  segment: SavedSegmentListItem
  /** 기본 조건 ∧ 그룹 i 의 건수(현재 베이스 기준) — 그룹 수와 같은 길이 */
  anyOfCounts: number[]
  bySource: Record<CrmUnifiedCustomerSource, number>
  /** 최근 56일 일별 점(오래된 날 → 최근 날) */
  daily: Array<{ date: string; total: number; specChanged: boolean; degraded: boolean; autoTagStatus: SegmentAutoTagStatus }>
}

/** POST /api/admin/crm/segments */
export interface SavedSegmentCreateRequest {
  name: string
  description?: string | null
  spec: CustomerSegmentFilter
  visibility?: SavedSegmentVisibility
  autoTag?: { enabled: boolean; label: string | null; untag?: boolean }
}

/** PATCH /api/admin/crm/segments/[id] */
export interface SavedSegmentUpdateRequest {
  name?: string
  description?: string | null
  spec?: CustomerSegmentFilter
  visibility?: SavedSegmentVisibility
  autoTag?: { enabled?: boolean; label?: string | null; untag?: boolean; detachExisting?: boolean }
  /** 보관 해제 */
  restore?: true
}

/** POST /api/admin/crm/segments, PATCH /api/admin/crm/segments/[id] 성공 응답 */
export interface SavedSegmentMutationResponse {
  segment: SavedSegmentListItem
}

/** POST /api/admin/crm/segments/[id]/run  body { dryRun?: boolean } */
export interface SavedSegmentRunResponse {
  dryRun: boolean
  total: number
  bySource: Record<CrmUnifiedCustomerSource, number>
  flags: SegmentQualityFlag[]
  autoTagStatus: SegmentAutoTagStatus
  /** dryRun 이면 붙일 예정 수, 아니면 실제로 붙인 수 */
  tagged: number
  untagged: number
  failed: number
  invalid: number
}

/** GET /api/admin/crm/segments/[id]/members?limit=500 — "전체 선택" 뒤 일괄 라우트 입력 */
export interface SavedSegmentMembersResponse {
  total: number
  /** 통합 행 키(lead:·neo:·customer:), 추천순 */
  keys: string[]
  truncated: boolean
  limit: number
}
