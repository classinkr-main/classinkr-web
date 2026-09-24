// 통합 고객 세그먼트 조건(AND) 엔진의 계약 — 기준일 상수 · 조건 스펙 타입 · URL 직렬화/파싱 · 행 판정.
//
// 순수 모듈이다(서버·클라이언트·테스트 공용). 서버 전용 코드를 import하지 않는다 — 타입 import만 쓴다.
//
// 1) 기준일 SSOT(F1)
//    "만료 임박"은 한 가지 뜻만 쓴다 — 만료일이 오늘부터 EXPIRING_SOON_DAYS(30일) 안(이미 지난 건 제외).
//    통합 저장 뷰(expiring)·행 플래그(만료임박)·재연락 알림(renewal-alerts)이 모두 이 상수와 isExpiringWithinDays
//    를 쓴다. 이미 지난 만료는 "만료"(행 플래그 expired)로 따로 부른다 — 같은 단어에 다른 숫자를 두지 않는다.
//    원천 고객 화면(NEO 동기화 목록)의 60일 창은 뜻이 다르므로 이름도 다르게 부른다: "60일 내 만료"
//    (NEO_SOURCE_EXPIRING_WINDOW_DAYS).
//
// 2) 조건 스펙(SG4)
//    저장 뷰(?view=)·라벨(?tag=)·검색·담당과 AND로 묶이는 추가 조건이다. 한 조건 안의 여러 값은 OR,
//    조건끼리는 AND. 알 수 없는 값·범위를 벗어난 숫자는 파싱에서 조용히 버린다(?view= 규약과 같음).
//    직렬화는 정규형(키 순서·값 정렬 고정)이라 같은 조건이면 같은 URL(=클라이언트 캐시 키)이 된다.
//
// 3) 금액 조건은 통화별 축만 둔다 — minBalanceCny 는 외부 CRM(NEO) 잔액(¥)만 본다. ₩/$/¥ 를 합산하거나
//    다른 통화 금액과 비교하지 않는다(플레이북 04-growth-crm).

import type { CrmNeoBillingMode } from "@/lib/supabase/database.types"
import type { ServiceRiskLevel } from "@/lib/crm/service-risk"
import { EEO_BILLING_MODE_LABELS } from "@/lib/crm/eeo-account-fields"
import { isDuplicateTag, normalizeTag } from "@/lib/crm/tag-suggestions"

// ── 기준일 SSOT ─────────────────────────────────────────────────────────────

/** "만료 임박" — 만료일이 오늘부터 이 일수 안(0~30일). 통합 뷰·행 플래그·재연락 알림 공통. */
export const EXPIRING_SOON_DAYS = 30
/** 원천 고객(NEO 동기화) 화면의 "60일 내 만료" 창 — 만료 임박(30일)과 다른 뜻이라 이름도 다르다. */
export const NEO_SOURCE_EXPIRING_WINDOW_DAYS = 60
/** "최근 컨택" 저장 뷰 — 마지막 연락이 이 일수 안. */
export const RECENT_CONTACT_DAYS = 30
/** "30일+ 미접촉" 저장 뷰 — 마지막 연락이 이 일수 이상 전이거나 연락 기록이 없다. */
export const DORMANT_CONTACT_DAYS = 30

const DAY_MS = 86_400_000

/** 무연락 판정에 필요한 행 필드 — 통합 행(CrmUnifiedCustomerRow)·세그먼트 행(SegmentRowInput) 공용. */
export interface NoContactRowInput {
  lastContactAt?: string | null
  lifecycle?: string | null
}

/**
 * "마지막 연락 N일 이상 전 또는 연락 기록 없음"(종료 행 제외) — 정의는 여기 하나다.
 * "N일+ 미접촉" 저장 뷰(unified-view-rules dormant, N=DORMANT_CONTACT_DAYS)와 "무연락 N일+" 조건 칩
 * (noContactDays 매처)이 둘 다 이 함수를 써서 같은 N 이면 같은 건수가 된다(2026-09-25 리뷰: 칩이 종료 행을
 * 세어 뷰보다 컸다).
 *
 * N일은 **경과 일수**(24시간 단위, 소수)다 — KST 달력일이 아니다. 목록 셀의 "오늘·어제·N일 전" 표시 문구는
 * KST 달력일(lib/crm/last-contact.ts lastContactCalendarDays)이라, 어제 밤 연락은 표시가 "어제"여도 경과는
 * 1일 미만일 수 있다. 판정 기준을 바꾸지 않는 것은 건강도 입력(lastContactDays)과 같은 축을 유지하기 위해서다.
 */
