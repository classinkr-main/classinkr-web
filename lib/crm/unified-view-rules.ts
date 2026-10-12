// 통합 고객 목록의 순수 뷰 규칙 — 타입 + 매칭 함수만 담는 클라이언트 안전 모듈.
// 서버 전용 코드(Supabase/server-only)를 절대 import하지 않는다. 데이터 적재는
// lib/repositories/crm-unified-customers.ts(서버 저장소)가 담당하고, 이 모듈은
// "어떤 행이 어떤 저장 뷰에 보이는가"라는 규칙만 소유한다(단위 테스트 대상).

import type { CrmPriorityBucket, CrmPrioritySource } from "@/lib/crm/priority"
import type { ServiceRiskLevel } from "@/lib/crm/service-risk"
import type { LastContactSource } from "@/lib/crm/last-contact"
import type { CrmNeoBillingMode, LeadStatus } from "@/lib/supabase/database.types"
import {
  DORMANT_CONTACT_DAYS,
  RECENT_CONTACT_DAYS,
  daysSinceIso,
  daysUntilIso,
  isExpiringSoon,
  isNoContactForDays,
} from "@/lib/crm/customer-segment-spec"

// "customer" = 리드 전환(convert-v2)이 만드는 portal customers 테이블의 앱 고객.
export type CrmUnifiedCustomerSource = CrmPrioritySource | "customer"
// 돈흐름 "-" 표기가 뭉개던 세 가지 이유의 구분.
// value=표기할 금액 있음 · zero=원천은 조인됐으나 전부 0원 · unsynced=스냅샷 미조인(EEO/Shroff) ·
// none=돈흐름 개념이 없는 소스(리드).
export type CrmUnifiedMoneyState = "value" | "zero" | "unsynced" | "none"
export type CrmUnifiedLifecycle = "new_lead" | "active_lead" | "account_risk" | "active_account" | "closed"
export type CrmUnifiedSavedView =
  | "all"
  | "priority"
  | "new_leads"
  | "needs_care"
  | "my_owner"
  | "recent_contact"
  | "active_deal"
  | "expiring"
  | "dormant"
  | "hot_lead"
  | "upsell"
  | "site_leads"
  | "unanswered"
  | "meta_leads"
  | "registered_leads"

