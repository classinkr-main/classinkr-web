// 통합 고객 세그먼트 필터 = 기본 조건(AND) ∧ (anyOf 그룹 중 하나라도 — OR, 그룹 안은 AND) — 한 단계만.
//
// 순수 모듈이다(서버·클라이언트·테스트 공용, I/O 없음). AND 조건 엔진(lib/crm/customer-segment-spec.ts)을
// 그대로 쓰고 그 위에 OR 한 층만 얹는다 — customer-segment-spec 은 import 만 하고 바꾸지 않는다. anyOf 를
// CustomerSegmentSpec 에 넣지 않는 이유: keyof 기반 SegmentConditionKey·조건 switch 가 anyOf 를 조건 키로
// 오인하지 않게(세그먼트 허브 설계 2026-09-25).
//
// URL 규약: 기존 키(expDays·risk…)는 그대로 두고 그룹마다 `or=<그룹 정규형 쿼리>` 를 반복해서 붙인다.
//   예) ?expDays=60&kinds=neo_account&or=noContactDays%3D60&or=risk%3Durgent
//   옛 URL(or 없음)은 순수 AND 로 그대로 읽힌다. 그룹 안의 or 는 읽지 않는다(중첩 차단).
// 저장 JSON 규약(crm_saved_segments.spec): 키 = URL 파라미터 이름, anyOf = 그룹 배열. AND 만 쓴 세그먼트의 JSON 은
//   parseSegmentSpec 결과와 같아 `/admin/crm/customers/unified?${segmentSpecQueryString(spec)}` 딥링크가 그대로 된다.
//
// 정규형 규칙:
//  - 기본 조건 = normalizeSegmentSpec. 그룹도 normalizeSegmentSpec → 빈 그룹 제거(미완성 그룹은 "없음"이다 —
//    항상 참(TRUE)으로 보지 않는다) → 그룹 정규형 쿼리로 중복 제거·정렬 → SEGMENT_OR_MAX_GROUPS 개 상한.
//  - 남은 그룹이 없으면 anyOf 키를 뺀다. 그룹이 하나여도 기본 조건에 접지 않는다(같은 키 교집합 규칙이 복잡하고
//    뜻은 같다).

import {
  SAVED_SEGMENT_SPEC_VERSION,
  SEGMENT_OR_MAX_GROUPS,
  SEGMENT_OR_PARAM,
  type CustomerSegmentFilter,
} from "@/lib/crm/saved-segment-api"
import {
  buildSegmentMatchers,
  describeSegmentSpec,
  normalizeSegmentSpec,
  parseSegmentSpec,
  segmentSpecQueryString,
  writeSegmentSpecParams,
  type CustomerSegmentSpec,
  type SearchParamsLike,
  type SegmentRowInput,
} from "@/lib/crm/customer-segment-spec"

export type { CustomerSegmentFilter }
export { SEGMENT_OR_MAX_GROUPS, SEGMENT_OR_PARAM }

/** OR 그룹 하나의 문구를 감싸는 괄호·연결어 — describeSegmentFilter 캡션용. */
const OR_GROUP_JOINER = " 또는 "
const OR_GROUP_PART_JOINER = " · "

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
}

/** 그룹 목록 정규화 — 빈 그룹 제거 → 정규형 쿼리로 중복 제거·정렬 → 상한. */
function normalizeGroups(groups: readonly unknown[] | null | undefined): CustomerSegmentSpec[] {
  if (!Array.isArray(groups) || groups.length === 0) return []
  const byQuery = new Map<string, CustomerSegmentSpec>()
  for (const raw of groups) {
    if (!isPlainObject(raw)) continue
    const group = normalizeSegmentSpec(raw as CustomerSegmentSpec)
    const query = segmentSpecQueryString(group)
    if (!query || byQuery.has(query)) continue
    byQuery.set(query, group)
  }
  return [...byQuery.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, SEGMENT_OR_MAX_GROUPS)
    .map(([, group]) => group)
}