export function isNoContactForDays(row: NoContactRowInput, days: number, nowMs: number): boolean {
  if (row.lifecycle === "closed") return false
  const since = daysSinceIso(row.lastContactAt ?? null, nowMs)
  return since == null || since >= days
}

/** ISO 시각까지 남은 일수(소수). 지난 시각이면 음수, 없거나 해석 불가면 null. */
export function daysUntilIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return (time - nowMs) / DAY_MS
}

/** ISO 시각 이후 지난 일수(소수). 없거나 해석 불가면 null. */
export function daysSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  const until = daysUntilIso(iso, nowMs)
  return until == null ? null : -until
}

/** 만료일이 오늘부터 N일 안(이미 지난 만료는 제외)인가. */
export function isExpiringWithinDays(expireAt: string | null | undefined, days: number, nowMs: number): boolean {
  const until = daysUntilIso(expireAt, nowMs)
  return until != null && until >= 0 && until <= days
}

/** "만료 임박"(EXPIRING_SOON_DAYS) 판정 — 통합 뷰·행 플래그 공통. */
export function isExpiringSoon(expireAt: string | null | undefined, nowMs: number): boolean {
  return isExpiringWithinDays(expireAt, EXPIRING_SOON_DAYS, nowMs)
}

/** 스냅샷의 정수 만료 D-day(expire_in_days) 로 같은 판정 — 재연락 알림용. */
export function isExpiringSoonInDays(expireInDays: number | null | undefined, days = EXPIRING_SOON_DAYS): boolean {
  return expireInDays != null && Number.isFinite(expireInDays) && expireInDays >= 0 && expireInDays <= days
}

/** 이미 지난 만료 — 행 플래그 "만료". */
export function isExpired(expireAt: string | null | undefined, nowMs: number): boolean {
  const until = daysUntilIso(expireAt, nowMs)
  return until != null && until < 0
}

// ── 조건 스펙 ───────────────────────────────────────────────────────────────

export type SegmentCustomerKind = "lead" | "neo_account" | "customer"
export type SegmentBillingMode = CrmNeoBillingMode
export type SegmentRiskLevel = ServiceRiskLevel

export interface CustomerSegmentSpec {
  /** 만료 N일 이내(오늘~N일, 지난 만료 제외) */
  expDays?: number
  /** 잔액 소진 예상 N일 이내(표본 부족으로 예상일이 없으면 제외) */
  depDays?: number
  /**
   * 마지막 연락 N일(경과 일수) 이상 전 — 연락 기록이 전혀 없는 행도 포함("기록 없음"으로 따로 센다),
   * 종료(lifecycle closed) 행은 제외. 정의는 isNoContactForDays(저장 뷰 dormant 와 공용).
   */
  noContactDays?: number
  /** 외부 CRM 잔액(¥) 이상 — NEO 행만(통화별 축, 합산 없음) */
  minBalanceCny?: number
  /** 고객 종류(복수 OR) */
  kinds?: SegmentCustomerKind[]
  /** NEO 서비스 위험 등급(복수 OR) */
  risk?: SegmentRiskLevel[]
  /** NEO 과금 방식(복수 OR) */
  billing?: SegmentBillingMode[]
  /**
   * 담당(복수 OR) — 담당 키(이름·NEO ownerId, 대소문자 무시). SEGMENT_NONE_TOKEN = 미배정.
   * 자리표시 이름("담당 미지정")은 파싱에서 SEGMENT_NONE_TOKEN 으로 접는다(isUnassignedOwnerKey).
   */
  owners?: string[]
  /** 지역 라벨(복수 OR). SEGMENT_NONE_TOKEN = 지역 미지정 */
  regions?: string[]
  /**
   * 라벨 모두 가진 행. tagsAny 와 함께 오면 파싱·정규화가 둘을 합쳐 tagsAll 하나로 만든다
   * (foldSegmentTagModes — 화면은 한 방식만 고를 수 있다).
   */
  tagsAll?: string[]
  /** 라벨 하나라도 가진 행 */
  tagsAny?: string[]
}