export interface CrmUnifiedCustomerRow {
  key: string
  source: CrmUnifiedCustomerSource
  sourceLabel: string
  name: string
  contact: string | null
  regionLabel?: string | null
  ownerName: string | null
  ownerKeys: string[]
  lifecycle: CrmUnifiedLifecycle
  statusLabel: string
  nextActionLabel: string
  priorityReason: string
  score: number
  /**
   * 우선순위 엔진(buildLeadPriorityItem/buildNeoAccountPriorityItem)이 판단한 버킷 그대로.
   * 엔진 미적용 행(전환 고객)·엔진이 null을 준 행(정보 없음 계정, 게이트 탈락 리드)은 null이며
   * 정렬 시 "watch"로 취급한다. 라벨 문자열에서 재파생하지 않는다(엔진 판단이 SSOT).
   */
  bucket: CrmPriorityBucket | null
  moneyLabel: string | null
  /** moneyLabel이 null("-")일 때의 사유 구분 — 표기는 UI가 결정한다. */
  moneyState: CrmUnifiedMoneyState
  href: string
  updatedAt: string | null
  expireAt: string | null
  balance: number | null
  tags: string[]
  /** 리드 유입 출신 (lead 전용, 그 외 null) */
  origin: "site" | "ad" | "team" | null
  /**
   * NEO(회사 CRM) 등록 배지 — crm_source_links 의 lead→external_account·external_lead 확정 링크를 모두 센다.
   * 기록 위치 판정(360·오늘 연락과 같은 external_account 만)에는 아래 neoAccountConfirmed 를 쓴다.
   */
  crmRegistered: boolean
  /** 미확인(confirmed_at null)·status new 리드 — site_leads/unanswered 뷰에서만 노출 */
  provisional: boolean
  /** 응답 SLA 대상 소스(demo_modal/contact_page/meta_lead_ads) 여부 */
  slaTarget: boolean
  /** 이 리드를 대상으로 한 팀 최초 기록 시각 (없으면 null) */
  firstResponseAt: string | null
  /** 리드 생성 시각(SLA 경과 계산용, lead 전용) */
  createdAt: string | null
  /**
   * 마지막 연락 시각 — max(리드 연락 로그, 사람 기록 이벤트, Compass 사람 활동)(lib/crm/last-contact.ts).
   * 기록이 전혀 없으면 null("기록 없음" — 0일이 아니다).
   */
  lastContactAt?: string | null
  /** 마지막 연락의 원천(home_log·home_event·compass, 세부를 못 읽었으면 home). */
  lastContactSource?: LastContactSource | null
  /** 마지막 연락 채널 코드(로그 type · 이벤트 source_type · Compass kind) — 표시는 lastContactChannelLabel. */
  lastContactChannel?: string | null
  /** 마지막 연락한 사람(표시 이름). */
  lastContactActor?: string | null
  /** Portal V2에서 현재 진행 중인 딜 수 */
  activeDealCount?: number
  // ── NEO 스냅샷 신호(SG2) — neo_account 행만 채운다. 다른 원천은 null/미정. ──
  /** 잔액 소진까지 남은 일수 추정(스냅샷 depletion_in_days). 표본 부족이면 null. */
  depletionInDays?: number | null
  /** 과금 방식(매출시트 J열 — consumption=충전제·subscription=구독제 …). */
  billingMode?: CrmNeoBillingMode | null
  /** 서비스 위험 등급(스냅샷 risk_level) — 우선순위 점수와 별개인 원천 판정. */
  riskLevel?: ServiceRiskLevel | null
  /** 위험 사유 라벨(스냅샷 risk_reasons[].label). */
  riskReasonLabels?: string[]
  /** 최근 수업일(EEO LastClassDate). */
  lastClassAt?: string | null
  // ── 통화별 원시 금액(CSV 열 분리용 — ₩/$/¥ 합산 금지). moneyLabel 은 표시용 문자열이다. ──
  /** 외부 CRM 오더 합계(USD) — neo_account 행만 */
  orderAmountUsd?: number | null
  /** 전환 고객 계약 금액(KRW) — customer 행만 */
  contractedKrw?: number | null
  /** 전환 고객 미수 잔액(KRW) — customer 행만 */
  outstandingKrw?: number | null
  /**
   * 같은 전화 키의 Compass 리드(대표 1건) — A안 "Compass에서 열기" 딥링크용(2026-09-25).
   * 읽기 전용 참조다(교차 쓰기 0). 매칭이 없거나 Compass 가 끊겼으면 null/미정 — 화면은 링크를 그리지 않는다.
   * 전화 키 자체는 싣지 않는다(API 응답에 전화 키 노출 금지).
   */
  compass?: CrmUnifiedCompassRef | null
  // ── 기록 위치 판정 힌트(A안, 2026-09-26 교차 리뷰 [25] 후속) — lead 행만 채운다. 다른 원천은 미정. ──
  // 이름은 components/admin/crm/unified/UnifiedCompassLink.tsx 의 UnifiedCompassWriteHints 와 같다(그대로 흘러든다).
  // 둘 다 옵셔널이다 — 옛 캐시 스냅샷·조회 실패면 미정(= 모름)이고, 화면은 statusLabel·neo-registered 원천으로 폴백한다.
  /** 리드 상태 원값(leads.status). 표시는 statusLabel 이 한다 — 이 값은 판정 입력(resolveCrmWriteSurface)용. */
  leadStatus?: LeadStatus | null
  /**
   * 리드 → NEO 계정(external_account) 등록 확정 — 고객 360 findConfirmedLeadNeoLink·GET /api/admin/crm/leads/neo-registered
   * 와 같은 집합(listConfirmedLeadNeoAccountLinks). crmRegistered(external_lead 까지 세는 배지)와 다르다 — 섞으면 목록과
   * 360 이 반대 방향으로 갈린다. 링크 조회가 실패한 스냅샷에서는 필드를 싣지 않는다(false 로 위장하지 않는다).
   */
  neoAccountConfirmed?: boolean
}