/** 필터를 정규형으로 다듬는다 — 기본 조건 정규화 + 그룹 정규화(빈 그룹 제거·중복·정렬·상한). */
export function normalizeSegmentFilter(filter: CustomerSegmentFilter | null | undefined): CustomerSegmentFilter {
  if (!filter) return {}
  const base: CustomerSegmentFilter = normalizeSegmentSpec(filter)
  const groups = normalizeGroups(filter.anyOf)
  if (groups.length > 0) base.anyOf = groups
  return base
}

/** 기본(바깥) 조건만 — anyOf 를 뗀 AND 스펙. */
export function segmentFilterBaseSpec(filter: CustomerSegmentFilter | null | undefined): CustomerSegmentSpec {
  return normalizeSegmentSpec(filter)
}

/** 정규형 OR 그룹(없으면 빈 배열). */
export function segmentFilterGroups(filter: CustomerSegmentFilter | null | undefined): CustomerSegmentSpec[] {
  return normalizeGroups(filter?.anyOf)
}

/**
 * URL 쿼리 → 필터. 기본 조건은 parseSegmentSpec, 그룹은 `or` 값마다 parseSegmentSpec(그 값을 쿼리로 읽음).
 * 그룹 안의 or 는 보지 않는다(parseSegmentSpec 이 or 키를 모른다 — 중첩 차단). 모르는 값은 조용히 버린다.
 */
export function parseSegmentFilter(params: SearchParamsLike | null | undefined): CustomerSegmentFilter {
  if (!params) return {}
  const base: CustomerSegmentFilter = parseSegmentSpec(params)
  // 상한 이상은 읽지도 않는다 — 긴 URL 로 파싱 비용을 부풀리지 못하게. 중복이 섞여 있어도 정규화 뒤 상한 안이다.
  const rawGroups = params.getAll(SEGMENT_OR_PARAM).slice(0, SEGMENT_OR_MAX_GROUPS * 2)
  const groups = normalizeGroups(rawGroups.map((value) => parseSegmentSpec(new URLSearchParams(value))))
  if (groups.length > 0) base.anyOf = groups
  return base
}

/** 필터를 URL 파라미터에 정규형으로 싣는다(기존 조건 키·or 는 먼저 지운다). */
export function writeSegmentFilterParams(
  params: URLSearchParams,
  filter: CustomerSegmentFilter | null | undefined
): URLSearchParams {
  writeSegmentSpecParams(params, filter)
  params.delete(SEGMENT_OR_PARAM)
  for (const group of segmentFilterGroups(filter)) params.append(SEGMENT_OR_PARAM, segmentSpecQueryString(group))
  return params
}

/** 필터만 담은 정규형 쿼리 문자열(앞의 `?` 없음). 빈 필터면 "". 비교·캐시 키·spec_hash 입력. */
export function segmentFilterQueryString(filter: CustomerSegmentFilter | null | undefined): string {
  return writeSegmentFilterParams(new URLSearchParams(), filter).toString()
}

export function isSegmentFilterEmpty(filter: CustomerSegmentFilter | null | undefined): boolean {
  return segmentFilterQueryString(filter) === ""
}

/** OR 그룹이 하나라도 있는지(정규화 뒤). */
export function segmentFilterHasOr(filter: CustomerSegmentFilter | null | undefined): boolean {
  return segmentFilterGroups(filter).length > 0
}

/**
 * 행 판정 함수 — 매처를 한 번만 만들어 행마다 재사용한다.
 * 기본 조건 전부 AND, 그룹이 있으면 그중 하나라도(그룹 안은 AND). 조건이 없으면 항상 true.
 */