export type SegmentConditionKey = keyof CustomerSegmentSpec

/** 담당·지역의 "없음"(미배정·지역 미지정) 값. */
export const SEGMENT_NONE_TOKEN = "__none"
/** 담당 "없음"의 표시 이름 — 조건 문구·담당 선택지 공용. */
export const SEGMENT_OWNER_NONE_LABEL = "미배정"

/**
 * 사람이 아니라 "담당 없음"을 뜻하는 자리표시 이름(소문자 비교).
 *  - "담당 미지정": NEO 동기화가 담당 id 가 없을 때 붙이는 이름(lib/external-crm/owner-names.ts resolveOwnerName,
 *    crm_neo_customer_snapshots.owner_name 기본값). 이 이름이 ownerKeys 에 실려 "미배정"(__none) 조건이
 *    NEO 미배정 고객을 놓치고, 선택지에 "미배정"과 "담당 미지정"이 따로 나오던 결함(2026-09-25 리뷰)의 원인.
 *  - "미배정": 화면 표시 이름(SEGMENT_OWNER_NONE_LABEL) — 사람이 URL 에 적어도 없음으로 읽는다.
 */
/** NEO 동기화가 담당 id 가 없을 때 붙이는 자리표시 이름 — owner-names.ts resolveOwnerName 이 이 상수를 쓴다(한 곳). */
export const NEO_UNASSIGNED_OWNER_NAME = "담당 미지정"

const OWNER_PLACEHOLDER_KEYS: ReadonlySet<string> = new Set([NEO_UNASSIGNED_OWNER_NAME, SEGMENT_OWNER_NONE_LABEL])

/** 담당 키가 비었거나 자리표시 이름인가("미배정"으로 취급). */
export function isUnassignedOwnerKey(value: string | null | undefined): boolean {
  const key = value?.trim().replace(/\s+/g, " ").toLowerCase() ?? ""
  return !key || OWNER_PLACEHOLDER_KEYS.has(key)
}

/** 실제 담당 키만(빈 값·자리표시 이름 제외). 비면 미배정이다. */
export function assignedOwnerKeys(ownerKeys: readonly string[] | null | undefined): string[] {
  return (ownerKeys ?? []).filter((key) => !isUnassignedOwnerKey(key))
}

/**
 * 담당 선택지(facets)에 이 행이 들어가는 값 — owners 매처와 같은 미배정 규칙을 쓴다.
 *  - 표시 이름이 실제 이름이면 그 이름 하나.
 *  - 이름이 비었거나 자리표시면 실제 담당 키(폴드로 승계된 리드 담당 등), 그것도 없으면 SEGMENT_NONE_TOKEN.
 * 그래서 선택지의 "미배정" 건수 = owners=[__none] 조건 건수다.
 */
export function segmentOwnerFacetValues(row: {
  ownerName?: string | null
  ownerKeys: readonly string[]
}): Array<{ value: string; label: string }> {
  const name = row.ownerName?.trim()
  if (name && !isUnassignedOwnerKey(name)) return [{ value: name, label: name }]
  const assigned = assignedOwnerKeys(row.ownerKeys)
  if (assigned.length === 0) return [{ value: SEGMENT_NONE_TOKEN, label: SEGMENT_OWNER_NONE_LABEL }]
  return assigned.map((key) => ({ value: key, label: key }))
}

/** URL 파라미터 이름 = 스펙 키(정규형 순서). 목록 값은 같은 키를 반복한다(`?risk=urgent&risk=soon`). */
export const SEGMENT_NUMBER_KEYS = ["expDays", "depDays", "noContactDays", "minBalanceCny"] as const
export const SEGMENT_LIST_KEYS = ["kinds", "risk", "billing", "owners", "regions", "tagsAll", "tagsAny"] as const
export const SEGMENT_PARAM_KEYS: readonly SegmentConditionKey[] = [...SEGMENT_NUMBER_KEYS, ...SEGMENT_LIST_KEYS]

type SegmentNumberKey = (typeof SEGMENT_NUMBER_KEYS)[number]
type SegmentListKey = (typeof SEGMENT_LIST_KEYS)[number]