/** 통합 행의 Compass 참조 — url 은 lib/compass/normalize.ts compassLeadUrl(leadId) 결과. */
export interface CrmUnifiedCompassRef {
  leadId: number
  url: string
  /** Compass 퍼널 단계 한글 라벨(COMPASS_STAGE_LABEL) — 모르면 null */
  stageLabel: string | null
}

export function rowMatchesOwner(row: CrmUnifiedCustomerRow, ownerKeys: Set<string>) {
  if (ownerKeys.size === 0) return true
  return row.ownerKeys.some((key) => ownerKeys.has(key))
}

export function daysUntil(iso: string | null, nowMs: number): number | null {
  return daysUntilIso(iso, nowMs)
}

export function matchesSavedView(
  row: CrmUnifiedCustomerRow,
  view: CrmUnifiedSavedView,
  ownerKeys: Set<string>,
  nowMs: number
) {
  if (view === "all") return true
  if (view === "priority") return row.score >= 68
  if (view === "new_leads") return row.lifecycle === "new_lead"
  if (view === "needs_care") return row.source === "neo_account" && row.lifecycle === "account_risk"
  if (view === "my_owner") return ownerKeys.size > 0 && rowMatchesOwner(row, ownerKeys)
  // 최근 컨택: 마지막 연락(Home 기록·Compass 활동)이 최근 RECENT_CONTACT_DAYS 안.
  if (view === "recent_contact") {
    const since = daysSinceIso(row.lastContactAt ?? null, nowMs)
    return since != null && since >= 0 && since <= RECENT_CONTACT_DAYS
  }
  // 진행 중인 딜: Portal V2 고객 중 active_deals가 1건 이상.
  if (view === "active_deal") return row.source === "customer" && (row.activeDealCount ?? 0) > 0
  // 만료 임박: 만료일이 오늘부터 EXPIRING_SOON_DAYS(30일) 안 — 행 플래그·재연락 알림과 같은 SSOT
  // (lib/crm/customer-segment-spec.ts). 이미 지난 만료는 "만료"로 따로 부른다(우선순위 엔진 "만료 회복").
  if (view === "expiring") return isExpiringSoon(row.expireAt, nowMs)
  // 30일+ 미접촉: 마지막 연락(lastContactAt)이 DORMANT_CONTACT_DAYS 이상 전이거나 연락 기록이 없다.
  // updatedAt(NEO는 동기화 시각, 리드는 팔로업일)으로 판정하던 결함(F2)을 걷어냈다. 종료 리드는 뺀다.
  // 정의는 "무연락 N일+" 조건 칩과 공용(isNoContactForDays) — 같은 30일이면 칩과 뷰가 같은 건수다.
  if (view === "dormant") return isNoContactForDays(row, DORMANT_CONTACT_DAYS, nowMs)
  // 고전환 리드: 우선순위 점수 상위 리드.
  if (view === "hot_lead") return row.source === "lead" && row.score >= 68
  // 업셀 후보: 위험 아닌 활성 고객 + 잔액 보유.
  if (view === "upsell") {
    return row.source === "neo_account" && row.lifecycle !== "account_risk" && (row.balance ?? 0) > 0
  }
  // 홈페이지 유입 & NEO 미등록 — "등록 대기 큐".
  if (view === "site_leads") return row.source === "lead" && row.origin === "site" && !row.crmRegistered
  // 응답 SLA 대상 & 팀 첫 기록 없음.
  if (view === "unanswered") return row.source === "lead" && row.slaTarget && !row.firstResponseAt
  // 메타 광고 리드 — 유입 출처가 광고(ad)인 리드(2026-09-20 Compass 정리 라운드 S4).
  if (view === "meta_leads") return row.source === "lead" && row.origin === "ad"
  // NEO 등록 리드 — crm_source_links로 외부 CRM 등록이 확정된 리드.
  if (view === "registered_leads") return row.source === "lead" && row.crmRegistered
  return true
}