export function buildSegmentFilterMatcher(
  filter: CustomerSegmentFilter | null | undefined,
  nowMs: number
): (row: SegmentRowInput) => boolean {
  const baseMatchers = buildSegmentMatchers(segmentFilterBaseSpec(filter), nowMs)
  const groupMatchers = segmentFilterGroups(filter).map((group) => buildSegmentMatchers(group, nowMs))
  return (row) => {
    for (const matcher of baseMatchers) if (!matcher.test(row)) return false
    if (groupMatchers.length === 0) return true
    return groupMatchers.some((matchers) => matchers.every((matcher) => matcher.test(row)))
  }
}

/** 조건 문구 — 기본 조건 문구 + "(위험 긴급) 또는 (무연락 60일+)" 한 줄(그룹 안은 " · "). */
export function describeSegmentFilter(filter: CustomerSegmentFilter | null | undefined): string[] {
  const parts = describeSegmentSpec(segmentFilterBaseSpec(filter))
  const groups = segmentFilterGroups(filter)
  if (groups.length > 0) {
    parts.push(groups.map((group) => `(${describeSegmentSpec(group).join(OR_GROUP_PART_JOINER)})`).join(OR_GROUP_JOINER))
  }
  return parts
}

function allSpecs(filter: CustomerSegmentFilter | null | undefined): CustomerSegmentSpec[] {
  return [segmentFilterBaseSpec(filter), ...segmentFilterGroups(filter)]
}

/** 조건이 쓰는 라벨 전부(기본·그룹, 중복 제거, 대소문자 무시) — "스스로를 붙잡는 조건" 검사용. */
export function segmentFilterTags(filter: CustomerSegmentFilter | null | undefined): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const spec of allSpecs(filter)) {
    for (const tag of [...(spec.tagsAll ?? []), ...(spec.tagsAny ?? [])]) {
      const key = tag.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      tags.push(tag)
    }
  }
  return tags
}

/**
 * NEO(외부 CRM 동기화) 신호에 기대는 조건인가 — 만료·소진·잔액·위험·과금, 또는 종류가 고객(neo_account)
 * 하나뿐. NEO 동기화가 오래되면 이런 세그먼트의 자동 태그는 멈춘다(skipped_neo_stale).
 */
export function segmentFilterUsesNeoSignals(filter: CustomerSegmentFilter | null | undefined): boolean {
  return allSpecs(filter).some(
    (spec) =>
      spec.expDays != null ||
      spec.depDays != null ||
      spec.minBalanceCny != null ||
      Boolean(spec.risk?.length) ||
      Boolean(spec.billing?.length) ||
      (spec.kinds?.length === 1 && spec.kinds[0] === "neo_account")
  )
}

/** 마지막 연락(Home·Compass)에 기대는 조건인가 — 무연락 N일+. Compass 가 끊기면 부풀어 오른다. */
export function segmentFilterUsesContact(filter: CustomerSegmentFilter | null | undefined): boolean {
  return allSpecs(filter).some((spec) => spec.noContactDays != null)
}

export type StoredSegmentFilterReadResult =
  | { readable: true; filter: CustomerSegmentFilter }
  | { readable: false; reason: "newer_version" | "invalid" }

/**
 * 저장된 조건(crm_saved_segments.spec, spec_version) 읽기. 앱이 아는 판(SAVED_SEGMENT_SPEC_VERSION)보다 새 판이면
 * 읽지 않는다 — 구 배포가 새 어휘를 버리고 조건을 넓혀 평가·자동 태그하는 사고를 막는다.
 */
export function readStoredSegmentFilter(spec: unknown, version: number | null | undefined): StoredSegmentFilterReadResult {
  const numericVersion = Number(version ?? 1)
  if (!Number.isFinite(numericVersion) || numericVersion > SAVED_SEGMENT_SPEC_VERSION) {
    return { readable: false, reason: "newer_version" }
  }
  if (!isPlainObject(spec)) return { readable: false, reason: "invalid" }
  return { readable: true, filter: normalizeSegmentFilter(spec as CustomerSegmentFilter) }
}