export const SEGMENT_KIND_VALUES: readonly SegmentCustomerKind[] = ["lead", "neo_account", "customer"]
export const SEGMENT_RISK_VALUES: readonly SegmentRiskLevel[] = ["urgent", "soon", "watch", "normal"]
export const SEGMENT_BILLING_VALUES: readonly SegmentBillingMode[] = ["consumption", "subscription", "hardware", "unknown"]

export const SEGMENT_KIND_LABELS: Record<SegmentCustomerKind, string> = {
  lead: "리드",
  neo_account: "고객",
  customer: "전환 고객",
}
// 드로어(components/admin/crm/drawer/shared.tsx SERVICE_RISK_LABEL)와 같은 어휘.
export const SEGMENT_RISK_LABELS: Record<SegmentRiskLevel, string> = {
  urgent: "긴급",
  soon: "임박",
  watch: "주시",
  normal: "정상",
}
export const SEGMENT_BILLING_LABELS: Record<SegmentBillingMode, string> = EEO_BILLING_MODE_LABELS

/** 숫자 조건의 프리셋 칩 — 화면은 숫자 입력 대신 이 칩을 쓴다. */
export const SEGMENT_NUMBER_PRESETS: Record<SegmentNumberKey, readonly number[]> = {
  expDays: [14, 30, 60],
  depDays: [7, 14, 30],
  noContactDays: [14, 30, 60],
  minBalanceCny: [10_000, 50_000, 100_000],
}

const NUMBER_BOUNDS: Record<SegmentNumberKey, { min: number; max: number }> = {
  expDays: { min: 1, max: 3650 },
  depDays: { min: 1, max: 3650 },
  noContactDays: { min: 1, max: 3650 },
  minBalanceCny: { min: 1, max: 1_000_000_000 },
}

const LIST_ENUMS: Partial<Record<SegmentListKey, readonly string[]>> = {
  kinds: SEGMENT_KIND_VALUES,
  risk: SEGMENT_RISK_VALUES,
  billing: SEGMENT_BILLING_VALUES,
}

/** 목록 조건 하나에 싣는 값 상한 — 딥링크 URL 폭주 방지. */
export const SEGMENT_LIST_MAX_VALUES = 20
const FREE_TEXT_MAX_LENGTH = 40

/** `get`/`getAll` 만 있으면 된다 — URLSearchParams·Next ReadonlyURLSearchParams 모두 맞는다. */
export interface SearchParamsLike {
  get(name: string): string | null
  getAll(name: string): string[]
}

function parseNumberValue(key: SegmentNumberKey, raw: string | null): number | undefined {
  if (raw == null || raw.trim() === "") return undefined
  if (!/^\d+$/.test(raw.trim())) return undefined
  const value = Number(raw.trim())
  const bounds = NUMBER_BOUNDS[key]
  if (!Number.isSafeInteger(value) || value < bounds.min || value > bounds.max) return undefined
  return value
}

function normalizeFreeText(key: SegmentListKey, raw: string): string {
  if (key === "tagsAll" || key === "tagsAny") return normalizeTag(raw)
  const value = raw.trim().replace(/\s+/g, " ").slice(0, FREE_TEXT_MAX_LENGTH)
  // 담당 자리표시 이름("담당 미지정")은 사람이 아니라 미배정이다 — 옛 딥링크도 같은 조건이 된다.
  if (key === "owners" && value && isUnassignedOwnerKey(value)) return SEGMENT_NONE_TOKEN
  return value
}

function normalizeListValues(key: SegmentListKey, raws: readonly string[]): string[] {
  const allowed = LIST_ENUMS[key]
  const seen = new Set<string>()
  const values: string[] = []
  for (const raw of raws) {
    if (typeof raw !== "string") continue
    const value = allowed ? raw.trim() : normalizeFreeText(key, raw)
    if (!value) continue
    if (allowed && !allowed.includes(value)) continue
    // 자유 텍스트(담당·지역·라벨)는 대소문자만 다른 값을 하나로 접는다.
    const dedupeKey = allowed ? value : value.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    values.push(value)
    if (values.length >= SEGMENT_LIST_MAX_VALUES) break
  }
  // 정규형 — enum 은 정의 순서, 자유 텍스트는 코드 단위 정렬(서버·클라이언트가 같은 문자열을 낸다).
  if (allowed) return allowed.filter((candidate) => values.includes(candidate))
  return values.sort()
}