// 미확인(provisional) 리드는 처리 큐 또는 실제 컨택 근거가 있는 뷰에서만 노출한다.
const PROVISIONAL_VISIBLE_VIEWS: ReadonlySet<CrmUnifiedSavedView> = new Set([
  "site_leads",
  "unanswered",
  "recent_contact",
])

/**
 * 확인 게이트 — 이 뷰에서 미확인 리드가 기본으로 숨겨지는가.
 * 숨기는 뷰에서도 건수는 항상 내려주고 사용자가 `includeUnconfirmed`로 명시 포함할 수 있어야
 * 한다(플레이북 04-growth-crm §3). 리드 보드의 CONFIRMATION_GATE_EXEMPT_FILTERS와 같은 역할.
 */
export function isUnconfirmedGatedInView(row: CrmUnifiedCustomerRow, view: CrmUnifiedSavedView) {
  return row.provisional && !PROVISIONAL_VISIBLE_VIEWS.has(view)
}

export function rowVisibleInView(
  row: CrmUnifiedCustomerRow,
  view: CrmUnifiedSavedView,
  ownerKeys: Set<string>,
  nowMs: number,
  // true면 확인 게이트를 우회해 미확인 리드도 뷰 규칙만으로 판정한다(리드 보드 "미확인 포함" 토글과 동일 UX).
  includeUnconfirmed = false
) {
  if (!includeUnconfirmed && isUnconfirmedGatedInView(row, view)) return false
  return matchesSavedView(row, view, ownerKeys, nowMs)
}

/**
 * 게이트 때문에 숨겨진 미확인 리드 — 뷰 규칙은 통과하지만 확인 게이트에만 걸린 행.
 * includeUnconfirmed=true로 다시 조회하면 정확히 이 행들이 목록에 추가된다.
 */
export function rowHiddenByUnconfirmedGate(
  row: CrmUnifiedCustomerRow,
  view: CrmUnifiedSavedView,
  ownerKeys: Set<string>,
  nowMs: number
) {
  return isUnconfirmedGatedInView(row, view) && matchesSavedView(row, view, ownerKeys, nowMs)
}

// ── 목록 쿼리 파싱(통합 목록 GET · CSV 내보내기 GET 공용) ─────────────────────
// 두 라우트가 같은 쿼리 파라미터를 같은 규칙으로 읽어야 "화면에 보이는 조건 = 내보내는 조건"이 된다.

const UNIFIED_SOURCES: readonly CrmUnifiedCustomerSource[] = ["lead", "neo_account", "customer"]
const UNIFIED_LIFECYCLES: readonly CrmUnifiedLifecycle[] = ["new_lead", "active_lead", "account_risk", "active_account", "closed"]
const UNIFIED_SAVED_VIEWS: readonly CrmUnifiedSavedView[] = [
  "priority",
  "new_leads",
  "needs_care",
  "my_owner",
  "recent_contact",
  "active_deal",
  "expiring",
  "dormant",
  "hot_lead",
  "upsell",
  "site_leads",
  "unanswered",
  "meta_leads",
  "registered_leads",
]

export function parseUnifiedSource(value: string | null | undefined): CrmUnifiedCustomerSource | "all" {
  return value && (UNIFIED_SOURCES as readonly string[]).includes(value) ? (value as CrmUnifiedCustomerSource) : "all"
}

export function parseUnifiedLifecycle(value: string | null | undefined): CrmUnifiedLifecycle | "all" {
  return value && (UNIFIED_LIFECYCLES as readonly string[]).includes(value) ? (value as CrmUnifiedLifecycle) : "all"
}

export function parseUnifiedSavedView(value: string | null | undefined): CrmUnifiedSavedView {
  return value && (UNIFIED_SAVED_VIEWS as readonly string[]).includes(value) ? (value as CrmUnifiedSavedView) : "all"
}