/**
 * 라벨 방식 정규화 — tagsAll 과 tagsAny 가 함께 오면 둘을 합쳐 tagsAll(모두 가진) 하나로 만든다.
 * 화면(SegmentConditionBar)은 "모두/하나" 중 한 방식만 고를 수 있어 두 키가 섞이면 토글이 어느 쪽인지 말할 수
 * 없고, 화면·서버가 같은 조건을 보려면 서버도 같은 규칙으로 읽어야 한다. 더 좁은 쪽(모두)으로 합쳐 조건이
 * 느슨해지지 않게 한다 — tagsAny 가 한 개면 A∧B 로 원래 뜻과 정확히 같다. 제자리에서 고친다.
 */
function foldSegmentTagModes(spec: CustomerSegmentSpec): CustomerSegmentSpec {
  if (!spec.tagsAll?.length || !spec.tagsAny?.length) return spec
  spec.tagsAll = normalizeListValues("tagsAll", [...spec.tagsAll, ...spec.tagsAny])
  delete spec.tagsAny
  return spec
}

/** 스펙을 정규형으로 다듬는다 — 빈 목록·범위 밖 숫자·모르는 값은 버린다. */
export function normalizeSegmentSpec(spec: CustomerSegmentSpec | null | undefined): CustomerSegmentSpec {
  const result: CustomerSegmentSpec = {}
  if (!spec) return result
  for (const key of SEGMENT_NUMBER_KEYS) {
    const raw = spec[key]
    if (raw == null) continue
    const value = parseNumberValue(key, String(raw))
    if (value != null) result[key] = value
  }
  for (const key of SEGMENT_LIST_KEYS) {
    const raw = spec[key]
    if (!Array.isArray(raw) || raw.length === 0) continue
    const values = normalizeListValues(key, raw as string[])
    if (values.length > 0) (result as Record<string, unknown>)[key] = values
  }
  return foldSegmentTagModes(result)
}

/** URL 쿼리 → 스펙. 알 수 없는 값은 버린다. 다른 파라미터(?view= 등)는 보지 않는다. */
export function parseSegmentSpec(params: SearchParamsLike | null | undefined): CustomerSegmentSpec {
  if (!params) return {}
  const spec: CustomerSegmentSpec = {}
  for (const key of SEGMENT_NUMBER_KEYS) {
    const value = parseNumberValue(key, params.get(key))
    if (value != null) spec[key] = value
  }
  for (const key of SEGMENT_LIST_KEYS) {
    const values = normalizeListValues(key, params.getAll(key))
    if (values.length > 0) (spec as Record<string, unknown>)[key] = values
  }
  return foldSegmentTagModes(spec)
}

/** 스펙을 URL 파라미터에 정규형으로 싣는다(기존 스펙 키는 먼저 지운다). 빈 스펙이면 키가 하나도 남지 않는다. */
export function writeSegmentSpecParams(params: URLSearchParams, spec: CustomerSegmentSpec | null | undefined): URLSearchParams {
  for (const key of SEGMENT_PARAM_KEYS) params.delete(key)
  const normalized = normalizeSegmentSpec(spec)
  for (const key of SEGMENT_NUMBER_KEYS) {
    const value = normalized[key]
    if (value != null) params.set(key, String(value))
  }
  for (const key of SEGMENT_LIST_KEYS) {
    const values = normalized[key] as string[] | undefined
    for (const value of values ?? []) params.append(key, value)
  }
  return params
}

/** 스펙만 담은 정규형 쿼리 문자열(앞의 `?` 없음). 빈 스펙이면 "". 비교·캐시 키용. */
export function segmentSpecQueryString(spec: CustomerSegmentSpec | null | undefined): string {
  return writeSegmentSpecParams(new URLSearchParams(), spec).toString()
}

export function isSegmentSpecEmpty(spec: CustomerSegmentSpec | null | undefined): boolean {
  return segmentSpecQueryString(spec) === ""
}

/** 켜진 조건 키(정규형 순서). */
export function activeSegmentConditionKeys(spec: CustomerSegmentSpec | null | undefined): SegmentConditionKey[] {
  const normalized = normalizeSegmentSpec(spec)
  return SEGMENT_PARAM_KEYS.filter((key) => normalized[key] != null)
}

// ── 화면 조작용 순수 헬퍼 ───────────────────────────────────────────────────

/** 숫자 조건 켜기/끄기 — 같은 값을 다시 누르면 끈다. */
export function toggleSegmentNumber(
  spec: CustomerSegmentSpec,
  key: SegmentNumberKey,
  value: number
): CustomerSegmentSpec {
  const next = { ...spec }
  if (next[key] === value) delete next[key]
  else next[key] = value
  return normalizeSegmentSpec(next)
}

/** 목록 조건 값 하나 켜기/끄기. */
export function toggleSegmentListValue(
  spec: CustomerSegmentSpec,
  key: SegmentListKey,
  value: string
): CustomerSegmentSpec {
  const current = (spec[key] as string[] | undefined) ?? []
  const has = current.some((item) => item.toLowerCase() === value.toLowerCase())
  const values = has ? current.filter((item) => item.toLowerCase() !== value.toLowerCase()) : [...current, value]
  const next = { ...spec, [key]: values } as CustomerSegmentSpec
  return normalizeSegmentSpec(next)
}

/** 조건 하나를 통째로 끈다. */
export function clearSegmentCondition(spec: CustomerSegmentSpec, key: SegmentConditionKey): CustomerSegmentSpec {
  const next = { ...spec }
  delete next[key]
  return normalizeSegmentSpec(next)
}

export type SegmentTagMode = "any" | "all"

/**
 * 라벨 방식(모두/하나)은 스펙(=URL)에서 파생한다 — 고른 라벨이 있으면 그 키가 곧 방식이다. 둘 다 있으면
 * 정규화 규칙(foldSegmentTagModes)과 같게 "all". 고른 라벨이 없을 때만 화면이 기억한 선호(fallback)를 쓴다.
 * 마운트 때 한 번 정해 두면 뒤로 가기·딥링크로 URL 이 바뀔 때 토글이 엇나간다(2026-09-25 리뷰).
 */
export function segmentTagMode(spec: CustomerSegmentSpec | null | undefined, fallback: SegmentTagMode): SegmentTagMode {
  if (spec?.tagsAll?.length) return "all"
  if (spec?.tagsAny?.length) return "any"
  return fallback
}

/** 방식 전환 — 이미 고른 라벨을 새 방식 키로 옮긴다(선택을 잃지 않게). */
export function switchSegmentTagMode(spec: CustomerSegmentSpec, mode: SegmentTagMode): CustomerSegmentSpec {
  const selected = [...(spec.tagsAll ?? []), ...(spec.tagsAny ?? [])]
  const next: CustomerSegmentSpec = { ...spec }
  delete next.tagsAll
  delete next.tagsAny
  if (selected.length) next[mode === "all" ? "tagsAll" : "tagsAny"] = selected
  return normalizeSegmentSpec(next)
}

// ── 행 판정 ─────────────────────────────────────────────────────────────────

/** 판정에 필요한 행 필드만 — 통합 행(CrmUnifiedCustomerRow)이 그대로 들어온다. */
export interface SegmentRowInput {
  source: string
  expireAt: string | null
  depletionInDays?: number | null
  lastContactAt?: string | null
  /** 통합 행 라이프사이클 — 무연락 조건이 종료(closed) 행을 뺀다(저장 뷰 dormant 와 같은 정의). */
  lifecycle?: string | null
  balance: number | null
  riskLevel?: string | null
  billingMode?: string | null
  ownerKeys: string[]
  regionLabel?: string | null
  tags: string[]
}

export interface SegmentMatcher {
  key: SegmentConditionKey
  test: (row: SegmentRowInput) => boolean
}

function normalizeKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