// 리드 보드의 `unconfirmed=1`과 같은 의미 — 확인 게이트를 우회해 미확인 리드를 목록에 포함한다.
export function parseIncludeUnconfirmedParam(value: string | null | undefined) {
  return value === "1" || value === "true"
}

// ── 서버 정렬(C1) ───────────────────────────────────────────────────────────
// 헤더 정렬은 서버가 현재 조건 전체를 정렬한 뒤 페이지를 자른다(예전엔 현재 페이지 ≤50건만 재정렬).
// 정렬 없음(null) = 추천순(엔진 버킷 → 점수 → 시각). 동률은 추천순을 그대로 둔다(안정 정렬).

export type UnifiedSortKey = "name" | "status" | "updated" | "owner" | "score" | "last_contact"
export type UnifiedSortDirection = "asc" | "desc"
export interface UnifiedSortState {
  key: UnifiedSortKey
  direction: UnifiedSortDirection
}

export const UNIFIED_SORT_KEYS: readonly UnifiedSortKey[] = ["name", "status", "updated", "owner", "score", "last_contact"]

// 컬럼 성격별 첫 클릭 방향 — 이름·상태·담당은 가나다, 시각·점수는 최신·높은 순이 자연스럽다.
// 마지막 연락은 "오래 연락 안 한 순"(오름차순)이 행동에 가깝다.
export const UNIFIED_SORT_DEFAULT_DIRECTION: Record<UnifiedSortKey, UnifiedSortDirection> = {
  name: "asc",
  status: "asc",
  updated: "desc",
  owner: "asc",
  score: "desc",
  last_contact: "asc",
}

/** `?sort=&dir=` 파싱 — 모르는 키면 null(추천순), 방향이 없거나 틀리면 키의 기본 방향. */
export function parseUnifiedSort(sort: string | null | undefined, dir: string | null | undefined): UnifiedSortState | null {
  if (!sort || !(UNIFIED_SORT_KEYS as readonly string[]).includes(sort)) return null
  const key = sort as UnifiedSortKey
  const direction: UnifiedSortDirection = dir === "asc" || dir === "desc" ? dir : UNIFIED_SORT_DEFAULT_DIRECTION[key]
  return { key, direction }
}

function isoMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = new Date(iso).getTime()
  return Number.isNaN(ms) ? null : ms
}

// 담당 미배정·시각 없음·연락 기록 없음은 방향과 무관하게 항상 마지막 — 방향을 바꿀 때마다 빈 값이
// 맨 위로 튀어 오르면 스캔이 끊긴다.
function sortValueMissing(row: CrmUnifiedCustomerRow, key: UnifiedSortKey) {
  if (key === "owner") return !row.ownerName
  if (key === "updated") return isoMs(row.updatedAt) == null
  if (key === "last_contact") return isoMs(row.lastContactAt) == null
  return false
}

function compareRows(a: CrmUnifiedCustomerRow, b: CrmUnifiedCustomerRow, key: UnifiedSortKey) {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "ko")
    case "status":
      return a.statusLabel.localeCompare(b.statusLabel, "ko")
    case "updated":
      return (isoMs(a.updatedAt) ?? 0) - (isoMs(b.updatedAt) ?? 0)
    case "owner":
      return (a.ownerName ?? "").localeCompare(b.ownerName ?? "", "ko")
    case "score":
      return a.score - b.score
    case "last_contact":
      return (isoMs(a.lastContactAt) ?? 0) - (isoMs(b.lastContactAt) ?? 0)
  }
}

/** 정렬(새 배열). sort가 null이면 입력 순서(추천순) 그대로. */
export function sortUnifiedRows<T extends CrmUnifiedCustomerRow>(rows: readonly T[], sort: UnifiedSortState | null): T[] {
  if (!sort) return [...rows]
  const sign = sort.direction === "asc" ? 1 : -1
  return [...rows].sort((a, b) => {
    const aMissing = sortValueMissing(a, sort.key)
    const bMissing = sortValueMissing(b, sort.key)
    if (aMissing !== bMissing) return aMissing ? 1 : -1
    return sign * compareRows(a, b, sort.key)
  })
}