/** 조건 하나(키 + 값)의 판정 함수. 값이 비었으면 null(조건 없음). */
export function segmentConditionMatcher(
  key: SegmentConditionKey,
  spec: CustomerSegmentSpec,
  nowMs: number
): SegmentMatcher | null {
  switch (key) {
    case "expDays": {
      const days = spec.expDays
      if (days == null) return null
      return { key, test: (row) => isExpiringWithinDays(row.expireAt, days, nowMs) }
    }
    case "depDays": {
      const days = spec.depDays
      if (days == null) return null
      return {
        key,
        test: (row) => row.depletionInDays != null && row.depletionInDays >= 0 && row.depletionInDays <= days,
      }
    }
    case "noContactDays": {
      const days = spec.noContactDays
      if (days == null) return null
      // "N일+ 미접촉" 저장 뷰와 같은 정의(isNoContactForDays) — 종료 행 제외, 경과 일수 기준.
      return { key, test: (row) => isNoContactForDays(row, days, nowMs) }
    }
    case "minBalanceCny": {
      const min = spec.minBalanceCny
      if (min == null) return null
      // 통화별 축 — NEO 잔액(¥)만. 전환 고객(₩)·리드는 이 조건에 걸리지 않는다.
      return { key, test: (row) => row.source === "neo_account" && row.balance != null && row.balance >= min }
    }
    case "kinds": {
      const kinds = spec.kinds
      if (!kinds?.length) return null
      const set = new Set<string>(kinds)
      return { key, test: (row) => set.has(row.source) }
    }
    case "risk": {
      const levels = spec.risk
      if (!levels?.length) return null
      const set = new Set<string>(levels)
      return { key, test: (row) => row.riskLevel != null && set.has(row.riskLevel) }
    }
    case "billing": {
      const modes = spec.billing
      if (!modes?.length) return null
      const set = new Set<string>(modes)
      return { key, test: (row) => row.billingMode != null && set.has(row.billingMode) }
    }
    case "owners": {
      const owners = spec.owners
      if (!owners?.length) return null
      const wantsNone = owners.includes(SEGMENT_NONE_TOKEN)
      const keys = new Set(
        owners.filter((owner) => owner !== SEGMENT_NONE_TOKEN && !isUnassignedOwnerKey(owner)).map(normalizeKey)
      )
      // 미배정 = 실제 담당 키가 없다(자리표시 "담당 미지정"만 있는 NEO 고객 포함) — 선택지(segmentOwnerFacetValues)와 같은 규칙.
      return {
        key,
        test: (row) => {
          const assigned = assignedOwnerKeys(row.ownerKeys)
          return (wantsNone && assigned.length === 0) || assigned.some((ownerKey) => keys.has(normalizeKey(ownerKey)))
        },
      }
    }
    case "regions": {
      const regions = spec.regions
      if (!regions?.length) return null
      const wantsNone = regions.includes(SEGMENT_NONE_TOKEN)
      const labels = new Set(regions.filter((region) => region !== SEGMENT_NONE_TOKEN).map(normalizeKey))
      return {
        key,
        test: (row) => (wantsNone && !row.regionLabel) || (row.regionLabel != null && labels.has(normalizeKey(row.regionLabel))),
      }
    }
    case "tagsAll": {
      const tags = spec.tagsAll
      if (!tags?.length) return null
      return { key, test: (row) => tags.every((tag) => isDuplicateTag(row.tags, tag)) }
    }
    case "tagsAny": {
      const tags = spec.tagsAny
      if (!tags?.length) return null
      return { key, test: (row) => tags.some((tag) => isDuplicateTag(row.tags, tag)) }
    }
  }
}

/** 켜진 조건 전부의 판정 함수(정규형 순서). */
export function buildSegmentMatchers(spec: CustomerSegmentSpec | null | undefined, nowMs: number): SegmentMatcher[] {
  const normalized = normalizeSegmentSpec(spec)
  return activeSegmentConditionKeys(normalized)
    .map((key) => segmentConditionMatcher(key, normalized, nowMs))
    .filter((matcher): matcher is SegmentMatcher => matcher != null)
}

/** 조건 AND 판정. 조건이 없으면 항상 true. */
export function rowMatchesSegmentSpec(
  row: SegmentRowInput,
  spec: CustomerSegmentSpec | null | undefined,
  nowMs: number
): boolean {
  return buildSegmentMatchers(spec, nowMs).every((matcher) => matcher.test(row))
}

/** 칩 하나의 건수 키 — `${조건}:${값}` (예: "expDays:30", "risk:urgent"). */
export function segmentOptionKey(key: SegmentConditionKey, value: string | number): string {
  return `${key}:${value}`
}

/**
 * 화면 칩이 보여줄 선택지(조건·값) 목록 — 프리셋 숫자 + 켜진 비프리셋 숫자 + enum 값.
 * 담당·지역·라벨은 값 공간이 열려 있어 facets 로 따로 센다.
 */
export function segmentChipOptions(spec: CustomerSegmentSpec | null | undefined): Array<{ key: SegmentConditionKey; value: string | number }> {
  const normalized = normalizeSegmentSpec(spec)
  const options: Array<{ key: SegmentConditionKey; value: string | number }> = []
  for (const key of SEGMENT_NUMBER_KEYS) {
    const presets = [...SEGMENT_NUMBER_PRESETS[key]]
    const active = normalized[key]
    if (active != null && !presets.includes(active)) presets.push(active)
    for (const value of presets) options.push({ key, value })
  }
  for (const value of SEGMENT_KIND_VALUES) options.push({ key: "kinds", value })
  for (const value of SEGMENT_RISK_VALUES) options.push({ key: "risk", value })
  for (const value of SEGMENT_BILLING_VALUES) options.push({ key: "billing", value })
  return options
}

/** 선택지 하나를 단독 조건 스펙으로 — 칩 건수(현재 베이스 ∧ 이 값 하나)를 셀 때 쓴다. */
export function singleOptionSpec(key: SegmentConditionKey, value: string | number): CustomerSegmentSpec {
  if ((SEGMENT_NUMBER_KEYS as readonly string[]).includes(key)) {
    return normalizeSegmentSpec({ [key]: Number(value) } as CustomerSegmentSpec)
  }
  return normalizeSegmentSpec({ [key]: [String(value)] } as CustomerSegmentSpec)
}

// ── 표기 ────────────────────────────────────────────────────────────────────

function formatCny(value: number) {
  return value >= 10_000 && value % 10_000 === 0 ? `¥${(value / 10_000).toLocaleString("ko-KR")}만` : `¥${value.toLocaleString("ko-KR")}`
}

/** 숫자 조건 칩 라벨 — "만료 30일 이내" 등. */
export function segmentNumberLabel(key: SegmentNumberKey, value: number): string {
  switch (key) {
    case "expDays":
      return `만료 ${value}일 이내`
    case "depDays":
      return `소진 ${value}일 이내`
    case "noContactDays":
      return `무연락 ${value}일+`
    case "minBalanceCny":
      return `잔액 ${formatCny(value)}+`
  }
}

/** 켜진 조건을 사람이 읽는 짧은 문구로 — 결과 캡션·CSV 안내용. */
export function describeSegmentSpec(spec: CustomerSegmentSpec | null | undefined): string[] {
  const normalized = normalizeSegmentSpec(spec)
  const parts: string[] = []
  for (const key of SEGMENT_NUMBER_KEYS) {
    const value = normalized[key]
    if (value != null) parts.push(segmentNumberLabel(key, value))
  }
  if (normalized.kinds?.length) parts.push(`종류 ${normalized.kinds.map((kind) => SEGMENT_KIND_LABELS[kind]).join("·")}`)
  if (normalized.risk?.length) parts.push(`위험 ${normalized.risk.map((level) => SEGMENT_RISK_LABELS[level]).join("·")}`)
  if (normalized.billing?.length) parts.push(`과금 ${normalized.billing.map((mode) => SEGMENT_BILLING_LABELS[mode]).join("·")}`)
  if (normalized.owners?.length) {
    parts.push(
      `담당 ${normalized.owners.map((owner) => (owner === SEGMENT_NONE_TOKEN ? SEGMENT_OWNER_NONE_LABEL : owner)).join("·")}`
    )
  }
  if (normalized.regions?.length) {
    parts.push(`지역 ${normalized.regions.map((region) => (region === SEGMENT_NONE_TOKEN ? "미지정" : region)).join("·")}`)
  }
  if (normalized.tagsAll?.length) parts.push(`라벨 모두 ${normalized.tagsAll.join("·")}`)
  if (normalized.tagsAny?.length) parts.push(`라벨 하나 ${normalized.tagsAny.join("·")}`)
  return parts
}
