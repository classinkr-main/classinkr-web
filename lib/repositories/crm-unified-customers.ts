import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"
import { shareInFlight } from "@/lib/server/share-in-flight"

import { ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { DIRECT_INBOUND_LEAD_SOURCES } from "@/lib/lead-types"
import {
  CRM_PRIORITY_BUCKET_LABELS,
  buildLeadPriorityItem,
  buildNeoAccountPriorityItem,
  sortPriorityItems,
  type CrmPriorityItem,
} from "@/lib/crm/priority"
import { classifyLeadOrigin } from "@/lib/crm/capture/origin"
import { hasAdClickId, isTestLead } from "@/lib/crm/lead-attribution"
import { buildCompassDemoIndex, hydrateCompassDemoSource } from "@/lib/crm/compass-demo-signal"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import { deriveCustomerRegion, REGION_UNSPECIFIED } from "@/lib/crm/region-label"
import {
  rowHiddenByUnconfirmedGate,
  rowMatchesOwner,
  rowVisibleInView,
  sortUnifiedRows,
  type CrmUnifiedCustomerRow,
  type CrmUnifiedCustomerSource,
  type CrmUnifiedLifecycle,
  type CrmUnifiedMoneyState,
  type CrmUnifiedSavedView,
  type UnifiedSortState,
} from "@/lib/crm/unified-view-rules"
import {
  SEGMENT_NONE_TOKEN,
  activeSegmentConditionKeys,
  buildSegmentMatchers,
  describeSegmentSpec,
  normalizeSegmentSpec,
  segmentChipOptions,
  segmentConditionMatcher,
  segmentOptionKey,
  isUnassignedOwnerKey,
  segmentOwnerFacetValues,
  singleOptionSpec,
  type CustomerSegmentSpec,
  type SegmentConditionKey,
} from "@/lib/crm/customer-segment-spec"
import {
  COMPASS_CONTACT_EXCLUDED_ACTORS,
  COMPASS_CONTACT_KINDS,
  HOME_CONTACT_EVENT_SOURCE_TYPES,
  buildCompassContactIndex,
  buildHomeContactIndex,
  contactPhoneKey,
  contactTargetKey,
  pickLatestContact,
  type HomeContactEventRow,
  type HomeContactLogRow,
  type LastContactFact,
} from "@/lib/crm/last-contact"
import { getCompassLatestActivityByPhoneKeys } from "@/lib/compass/bridge"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { fetchSupabasePages } from "@/lib/supabase/pagination"
import { listAllCustomerListItemsLite } from "@/lib/portal/repositories/customers"
import type { CustomerListItem } from "@/lib/portal/types"
// 최초 응답·최근 컨택 시각 지도(정본). 키 형식은 lib/crm/last-contact.ts contactTargetKey 와 같다
// (`${targetType}:${id}` — crmContactTargetKey).
import { getCrmCustomerContactMaps } from "@/lib/repositories/crm-events"
import {
  listConfirmedLeadNeoAccountLinks,
  listConfirmedLeadCustomerLinks,
  listConfirmedLeadNeoLinkLeadIds,
} from "@/lib/repositories/crm-source-links"
import type { LeadRecord } from "@/lib/repositories/leads"
import { computeCustomerHealth, unifiedRowHealthInput, type CustomerHealthBand } from "@/lib/crm/customer-health"
import { getAllCustomerTagsMap } from "./crm-customer-tags"
import { isDuplicateTag } from "@/lib/crm/tag-suggestions"
// 리드·NEO 고객·참여 신호·Compass 데모 원본 수집은 우선순위 큐(crm-priority-queue.ts)와
// 공유한다(2026-09-07 감사 #7) — 아래 loadSourceSnapshot 참고.
import { getCrmCoreSourceSnapshot, type CrmCoreSourceSnapshot } from "@/lib/repositories/crm-shared-source-snapshot"

// 뷰 규칙(타입+순수 매칭 함수)의 SSOT는 lib/crm/unified-view-rules.ts — 매칭 함수는 그 모듈에서
// 직접 import한다(여기서는 재수출하지 않음: provisional 게이트 없는 matchesSavedView를 repo 경유로
// 쓰는 함정 방지). 내부 필터는 rowVisibleInView만 사용하고, 타입은 기존 임포터 호환으로 재수출.
export type {
  CrmUnifiedCustomerRow,
  CrmUnifiedCustomerSource,
  CrmUnifiedLifecycle,
  CrmUnifiedMoneyState,
  CrmUnifiedSavedView,
  UnifiedSortState,
}

// 칩 카운트를 보여줄 세그먼트(저장 뷰).
export const CRM_SEGMENT_VIEWS = [
  "recent_contact",
  "active_deal",
  "hot_lead",
  "upsell",
  "dormant",
  "site_leads",
  "unanswered",
  "expiring",
  // 2026-09-20 Compass 정리 라운드 S4 — meta_leads/registered_leads 저장 뷰 칩 건수.
  "meta_leads",
  "registered_leads",
] as const
export type CrmUnifiedSourceStatusKey = "classin_leads" | "app_customers" | "external_crm" | "sheets"

// 활성 고객(neo_account) 건강도 분포 — computeCustomerHealth(SSOT)로 매핑한 실집계.
export interface CrmHealthDistribution {
  total: number
  safe: number
  watch: number
  risk: number
}

// 담당자 한 명의 건강도 분포(T2 담당별 스택바). ownerId는 행의 ownerKeys 중 표시 이름이 아닌
// 키(NEO ownerId, 소문자 정규화)이며 없으면 null. 담당 없는 고객은 ownerId null ·
// ownerName CRM_HEALTH_UNASSIGNED_OWNER_LABEL 한 행으로 모은다.
export interface CrmHealthDistributionOwnerRow {
  ownerId: string | null
  ownerName: string
  total: number
  safe: number
  watch: number
  risk: number
}

// getCrmUnifiedHealthDistribution()이 돌려주는 확장형 — 상위 4개 키는 CrmHealthDistribution과 동일
// (하위 호환), byOwner는 total 내림차순·동률은 이름 ko 정렬·미배정은 항상 맨 뒤.
export interface CrmHealthDistributionWithOwners extends CrmHealthDistribution {
  byOwner: CrmHealthDistributionOwnerRow[]
}

export const CRM_HEALTH_UNASSIGNED_OWNER_LABEL = "미배정"

export interface CrmUnifiedCustomersOptions {
  q?: string
  source?: CrmUnifiedCustomerSource | "all"
  lifecycle?: CrmUnifiedLifecycle | "all"
  view?: CrmUnifiedSavedView
  owner?: string
  ownerKeys?: string[]
  tag?: string
  /**
   * 확인 게이트 우회 — 기본(false)은 미확인(provisional) 리드를 일반 뷰에서 숨기고
   * summary.hiddenUnconfirmedCount로 건수만 알린다. true면 그 행들을 목록에 포함한다
   * (리드 보드 "미확인 포함" 토글과 같은 이름·UX).
   */
  includeUnconfirmed?: boolean
  limit?: number
  offset?: number
  now?: Date
  /**
   * 새로고침(?force=1) — 소스 스냅샷 Data Cache(unstable_cache 60초)를 읽지 않고 신선하게
   * 재수집한 뒤 태그를 즉시 하드 만료한다. 홈 우선순위 큐(getCrmPriorityQueue({ force }))와
   * 같은 계약(Wave 0 H1). 클라이언트 '새로고침'·리드 등록 직후 재조회가 등록 전 스냅샷을
   * 최대 60초 돌려받던 결함(C1)을 막는다.
   */
  bypassCache?: boolean
  /** 세그먼트 조건(SG4) — 저장 뷰·라벨·검색·담당과 AND. lib/crm/customer-segment-spec.ts. */
  segment?: CustomerSegmentSpec
  /** 서버 정렬(C1) — 조건 전체를 정렬한 뒤 페이지를 자른다. null/생략 = 추천순. */
  sort?: UnifiedSortState | null
  /** 이 행 키만(선택 내보내기용) — 다른 조건과 AND. */
  keys?: string[]
}

/** 마지막 연락 원천 상태 — 화면이 "Compass 연결 끊김 — Home 기록만"을 "기록 없음"과 구분해 보인다. */
export type CrmUnifiedCompassContactStatus = "ok" | "down" | "partial" | "skipped"

export interface CrmUnifiedCustomersMeta {
  /** Compass 활동 원천: ok · down(끊김 — Home 기록만) · partial(스캔 상한 — 일부만) · skipped(조회할 전화 없음) */
  compass: CrmUnifiedCompassContactStatus
  /** Home 연락 세부(원천·채널·작성자) 조회 — down 이면 시각만 반영("Home 기록"). */
  homeContactDetail: "ok" | "down"
}

export interface CrmUnifiedSegmentFacet {
  /** 값 — 담당·지역 "없음"은 SEGMENT_NONE_TOKEN */
  value: string
  label: string
  count: number
}

export interface CrmUnifiedSegmentSummary {
  /** 서버가 해석한 정규형 조건(알 수 없는 값은 빠짐) */
  spec: CustomerSegmentSpec
  active: boolean
  /** 켜진 조건 문구(캡션용) */
  labels: string[]
  /** 조건 적용 전 베이스(검색·필터·저장 뷰까지) 건수 */
  baseTotal: number
  /** 조건 적용 후 건수 = summary.total */
  total: number
  /** 켜진 조건 하나씩의 단독 건수(현재 베이스 기준) — 키: 조건 이름 */
  conditionCounts: Partial<Record<SegmentConditionKey, number>>
  /** 칩 선택지 하나씩의 단독 건수(현재 베이스 기준) — 키: `${조건}:${값}` */
  optionCounts: Record<string, number>
  /** 무연락 조건 단독 건수 중 연락 기록이 아예 없는 행 */
  noContactNoRecordCount: number
  /**
   * 열린 값 공간 조건의 선택지와 건수(현재 베이스 기준, 건수 내림차순). 상위 SEGMENT_FACET_LIMIT 개만 싣되
   * 지금 켜진 값은 순위 밖이어도 항상 싣는다(딥링크로 고른 값이 0건으로 보이지 않게).
   */
  facets: {
    owners: CrmUnifiedSegmentFacet[]
    regions: CrmUnifiedSegmentFacet[]
    tags: CrmUnifiedSegmentFacet[]
  }
  /** 상한 때문에 facets 에 싣지 않은 선택지 수 — 화면이 "외 N개"로 알린다(조용한 절단 금지). */
  facetHiddenCounts: {
    owners: number
    regions: number
    tags: number
  }
}

export interface CrmUnifiedCustomers {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    portalCustomersOk: boolean
    warnings: string[]
    statuses: Array<{
      key: CrmUnifiedSourceStatusKey
      label: string
      role: "primary" | "reference"
      ok: boolean
      partial: boolean
      latestSyncedAt: string | null
      message: string
    }>
  }
  summary: {
    total: number
    leadCount: number
    accountCount: number
    customerCount: number
    highPriorityCount: number
    ownerCount: number
    viewCounts: Record<string, number>
    availableTags: string[]
    /**
     * 현재 검색·필터·뷰 범위 안에서 확인 게이트 때문에 숨겨진 미확인 리드 수.
     * includeUnconfirmed=true로 재조회하면 정확히 이 건수가 목록에 추가된다(토글 on이면 0).
     */
    hiddenUnconfirmedCount: number
    /** 결과 중 연락 기록이 아예 없는 행("기록 없음") 수 */
    noContactRecordCount: number
  }
  // 활성 고객 건강도 분포 — 현재 검색/필터와 무관한 전역 집계(코크핏 도넛용).
  healthDistribution: CrmHealthDistribution
  pagination: {
    limit: number
    offset: number
    returned: number
    total: number
    hasMore: boolean
    nextOffset: number | null
  }
  owners: Array<{ ownerName: string; count: number }>
  rows: CrmUnifiedCustomerRow[]
  /** 마지막 연락 원천 상태(Compass 끊김 등) */
  meta: CrmUnifiedCustomersMeta
  /** 세그먼트 조건 요약(조건별·칩별 단독 건수, 선택지 facets) */
  segment: CrmUnifiedSegmentSummary
  /** 적용된 서버 정렬(null = 추천순) */
  sort: UnifiedSortState | null
}

function formatUSD(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!amount) return null
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
}

function formatCNY(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!amount) return null
  if (Math.abs(amount) >= 10_000) {
    return `¥${(amount / 10_000).toLocaleString("ko-KR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })}만`
  }
  return `¥${amount.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`
}

// 전환 고객(자체 DB) 계약·미수 — 같은 열의 ¥잔액·$오더와 나란히 놓이므로 통화 기호(₩)를
// 라벨 안에 포함한다(UX 규약 4). "원" 접미사만으로는 외부 CRM 값과 원화가 구분되지 않았다.
function formatKRW(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!amount) return null
  return `₩${Math.round(amount).toLocaleString("ko-KR")}`
}

function leadName(lead: LeadRecord) {
  return lead.org || lead.name || lead.email || lead.phone || "이름 없는 리드"
}

function leadLifecycle(lead: LeadRecord): CrmUnifiedLifecycle {
  if (lead.status === "new") return "new_lead"
  if (lead.status === "contacted") return "active_lead"
  return "closed"
}

function leadStatusLabel(lead: LeadRecord) {
  if (lead.status === "new") return "신규 리드"
  if (lead.status === "contacted") return "접촉 중"
  if (lead.status === "converted") return "전환 완료"
  return "종료"
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  demo_modal: "데모 신청",
  contact_page: "문의",
  newsletter: "뉴스레터",
  meta_lead_ads: "Meta 리드",
  channel_talk: "채널톡",
  manual: "수기 리드",
  admin_manual: "수기 리드",
}

function leadSourceLabel(lead: LeadRecord) {
  return (LEAD_SOURCE_LABELS[lead.source] ?? lead.source.trim()) || "리드"
}

function shouldIncludeLeadInUnifiedCustomers(lead: LeadRecord) {
  return Boolean(lead.confirmed_at) || lead.status !== "new"
}

function defaultLeadAction(lead: LeadRecord) {
  if (lead.status === "new") return "첫 응답"
  if (lead.status === "contacted") return "팔로업"
  return "기록 확인"
}

function accountLifecycle(priority: CrmPriorityItem | null): CrmUnifiedLifecycle {
  return priority && priority.score >= 42 ? "account_risk" : "active_account"
}

// 계정 상태 라벨은 라이프사이클과 같은 판정을 쓴다(F4) — 예전엔 엔진 항목이 있기만 하면(42점 미만 포함)
// "관리 필요"라 적어, "관리 필요 고객" 뷰(account_risk = 42점+)에 없는 행이 같은 라벨을 달았다.
function accountStatusLabel(priority: CrmPriorityItem | null, lifecycle: CrmUnifiedLifecycle) {
  if (lifecycle === "account_risk") return "관리 필요"
  return priority ? "관찰" : "활성 고객"
}

// 리드 전용 파생 필드(origin·NEO등록·SLA 등) — 비리드(neo/portal) 행은 항상 이 기본값.
const NON_LEAD_ROW_DEFAULTS = {
  origin: null,
  crmRegistered: false,
  provisional: false,
  slaTarget: false,
  firstResponseAt: null,
  createdAt: null,
} as const

// 응답 SLA 대상 소스 — 고객이 직접 남긴 유입 채널만(수기 등록·동기화 소스 제외).
const SLA_TARGET_LEAD_SOURCES = DIRECT_INBOUND_LEAD_SOURCES

// 리드 전환 산출물(portal customers) → 통합 행. 거래 요약(customer_deal_summary)이 있으면
// 미수·진행 딜 신호로 다음 액션과 점수를 보수적으로 잡는다(우선순위 엔진 미적용 소스).
function buildPortalCustomerRow(item: CustomerListItem, lastContactAt: string | null): CrmUnifiedCustomerRow {
  const { customer, summary } = item
  const outstanding = summary?.outstanding_amount ?? 0
  const contracted = summary?.contracted_amount ?? 0
  const activeDeals = summary?.active_deals ?? 0
  const contractedLabel = formatKRW(contracted)
  const outstandingLabel = formatKRW(outstanding)
  const region = deriveCustomerRegion([customer.region_label, customer.address])
  return {
    key: `customer:${customer.id}`,
    tags: [],
    source: "customer",
    sourceLabel: "전환 고객",
    name: [customer.name, customer.campus_name].filter(Boolean).join(" · "),
    contact: customer.phone ?? customer.email ?? customer.contact_name,
    regionLabel: region.label === REGION_UNSPECIFIED ? null : region.label,
    ownerName: null,
    ownerKeys: [],
    lifecycle: "active_account",
    statusLabel: activeDeals > 0 ? "거래 진행 중" : "전환 고객",
    nextActionLabel: outstanding > 0 ? "미수 확인" : activeDeals > 0 ? "딜 진행" : "관계 유지",
    priorityReason:
      outstanding > 0
        ? "미수 잔액 남음"
        : activeDeals > 0
          ? `진행 중 거래 ${activeDeals}건`
          : "리드 전환으로 생성된 앱 고객",
    score: outstanding > 0 ? 46 : activeDeals > 0 ? 34 : 14,
    // 우선순위 엔진 미적용 소스 — 엔진 버킷이 없으므로 null(정렬 시 watch 취급).
    bucket: null,
    moneyLabel:
      contractedLabel && outstandingLabel
        ? `계약 ${contractedLabel} · 미수 ${outstandingLabel}`
        : contractedLabel
          ? `계약 ${contractedLabel}`
          : outstandingLabel
            ? `미수 ${outstandingLabel}`
            : null,
    // 전환 고객은 거래 요약이 항상 조인되는 자사 DB 원천 — unsynced 상태가 없다.
    moneyState: Number(contracted) !== 0 || Number(outstanding) !== 0 ? "value" : "zero",
    href: `/admin/crm/deals/kpi/${encodeURIComponent(customer.partner_account_id)}`,
    updatedAt: summary?.last_deal_updated_at ?? customer.updated_at ?? customer.created_at,
    expireAt: null,
    balance: null,
    lastContactAt,
    activeDealCount: activeDeals,
    contractedKrw: summary ? Number(contracted) : null,
    outstandingKrw: summary ? Number(outstanding) : null,
    ...NON_LEAD_ROW_DEFAULTS,
  }
}

// 행의 마지막 연락 필드 ↔ LastContactFact — 폴드(리드→전환 고객·NEO 계정) 때 두 행의 연락을 합친다.
function rowContactFact(row: CrmUnifiedCustomerRow): LastContactFact | null {
  if (!row.lastContactAt) return null
  return {
    at: row.lastContactAt,
    source: row.lastContactSource ?? "home",
    channel: row.lastContactChannel ?? null,
    actor: row.lastContactActor ?? null,
  }
}

function applyContactFact(row: CrmUnifiedCustomerRow, fact: LastContactFact | null) {
  row.lastContactAt = fact?.at ?? null
  row.lastContactSource = fact?.source ?? null
  row.lastContactChannel = fact?.channel ?? null
  row.lastContactActor = fact?.actor ?? null
}

function contactFields(fact: LastContactFact | null) {
  return {
    lastContactAt: fact?.at ?? null,
    lastContactSource: fact?.source ?? null,
    lastContactChannel: fact?.channel ?? null,
    lastContactActor: fact?.actor ?? null,
  }
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

function uniqueOwnerKeys(values: Array<string | null | undefined>) {
  return [...new Set(values.map(normalize).filter(Boolean))]
}

function includesQuery(row: CrmUnifiedCustomerRow, query: string) {
  if (!query) return true
  const haystack = [row.name, row.contact, row.regionLabel, row.ownerName, row.statusLabel, row.priorityReason]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(query)
}

function buildOwnerOptions(rows: CrmUnifiedCustomerRow[]) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.ownerName) continue
    counts.set(row.ownerName, (counts.get(row.ownerName) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([ownerName, count]) => ({ ownerName, count }))
    .sort((a, b) => b.count - a.count || a.ownerName.localeCompare(b.ownerName, "ko"))
}

// 계정(neo_account) 돈흐름 상태 — 스냅샷 규약(crm-neo-customer-snapshots의
// `balance: eeo ? eeo.balance : null`)상 balance null은 "0원"이 아니라 EEO/Shroff 원천이
// 아직 조인되지 않았다는 뜻이다. 값·전부 0원·미동기화를 구분해 행에 저장한다.
function accountMoneyState(
  balance: number | null | undefined,
  orderAmount: number | null | undefined
): CrmUnifiedMoneyState {
  const balanceValue = balance == null ? null : Number(balance)
  const orderValue = orderAmount == null ? null : Number(orderAmount)
  if ((balanceValue ?? 0) !== 0 || (orderValue ?? 0) !== 0) return "value"
  if (balanceValue == null) return "unsynced"
  return "zero"
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

// 활성 고객(neo_account) 행 → 건강도 밴드(F3) — 입력 규칙은 lib/crm/customer-health.ts
// unifiedRowHealthInput 한 곳: 서비스 위험은 스냅샷 riskLevel 우선, NEO 충전 잔액은 미수가 아니므로
// 감점하지 않고, 마지막 연락 경과일을 넣는다(기록 없음은 감점 없음).
function rowHealthBand(row: CrmUnifiedCustomerRow, nowMs: number): CustomerHealthBand {
  return computeCustomerHealth(unifiedRowHealthInput(row, nowMs)).band
}

// 활성 고객(neo_account) 건강도 분포 집계 — 전역(필터 무관). getCrmUnifiedCustomers()의
// healthDistribution 필드와 getCrmUnifiedHealthDistribution() 경량 경로가 공유하는 단일 산식.
// 태그 부착 여부와 무관(rowHealthBand는 tags를 보지 않음)하므로 태그 없는 스냅샷 원본 rows에
// 바로 적용해도 의미 동일.
// 전체 합계와 담당별 합계를 같은 순회 한 번에 모은다(추가 쿼리·재순회 없음). 담당 묶음 키는
// buildOwnerOptions와 같은 ownerName 기준(정규화)이라 통합 목록의 담당 카운트와 같은 이름으로 묶인다.
function collectHealthDistribution(
  rows: CrmUnifiedCustomerRow[],
  nowMs: number
): CrmHealthDistributionWithOwners {
  const totals: CrmHealthDistribution = { total: 0, safe: 0, watch: 0, risk: 0 }
  const byOwnerKey = new Map<string, CrmHealthDistributionOwnerRow>()
  for (const row of rows) {
    if (row.source !== "neo_account") continue
    const band = rowHealthBand(row, nowMs)
    totals.total += 1
    totals[band] += 1

    // 자리표시 이름("담당 미지정")은 사람이 아니라 미배정이다 — 세그먼트 담당 조건·선택지와 같은 규칙.
    const rawOwnerName = row.ownerName?.trim() ?? ""
    const ownerName = isUnassignedOwnerKey(rawOwnerName) ? "" : rawOwnerName
    const groupKey = normalize(ownerName)
    let bucket = byOwnerKey.get(groupKey)
    if (!bucket) {
      bucket = {
        ownerId: groupKey ? ((row.ownerKeys ?? []).find((key) => key !== groupKey) ?? null) : null,
        ownerName: ownerName || CRM_HEALTH_UNASSIGNED_OWNER_LABEL,
        total: 0,
        safe: 0,
        watch: 0,
        risk: 0,
      }
      byOwnerKey.set(groupKey, bucket)
    }
    bucket.total += 1
    bucket[band] += 1
  }
  const byOwner = Array.from(byOwnerKey.entries())
    .sort(([aKey, a], [bKey, b]) => {
      // 미배정("" 키)은 건수와 무관하게 맨 뒤.
      if (!aKey !== !bKey) return aKey ? -1 : 1
      return b.total - a.total || a.ownerName.localeCompare(b.ownerName, "ko")
    })
    .map(([, bucket]) => bucket)
  return { ...totals, byOwner }
}

// getCrmUnifiedCustomers().healthDistribution 용 — 기존 4개 키만 돌려 응답 형태를 바꾸지 않는다.
function computeHealthDistribution(rows: CrmUnifiedCustomerRow[], nowMs: number): CrmHealthDistribution {
  const { total, safe, watch, risk } = collectHealthDistribution(rows, nowMs)
  return { total, safe, watch, risk }
}

// ── 소스 스냅샷 Data Cache (7-23 감사 3-A 서버 메모이제이션 → 콜드 인스턴스 대응 승격) ──
// 필터/검색/페이지/뷰가 바뀔 때마다 6개 소스를 전부 다시 모아 행을 재조립했다
// (실측 0.8~1.6s). 조립 결과는 옵션과 무관한 "필터 이전" 스냅샷이므로 한 번 만들어
// 60초 공유한다. NEO 모듈 캐시(lib/admin-crm-customers-neo.ts:132)와 같은 TTL.
// health-distribution 라우트는 getCrmUnifiedHealthDistribution()으로 이 스냅샷만
// 태우고 필터·정렬 등 후처리는 건너뛴다(하단 참고).
//
// 예전엔 인스턴스 모듈 메모(let 캐시 + in-flight promise + generation 유사 가드)였다 —
// Vercel Fluid 인스턴스가 콜드일 때마다 비어 있어 매 요청이 6개 소스 전량 재수집을 물었다.
// unstable_cache(Data Cache)는 인스턴스 간 공유되고 Next 16에서 stale-while-revalidate라
// 콜드 인스턴스에서도 다른 인스턴스가 데운 값을 즉시 돌려준다. 동시 요청 중복 계산 방지
// (구 in-flight promise)는 unstable_cache가 대신하므로 별도 가드를 두지 않는다 — 남는 차이는
// "완전히 빈 캐시에 동시에 두 요청이 도착하는" 드문 경합에서 중복 계산이 한 번 더 일어날 수
// 있다는 것뿐이고, 하루 수십 건 수준의 어드민 트래픽에서는 감수할 만하다.
// - 태그는 스냅샷에 넣지 않는다 — 요청마다 getAllCustomerTagsMap(자체 30초 캐시,
//   쓰기 시 즉시 무효화)을 읽어 부착하므로 태그 추가/삭제가 이 TTL을 기다리지 않는다.
// - 모든 소스가 성공했을 때만 저장(NEO의 `if (value.ok)`와 동일 원칙) — 부분 실패
//   스냅샷을 60초 고정하지 않고 다음 요청이 즉시 재시도한다. unstable_cache는 throw한
//   호출을 캐시에 쓰지 않으므로(성공 값만 저장), incomplete면 여기서 던져 이 성질을 지킨다.
// - options.now가 주어진 호출(테스트·고정 시각)과 options.bypassCache(새로고침 ?force=1) 호출은
//   캐시를 읽지도 쓰지도 않는다. bypassCache는 재수집 뒤 태그를 즉시 하드 만료한다.
// - 리드 쓰기(lib/repositories/leads.ts의 invalidateLeadReadCaches)와 소스 링크 확정/해제/
//   생성 라우트(app/api/admin/crm/source-links/*)가 이 태그를 revalidateTag(tag, "max")로
//   건다 — 쓰기 직후 다음 읽기가 SWR로 재계산을 트리거한다.
interface CrmUnifiedSourceSnapshot {
  rows: CrmUnifiedCustomerRow[]
  warnings: string[]
  leadsOk: boolean
  neoAccountsOk: boolean
  portalCustomersOk: boolean
  neoLatestSyncedAt: string | null
  neoPartial: boolean
  /**
   * 마지막 연락 원천 상태. 캐시에 싣는 값이라 JSON 안전 문자열만(unstable_cache 경계). 구 스냅샷에는
   * 없을 수 있어 선택이다 — 읽는 쪽은 없으면 ok 로 본다.
   */
  contactMeta?: CrmUnifiedCustomersMeta
  /** 핵심 소스가 전부 성공해 캐시해도 되는 스냅샷인지(마지막 연락 원천의 끊김은 contactMeta 로만 알린다). */
  complete: boolean
}

// 부분 실패 스냅샷을 감싸 unstable_cache가 캐시하지 않고 던지게 하되, 호출부는 이 값을
// 그대로 반환할 수 있도록 스냅샷 자체를 실어 나른다(에러 텍스트만 던지면 값이 사라진다).
class IncompleteCrmUnifiedSnapshotError extends Error {
  constructor(readonly snapshot: CrmUnifiedSourceSnapshot) {
    super("crm unified customers snapshot incomplete; skip Data Cache write")
  }
}

const getCachedSourceSnapshot = unstable_cache(
  async () => {
    // customers/unified 와 health-distribution 이 같은 콜드 인스턴스에서 동시에 미스하면
    // 스냅샷을 두 번 수집한다 — shareInFlight 로 한 번만(구 in-flight promise 공유의 복원).
    const snapshot = await shareInFlight(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, () =>
      loadSourceSnapshot(new Date())
    )
    if (!snapshot.complete) throw new IncompleteCrmUnifiedSnapshotError(snapshot)
    return snapshot
  },
  [ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG],
  { revalidate: 60, tags: [ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG] }
)

export function invalidateCrmUnifiedSourceSnapshot() {
  revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max")
}

async function getSourceSnapshot(now: Date, bypassCache: boolean): Promise<CrmUnifiedSourceSnapshot> {
  if (bypassCache) return loadSourceSnapshot(now)

  try {
    return await getCachedSourceSnapshot()
  } catch (error) {
    if (error instanceof IncompleteCrmUnifiedSnapshotError) return error.snapshot
    throw error
  }
}

// core(leads·NEO·참여신호·데모)가 shareInFlight 실패 등으로 거부되는 극단적인 경우의
// 안전한 빈 스냅샷 — 이 화면이 500 대신 "전부 실패" 상태로 서게 한다.
const EMPTY_CORE_SNAPSHOT: CrmCoreSourceSnapshot = {
  leads: [],
  leadsOk: false,
  neoRows: [],
  neoAccountsOk: false,
  neoLatestSyncedAt: null,
  neoIsShroffAccountStale: true,
  engagements: null,
  demoSource: { demos: [], phoneKeysByCompassLeadId: [], down: true },
  complete: false,
}

// ── 마지막 연락 원천(CT8) ───────────────────────────────────────────────────
// Home 원천 두 테이블(lead_contact_logs · crm_customer_events 중 접촉 종류)을 세부(원천·채널·작성자)까지
// 읽는다. 시각만 필요한 기존 getCrmCustomerContactMaps(lib/repositories/crm-events.ts)는 최초 응답
// 판정의 정본이라 그대로 두고, 이 조회가 실패하면 그 시각 지도를 "Home 기록" 폴백으로 쓴다.
// 운영 실측(2026-09-24) 두 테이블 모두 수 행 규모라 이중 조회 비용은 작다.
const HOME_CONTACT_SCAN_MAX_ROWS = 20_000

async function loadHomeContactIndex(): Promise<Map<string, LastContactFact>> {
  const sb = createSupabaseAdminClient()
  const [logs, events] = await Promise.all([
    fetchSupabasePages<HomeContactLogRow>({
      maxRows: HOME_CONTACT_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        sb
          .from("lead_contact_logs")
          .select("id, lead_id, type, contacted_at, contacted_by", from === 0 ? { count: "exact" } : undefined)
          .order("contacted_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    }),
    fetchSupabasePages<HomeContactEventRow>({
      maxRows: HOME_CONTACT_SCAN_MAX_ROWS,
      fetchPage: (from, to) =>
        sb
          .from("crm_customer_events")
          .select(
            "id, target_type, target_id, source_type, occurred_at, created_by, owner_name",
            from === 0 ? { count: "exact" } : undefined
          )
          .in("source_type", [...HOME_CONTACT_EVENT_SOURCE_TYPES])
          .order("occurred_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    }),
  ])
  if (logs.error) throw new Error(`리드 연락 로그 조회 실패: ${logs.error.message ?? "unknown"}`)
  if (events.error) throw new Error(`CRM 연락 기록 조회 실패: ${events.error.message ?? "unknown"}`)
  // 상한에서 잘린 반쪽 결과로 "마지막 연락"을 만들지 않는다 — 호출부가 시각 지도 폴백으로 내린다.
  if (logs.truncated || events.truncated) throw new Error("연락 기록 스캔이 상한에 닿았습니다.")
  return buildHomeContactIndex(logs.data, events.data)
}

// 소스 수집 + 행 조립 + 전환 중복 접기까지의 "필터 이전" 단계. 행의 우선순위 점수는
// 이 시점의 now로 계산되어 캐시 TTL 동안(≤60초) 고정된다 — 뷰 매칭·건강도 등
// now 민감 판정은 getCrmUnifiedCustomers가 요청 시각으로 다시 수행한다.
async function loadSourceSnapshot(now: Date): Promise<CrmUnifiedSourceSnapshot> {
  const warnings: string[] = []
  let portalCustomersOk = true
  let rows: CrmUnifiedCustomerRow[] = []

  // leads·NEO 고객·참여 신호·Compass 데모는 우선순위 큐(crm-priority-queue.ts)와 공유하는
  // 원본 스냅샷(getCrmCoreSourceSnapshot)에서 가져온다(2026-09-07 감사 #7) — 이 넷을 독립
  // Promise.allSettled로 모으던 걸 걷어냈다. 이 화면만 필요한 나머지 소스(전환 고객·전환
  // 링크·NEO 등록 링크·컨택 맵·연락 세부)는 그대로 이 자리에서 병렬 수집한다.
  const [coreResult, portalCustomersResult, convertedLinksResult, neoLinksResult, contactMapsResult, homeContactResult] =
    await Promise.allSettled([
      getCrmCoreSourceSnapshot(),
      listAllCustomerListItemsLite(),
      listConfirmedLeadCustomerLinks(),
      listConfirmedLeadNeoLinkLeadIds(),
      getCrmCustomerContactMaps(),
      loadHomeContactIndex(),
    ])

  const core = coreResult.status === "fulfilled" ? coreResult.value : EMPTY_CORE_SNAPSHOT
  const { leadsOk, neoAccountsOk, engagements } = core

  // Compass 실측 데모 — core가 이미 JSON 안전 형태(CompassDemoSourceJson)로 들고 있으니
  // 여기서 hydrate해 이번 now로 데모 인덱스를 만든다(인덱스 자체는 캐시에 다시 넣지 않는다 —
  // 아래에서 만드는 행의 score/bucket에만 반영되고, 그 행이 이 함수의 캐시 대상이다).
  const demoIndex = buildCompassDemoIndex(hydrateCompassDemoSource(core.demoSource), now)

  // 신규 뷰 파생 입력 — 실패해도 목록 자체는 유지(해당 뷰만 부정확)하고 빈 컬렉션 폴백.
  if (neoLinksResult.status === "rejected") {
    warnings.push("NEO 등록 링크를 불러오지 못해 '홈페이지 유입' 뷰가 부정확할 수 있습니다.")
  }
  const neoLinkedLeadIds = neoLinksResult.status === "fulfilled" ? neoLinksResult.value : new Set<string>()
  if (contactMapsResult.status === "rejected") {
    warnings.push("CRM 컨택 기록을 불러오지 못해 '최근 컨택'·'미응답' 뷰가 부정확할 수 있습니다.")
  }
  const firstResponseMap =
    contactMapsResult.status === "fulfilled"
      ? contactMapsResult.value.firstResponseByLead
      : new Map<string, string>()
  const latestContactMap =
    contactMapsResult.status === "fulfilled"
      ? contactMapsResult.value.latestContactByTarget
      : new Map<string, string>()
  // 연락 세부(원천·채널·작성자) — 실패하면 조용히 시각 지도 폴백("Home 기록")만 쓴다. 시각 자체는
  // 같은 원천이라 뷰 판정은 바뀌지 않는다(경고를 늘리지 않는다). 대신 이 스냅샷은 캐시하지 않는다.
  const homeContactIndex = homeContactResult.status === "fulfilled" ? homeContactResult.value : null
  const homeContactFact = (targetType: "lead" | "neo_account" | "customer", id: string): LastContactFact | null => {
    const key = contactTargetKey(targetType, id)
    const fallbackAt = latestContactMap.get(key)
    return pickLatestContact(
      homeContactIndex?.get(key),
      fallbackAt ? { at: fallbackAt, source: "home", channel: null, actor: null } : null
    )
  }
  // 행 키 → Compass 조인 전화 키(9자리 이상 정규화 키만). 행에는 싣지 않는다(연락처는 contact 가 이미 갖는다).
  const phoneKeyByRowKey = new Map<string, string>()
  const rememberPhone = (rowKey: string, phone: string | null | undefined) => {
    const key = contactPhoneKey(phone)
    if (key) phoneKeyByRowKey.set(rowKey, key)
  }

  if (leadsOk) {
    for (const lead of core.leads) {
      const priority = buildLeadPriorityItem(lead, now, {
        engagement: engagements?.[lead.id] ?? null,
        demoIndex,
      })
      const adClickId = hasAdClickId(lead)
      const key = `lead:${lead.id}`
      rememberPhone(key, lead.phone)
      rows.push({
        key,
        tags: [],
        source: "lead",
        sourceLabel: leadSourceLabel(lead),
        name: leadName(lead),
        contact: lead.phone ?? lead.email ?? lead.source,
        regionLabel: deriveLeadRegionLabel(lead),
        ownerName: lead.assigned_to ?? null,
        ownerKeys: uniqueOwnerKeys([lead.assigned_to]),
        lifecycle: leadLifecycle(lead),
        statusLabel: leadStatusLabel(lead),
        nextActionLabel: priority?.actionLabel ?? defaultLeadAction(lead),
        priorityReason: priority?.reason ?? "리드 상태 확인",
        score: priority?.score ?? (lead.status === "new" ? 40 : 20),
        // 엔진 버킷 그대로 — 게이트 탈락(전환·종료·테스트·미확인 저의도) 리드는 null.
        bucket: priority?.bucket ?? null,
        moneyLabel: null,
        moneyState: "none",
        href: `/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`,
        updatedAt: lead.follow_up_at ?? lead.timestamp,
        expireAt: null,
        balance: null,
        origin: classifyLeadOrigin(lead.source, adClickId),
        crmRegistered: neoLinkedLeadIds.has(lead.id),
        // 미확인 신규 리드도 행은 만들되 처리 큐 뷰(site_leads/unanswered)에서만 노출된다.
        provisional: !shouldIncludeLeadInUnifiedCustomers(lead),
        slaTarget:
          lead.status === "new" &&
          SLA_TARGET_LEAD_SOURCES.has(lead.source) &&
          !isTestLead(lead),
        firstResponseAt: firstResponseMap.get(lead.id) ?? null,
        createdAt: lead.timestamp, // timestamp는 leads.created_at 매핑 (lib/repositories/leads.ts 참고)
        ...contactFields(homeContactFact("lead", lead.id)),
        activeDealCount: 0,
      })
    }
  } else {
    warnings.push("리드 목록을 불러오지 못했습니다.")
  }

  if (neoAccountsOk) {
    for (const account of core.neoRows) {
      const priority = buildNeoAccountPriorityItem(account, now, { demoIndex })
      const balanceLabel = formatCNY(account.balance)
      const orderLabel = formatUSD(account.orderAmount)
      const key = `neo:${account.accountId}`
      const lifecycle = accountLifecycle(priority)
      rememberPhone(key, account.phone)
      rows.push({
        key,
        tags: [],
        source: "neo_account",
        sourceLabel: "고객",
        name: account.name,
        contact: account.phone ?? account.uid ?? account.accountId,
        regionLabel: account.regionLabel ?? null,
        ownerName: account.ownerName,
        ownerKeys: uniqueOwnerKeys([account.ownerName, account.ownerId]),
        lifecycle,
        statusLabel: accountStatusLabel(priority, lifecycle),
        nextActionLabel: priority?.actionLabel ?? "관계 유지",
        priorityReason: priority?.reason ?? "최근 고객 상태 정상",
        score: priority?.score ?? 10,
        // 엔진 버킷 그대로 — 엔진이 액션 없음(null)으로 판단한 정상 계정은 null.
        bucket: priority?.bucket ?? null,
        moneyLabel:
          balanceLabel && orderLabel
            ? `잔액 ${balanceLabel} · 오더 ${orderLabel}`
            : balanceLabel
              ? `잔액 ${balanceLabel}`
              : orderLabel
                ? `오더 ${orderLabel}`
                : null,
        moneyState: accountMoneyState(account.balance, account.orderAmount),
        href: `/admin/crm/customers/accounts?account=${encodeURIComponent(account.accountId)}`,
        updatedAt: account.updatedAt ?? account.lastClassAt ?? account.expireAt,
        expireAt: account.expireAt ?? null,
        balance: account.balance ?? null,
        ...contactFields(homeContactFact("neo_account", account.accountId)),
        activeDealCount: 0,
        // NEO 스냅샷 신호(SG2) — 조립에서 버리던 필드를 행에 싣는다(세그먼트 조건·표시).
        depletionInDays: account.depletionInDays ?? null,
        billingMode: account.billingMode ?? null,
        riskLevel: account.riskLevel ?? null,
        riskReasonLabels: (account.riskReasons ?? [])
          .map((reason) => reason?.label?.trim())
          .filter((label): label is string => Boolean(label)),
        lastClassAt: account.lastClassAt ?? null,
        orderAmountUsd: account.orderAmount == null ? null : Number(account.orderAmount),
        ...NON_LEAD_ROW_DEFAULTS,
      })
    }

    if (core.neoIsShroffAccountStale) {
      warnings.push("외부 CRM 고객 동기화가 최신 상태가 아니어서 잔액·만료일·최근 수업 정보가 일부 누락될 수 있습니다.")
    }
  } else {
    warnings.push("외부 CRM 고객 동기화 목록을 불러오지 못했습니다.")
  }

  if (portalCustomersResult.status === "fulfilled") {
    for (const item of portalCustomersResult.value) {
      const row = buildPortalCustomerRow(item, null)
      applyContactFact(row, homeContactFact("customer", item.customer.id))
      rememberPhone(row.key, item.customer.phone)
      rows.push(row)
    }
  } else {
    portalCustomersOk = false
    warnings.push("리드 전환 고객(앱 고객 DB) 목록을 불러오지 못했습니다.")
  }

  // Compass 사람 활동 — 전화 키 하나로만 붙인다(이름 추측 없음). 끊기면 Home 원천만으로 계산하고
  // contactMeta.compass 로 알린다(화면: "Compass 연결 끊김 — Home 기록만"). 경고 배너는 늘리지 않는다.
  let compassStatus: CrmUnifiedCompassContactStatus = "skipped"
  const phoneKeys = [...new Set(phoneKeyByRowKey.values())]
  if (phoneKeys.length > 0) {
    const compass = await getCompassLatestActivityByPhoneKeys(phoneKeys, {
      kinds: COMPASS_CONTACT_KINDS,
      excludeActors: COMPASS_CONTACT_EXCLUDED_ACTORS,
    })
    if (compass.down) {
      compassStatus = "down"
    } else {
      compassStatus = compass.truncated ? "partial" : "ok"
      const compassIndex = buildCompassContactIndex(compass.rows)
      for (const row of rows) {
        const phoneKey = phoneKeyByRowKey.get(row.key)
        const compassFact = phoneKey ? compassIndex.get(phoneKey) : undefined
        if (compassFact) applyContactFact(row, pickLatestContact(rowContactFact(row), compassFact))
      }
    }
  }

  // 전환 중복 제거 — confirmed lead→customer 링크가 있고 해당 customer 행이 있으면
  // lead 행을 접고 customer 행(전환 산출물)만 남긴다. 리드의 담당·연락처는 승계.
  // 링크 조회 실패 시 접기를 건너뛴다(중복 표시가 행 소실보다 안전).
  if (convertedLinksResult.status === "rejected") {
    warnings.push("리드-고객 전환 링크를 불러오지 못해 전환 고객이 리드와 중복 표시될 수 있습니다.")
  }
  const convertedCustomerIdByLeadId =
    convertedLinksResult.status === "fulfilled" ? convertedLinksResult.value : new Map<string, string>()
  if (convertedCustomerIdByLeadId.size > 0) {
    const customerRowById = new Map(
      rows
        .filter((row) => row.source === "customer")
        .map((row) => [row.key.slice("customer:".length), row])
    )
    rows = rows.filter((row) => {
      if (row.source !== "lead") return true
      const customerId = convertedCustomerIdByLeadId.get(row.key.slice("lead:".length))
      const customerRow = customerId ? customerRowById.get(customerId) : undefined
      if (!customerRow) return true
      if (!customerRow.ownerName && row.ownerName) customerRow.ownerName = row.ownerName
      customerRow.ownerKeys = [...new Set([...customerRow.ownerKeys, ...row.ownerKeys])]
      if (!customerRow.contact && row.contact) customerRow.contact = row.contact
      applyContactFact(customerRow, pickLatestContact(rowContactFact(customerRow), rowContactFact(row)))
      if (customerRow.statusLabel === "전환 고객") customerRow.statusLabel = "리드 전환 완료"
      return false
    })
  }

  // 리드→NEO 계정 확정 링크 접기(2026-09-07 감사 #2 P1) — 리드가 360 드로어에서 NEO CRM
  // 계정으로 수동 등록 확정되면 같은 사람이 리드 행과 neo_account 행 두 번으로 보였다.
  // neoLinkedLeadIds(위, 배지용 Set)는 target_type을 external_account+external_lead로
  // 합쳐서 세므로(lib/repositories/crm-source-links.ts:1929-1963의 주석 참고) 그대로 폴드
  // 키로 쓰면 안 된다 — external_lead의 target_id는 계정이 아니라 CRM 리드 레코드 id라
  // neo_account 행의 accountId 네임스페이스와 다르다. 폴드는 external_account 링크만으로
  // 해야 하며, 그 지도를 listConfirmedLeadNeoAccountLinks가 한 번의 페이지네이션 스캔으로
  // 돌려준다 — 실패하면 이번 스냅샷은 폴드를 건너뛴다(customer 폴드와 같은 원칙:
  // 중복 표시가 행 소실보다 안전).
  let neoAccountIdByLeadId = new Map<string, string>()
  if (neoLinkedLeadIds.size > 0) {
    try {
      // 배지 붙은 리드마다 단건 조회를 Promise.all 로 돌리면 수백 개의 동시 쿼리가 된다 —
      // 2026-09-04 프로덕션 REST 504 폭주(113건)의 조건이 바로 그것이었다. 한 번의
      // 페이지네이션 스캔으로 leadId→accountId 지도를 통째로 받아 그 안에서 좁힌다.
      const allLinks = await listConfirmedLeadNeoAccountLinks()
      for (const leadId of neoLinkedLeadIds) {
        const targetId = allLinks.get(leadId)
        if (targetId) neoAccountIdByLeadId.set(leadId, targetId)
      }
    } catch {
      warnings.push("리드-계정 등록 링크를 불러오지 못해 등록 고객이 리드와 중복 표시될 수 있습니다.")
      neoAccountIdByLeadId = new Map()
    }
  }
  if (neoAccountIdByLeadId.size > 0) {
    const neoRowByAccountId = new Map(
      rows
        .filter((row) => row.source === "neo_account")
        .map((row) => [row.key.slice("neo:".length), row])
    )
    rows = rows.filter((row) => {
      if (row.source !== "lead") return true
      const accountId = neoAccountIdByLeadId.get(row.key.slice("lead:".length))
      const neoRow = accountId ? neoRowByAccountId.get(accountId) : undefined
      if (!neoRow) return true
      if ((!neoRow.ownerName || isUnassignedOwnerKey(neoRow.ownerName)) && row.ownerName) neoRow.ownerName = row.ownerName
      neoRow.ownerKeys = [...new Set([...neoRow.ownerKeys, ...row.ownerKeys])]
      if (!neoRow.contact && row.contact) neoRow.contact = row.contact
      applyContactFact(neoRow, pickLatestContact(rowContactFact(neoRow), rowContactFact(row)))
      return false
    })
  }

  const homeContactDetailOk = homeContactResult.status === "fulfilled"
  return {
    rows,
    warnings,
    leadsOk,
    neoAccountsOk,
    portalCustomersOk,
    neoLatestSyncedAt: core.neoLatestSyncedAt,
    neoPartial: neoAccountsOk ? core.neoIsShroffAccountStale : true,
    contactMeta: { compass: compassStatus, homeContactDetail: homeContactDetailOk ? "ok" : "down" },
    complete:
      leadsOk &&
      neoAccountsOk &&
      portalCustomersResult.status === "fulfilled" &&
      convertedLinksResult.status === "fulfilled" &&
      neoLinksResult.status === "fulfilled" &&
      // 마지막 연락 원천(Compass·Home 연락 세부)의 실패는 완성 판정에 넣지 않는다 — contactMeta 로
      // 표시되는 "라벨 붙은 강등"(화면: "Compass 연결 끊김 — Home 기록만")이라 60초 캐시에 실어도 정상인 척
      // 하지 않는다. 완성 판정에 넣으면 unstable_cache 가 만료된 옛 완성 스냅샷을 계속 돌려주고(백그라운드
      // 재계산 오류는 삼킨다) 리드 쓰기 뒤의 무효화도 먹히지 않아, Compass 장애 동안 새 리드가 목록에서
      // 사라진다(2026-09-25 적대 리뷰).
      contactMapsResult.status === "fulfilled",
  }
}

// ── 목록 계산(필터 → 조건 → 뷰 → 정렬) ──────────────────────────────────────
// getCrmUnifiedCustomers(페이지)와 getCrmUnifiedCustomersForExport(CSV 전체)가 같은 계산을 공유한다 —
// 화면에 보이는 조건과 내보내는 조건이 어긋나지 않게 한 함수로 둔다.

/** facets 에 싣는 선택지 상한 — 담당·지역·라벨이 수백 개여도 응답이 부풀지 않게. */
export const SEGMENT_FACET_LIMIT = 40

// 선택지 묶음 키 — 조건 파싱(customer-segment-spec normalizeFreeText·normalizeTag)과 같게 공백을 접고 대소문자를 무시한다.
function facetGroupKey(value: string) {
  return value === SEGMENT_NONE_TOKEN ? value : value.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * 선택지 건수 — 건수 내림차순 상위 SEGMENT_FACET_LIMIT 개 + (순위 밖이어도) 지금 켜진 값 + "없음"(미배정·지역
 * 미지정, 항상 맨 뒤). 싣지 않은 선택지 수는 hidden 으로 돌려준다 — 조용히 자르지 않는다(플레이북 "잘린 항목은
 * 남은 건수 표시"). 켜진 값을 빼면 딥링크로 고른 값이 목록 밖으로 밀려 화면에 0건으로 보였다(2026-09-25 리뷰).
 */
function facetCounts(
  rows: readonly CrmUnifiedCustomerRow[],
  valuesOf: (row: CrmUnifiedCustomerRow) => Array<{ value: string; label: string }>,
  selected: readonly string[] = []
): { facets: CrmUnifiedSegmentFacet[]; hidden: number } {
  const counts = new Map<string, CrmUnifiedSegmentFacet>()
  for (const row of rows) {
    const seen = new Set<string>()
    for (const { value, label } of valuesOf(row)) {
      const groupKey = facetGroupKey(value)
      if (!groupKey || seen.has(groupKey)) continue
      seen.add(groupKey)
      const bucket = counts.get(groupKey)
      if (bucket) bucket.count += 1
      else counts.set(groupKey, { value, label, count: 1 })
    }
  }
  const none = counts.get(SEGMENT_NONE_TOKEN)
  const ranked = [...counts.values()]
    .filter((facet) => facet.value !== SEGMENT_NONE_TOKEN)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"))
  const selectedKeys = new Set(selected.map(facetGroupKey).filter(Boolean))
  const shown = ranked.slice(0, SEGMENT_FACET_LIMIT)
  for (const facet of ranked.slice(SEGMENT_FACET_LIMIT)) {
    if (selectedKeys.has(facetGroupKey(facet.value))) shown.push(facet)
  }
  // "없음"은 건수와 무관하게 맨 뒤 — 상한과 무관하게 항상 싣는다(값이 많아도 미배정을 고를 수 있게).
  if (none) shown.push(none)
  return { facets: shown, hidden: ranked.length + (none ? 1 : 0) - shown.length }
}

/**
 * 세그먼트 요약 — "현재 베이스"(검색·원천·상태·담당·라벨·저장 뷰까지, 조건 적용 전) 기준 단독 건수.
 * 조건 칩에 붙는 숫자는 "지금 이 칩 하나만 켜면 몇 명"이다(다른 조건과의 교집합이 아니다).
 */
function buildSegmentSummary(
  viewBaseRows: readonly CrmUnifiedCustomerRow[],
  spec: CustomerSegmentSpec,
  total: number,
  nowMs: number
): CrmUnifiedSegmentSummary {
  const conditionCounts: Partial<Record<SegmentConditionKey, number>> = {}
  let noContactNoRecordCount = 0
  for (const key of activeSegmentConditionKeys(spec)) {
    const matcher = segmentConditionMatcher(key, spec, nowMs)
    if (!matcher) continue
    let count = 0
    for (const row of viewBaseRows) {
      if (!matcher.test(row)) continue
      count += 1
      if (key === "noContactDays" && !row.lastContactAt) noContactNoRecordCount += 1
    }
    conditionCounts[key] = count
  }

  const optionCounts: Record<string, number> = {}
  for (const option of segmentChipOptions(spec)) {
    const [matcher] = buildSegmentMatchers(singleOptionSpec(option.key, option.value), nowMs)
    if (!matcher) continue
    optionCounts[segmentOptionKey(option.key, option.value)] = viewBaseRows.filter((row) => matcher.test(row)).length
  }

  // 담당 "없음"은 owners 매처와 같은 규칙(segmentOwnerFacetValues — 자리표시 "담당 미지정"도 미배정)으로 센다.
  const owners = facetCounts(viewBaseRows, segmentOwnerFacetValues, spec.owners)
  const regions = facetCounts(
    viewBaseRows,
    (row) =>
      row.regionLabel?.trim()
        ? [{ value: row.regionLabel.trim(), label: row.regionLabel.trim() }]
        : [{ value: SEGMENT_NONE_TOKEN, label: REGION_UNSPECIFIED }],
    spec.regions
  )
  const tags = facetCounts(
    viewBaseRows,
    (row) => row.tags.map((tag) => ({ value: tag, label: tag })),
    [...(spec.tagsAll ?? []), ...(spec.tagsAny ?? [])]
  )

  return {
    spec,
    active: activeSegmentConditionKeys(spec).length > 0,
    labels: describeSegmentSpec(spec),
    baseTotal: viewBaseRows.length,
    total,
    conditionCounts,
    optionCounts,
    noContactNoRecordCount,
    facets: { owners: owners.facets, regions: regions.facets, tags: tags.facets },
    facetHiddenCounts: { owners: owners.hidden, regions: regions.hidden, tags: tags.hidden },
  }
}

interface UnifiedListComputation {
  now: Date
  snapshot: CrmUnifiedSourceSnapshot
  /** 태그를 붙인 전체 행(필터 전) */
  rows: CrmUnifiedCustomerRow[]
  /** 검색·원천·상태·담당·라벨·조건·저장 뷰·선택 키까지 적용하고 정렬한 결과 */
  sorted: CrmUnifiedCustomerRow[]
  availableTags: string[]
  viewCounts: Record<string, number>
  hiddenUnconfirmedCount: number
  segment: CrmUnifiedSegmentSummary
  sort: UnifiedSortState | null
  meta: CrmUnifiedCustomersMeta
}

async function computeUnifiedList(options: CrmUnifiedCustomersOptions): Promise<UnifiedListComputation> {
  const now = options.now ?? new Date()
  const bypassCache = options.bypassCache === true
  const snapshot = await getSourceSnapshot(now, options.now != null || bypassCache)
  if (bypassCache) {
    // 새로고침 직후 다음 일반 읽기(다른 인스턴스 포함)가 낡은 스냅샷을 돌려주지 않게 태그를
    // 즉시 하드 만료한다({ expire: 0 } = 즉시 만료, "max" = SWR) — 우선순위 큐 force 계약과 동일.
    // 실패한 재수집 결과가 캐시에 쓰이는 일은 없다(force 경로는 unstable_cache를 거치지 않는다).
    revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, { expire: 0 })
  }

  // 수기 라벨 — 소규모 태그 테이블을 요청마다 읽어 부착(자체 30초 캐시 + 쓰기 즉시
  // 무효화라 태그 변경이 스냅샷 TTL을 기다리지 않는다; 실패 시 graceful 빈 맵).
  // 공유 스냅샷 행을 요청 간 오염시키지 않도록 얕은 복사본에 붙인다 — 이후 단계는
  // 행을 변형하지 않고 읽기만 한다.
  const tagsMap = await getAllCustomerTagsMap().catch(() => ({}) as Record<string, string[]>)
  const rows = snapshot.rows.map((row) => ({
    ...row,
    tags: tagsMap[`${row.source}:${row.key.slice(row.key.indexOf(":") + 1)}`] ?? [],
  }))
  const availableTags = Array.from(new Set(Object.values(tagsMap).flat())).sort((a, b) => a.localeCompare(b, "ko"))
  const tagFilter = (options.tag ?? "").trim()

  const query = normalize(options.q)
  const ownerKeys = new Set(uniqueOwnerKeys([options.owner, ...(options.ownerKeys ?? [])]))
  const source = options.source ?? "all"
  const lifecycle = options.lifecycle ?? "all"
  const view = options.view ?? "all"
  const includeUnconfirmed = options.includeUnconfirmed === true
  const spec = normalizeSegmentSpec(options.segment)
  const keyFilter = options.keys?.length ? new Set(options.keys) : null

  const nowMs = now.getTime()
  const baseRows = rows.filter((row) => {
    if (source !== "all" && row.source !== source) return false
    if (lifecycle !== "all" && row.lifecycle !== lifecycle) return false
    // 라벨은 대소문자·공백 차이를 무시하고 맞춘다 — 태그 관리 화면이 "VIP"/"vip"를 한 묶음으로 세므로
    // 그 화면의 ?tag= 딥링크 목록이 묶음 건수보다 적게 뜨지 않게(tagGroupKey 와 같은 규칙).
    if (tagFilter && !isDuplicateTag(row.tags, tagFilter)) return false
    if (!rowMatchesOwner(row, ownerKeys)) return false
    if (!includesQuery(row, query)) return false
    return true
  })
  // 세그먼트 조건(SG4) — 저장 뷰·라벨·검색·담당과 AND.
  const matchers = buildSegmentMatchers(spec, nowMs)
  const specRows = matchers.length ? baseRows.filter((row) => matchers.every((matcher) => matcher.test(row))) : baseRows
  // provisional 게이트 포함 가시성 규칙 — 일반 뷰에서는 미확인 리드가 자동 제외된다.
  // 단 숨긴 건수는 항상 내려주고, includeUnconfirmed 토글이 켜지면 게이트를 우회한다.
  const filtered = specRows.filter(
    (row) =>
      rowVisibleInView(row, view, ownerKeys, nowMs, includeUnconfirmed) && (!keyFilter || keyFilter.has(row.key))
  )
  const hiddenUnconfirmedCount = includeUnconfirmed
    ? 0
    : specRows.filter((row) => rowHiddenByUnconfirmedGate(row, view, ownerKeys, nowMs)).length
  // 세그먼트 칩 카운트 — 현재 검색/담당·조건 범위 안에서 각 저장 뷰에 몇 건이 들어오는지.
  // 토글이 켜지면 칩 숫자도 목록과 같은 기준(게이트 우회)으로 센다.
  const viewCounts = Object.fromEntries(
    CRM_SEGMENT_VIEWS.map((segment) => [
      segment,
      specRows.filter((row) => rowVisibleInView(row, segment, ownerKeys, nowMs, includeUnconfirmed)).length,
    ])
  )
  // 조건 칩의 단독 건수 베이스 — 저장 뷰까지 적용, 조건 적용 전.
  const viewBaseRows =
    matchers.length || keyFilter
      ? baseRows.filter((row) => rowVisibleInView(row, view, ownerKeys, nowMs, includeUnconfirmed))
      : filtered
  const segment = buildSegmentSummary(viewBaseRows, spec, filtered.length, nowMs)

  const sortedKeys = new Map(sortPriorityItems(filtered.map((row) => {
    // 행 생성 시 저장한 엔진 버킷을 그대로 쓴다. 버킷 없는 행(전환 고객·정상 계정·게이트
    // 탈락 리드)은 관찰(watch)로 정렬 — 엔진이 오늘 처리로 지정한 것만 위로 올라온다.
    const bucket = row.bucket ?? "watch"
    return {
      id: row.key,
      // 전환 고객은 우선순위 엔진 소스 타입 밖 — 정렬 목적으로 계정 계열로 취급.
      source: row.source === "customer" ? "neo_account" : row.source,
      title: row.name,
      subtitle: row.contact,
      ownerName: row.ownerName,
      ownerKeys: row.ownerKeys,
      statusLabel: row.statusLabel,
      score: row.score,
      severity: row.score >= 85 ? "critical" : row.score >= 68 ? "high" : row.score >= 42 ? "medium" : "low",
      lane: row.source === "lead" ? "sales" : "customer_care",
      laneLabel: row.source === "lead" ? "신규·추가 매출" : "고객관리",
      bucket,
      bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
      action: row.source === "lead" ? "follow_up_lead" : "watch_account",
      actionLabel: row.nextActionLabel,
      reason: row.priorityReason,
      href: row.href,
      dueAt: row.updatedAt,
      updatedAt: row.updatedAt,
      sourceKey: null,
    }
  })).map((item, index) => [item.id, index]))

  const recommended = [...filtered].sort((a, b) => {
    const aIndex = sortedKeys.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bIndex = sortedKeys.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })
  // 서버 정렬(C1) — 조건 전체를 정렬한 뒤 호출부가 페이지를 자른다. 동률은 추천순 유지(안정 정렬).
  const sort = options.sort ?? null
  const sorted = sortUnifiedRows(recommended, sort)

  return {
    now,
    snapshot,
    rows,
    sorted,
    availableTags,
    viewCounts,
    hiddenUnconfirmedCount,
    segment,
    sort,
    meta: snapshot.contactMeta ?? { compass: "ok", homeContactDetail: "ok" },
  }
}

export async function getCrmUnifiedCustomers(
  options: CrmUnifiedCustomersOptions = {}
): Promise<CrmUnifiedCustomers> {
  const computed = await computeUnifiedList(options)
  const { snapshot, rows, sorted, now } = computed
  const { leadsOk, neoAccountsOk, portalCustomersOk } = snapshot
  const warnings = [...snapshot.warnings]
  const nowMs = now.getTime()
  const includeUnconfirmed = options.includeUnconfirmed === true

  // 활성 고객 건강도 분포 — 전역(필터 무관). 코크핏 도넛이 읽는 단일 진실원.
  const healthDistribution = computeHealthDistribution(rows, nowMs)

  // 내부 일괄 매칭은 전체 고객 집합을 읽어야 한다. 외부 API 상한(200)은 라우트에서 별도로 유지한다.
  const limit = clampInteger(options.limit, 100, 1, 2_000)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  // provisional 리드는 기본 뷰에 안 보이므로 담당자 카운트에서도 제외 — 배지·목록 정합.
  // 토글로 포함하면 담당자 카운트에도 같이 들어온다.
  const owners = buildOwnerOptions(rows.filter((row) => includeUnconfirmed || !row.provisional))
  const pageRows = sorted.slice(offset, offset + limit)
  const nextOffset = offset + pageRows.length
  const { neoLatestSyncedAt, neoPartial } = snapshot
  const sourceStatuses: CrmUnifiedCustomers["sources"]["statuses"] = [
    {
      key: "classin_leads",
      label: "ClassIn 리드 DB",
      role: "primary",
      ok: leadsOk,
      partial: !leadsOk,
      latestSyncedAt: null,
      message: leadsOk
        ? "ClassIn 어드민의 리드 저장소를 운영 기준으로 사용 중입니다."
        : "ClassIn 리드 저장소를 불러오지 못해 리드 행이 제외되었습니다.",
    },
    {
      key: "app_customers",
      label: "리드 전환 고객",
      role: "primary",
      ok: portalCustomersOk,
      partial: !portalCustomersOk,
      latestSyncedAt: null,
      message: portalCustomersOk
        ? "리드 전환으로 생성된 앱 고객 DB를 통합 목록에 함께 표시합니다."
        : "앱 고객 DB를 불러오지 못해 전환 고객 행이 제외되었습니다.",
    },
    {
      key: "external_crm",
      label: "외부 CRM 동기화",
      role: "reference",
      ok: neoAccountsOk,
      partial: neoPartial,
      latestSyncedAt: neoLatestSyncedAt,
      message: neoAccountsOk
        ? neoPartial
          ? "외부 CRM은 참고용 동기화 원천이며 일부 금액·수업 정보가 오래되었을 수 있습니다."
          : "외부 CRM은 ClassIn 고객 DB를 보강하는 참고용 동기화 원천입니다."
        : "외부 CRM 참고 원천을 불러오지 못해 고객 동기화 행이 제외되었습니다.",
    },
    {
      key: "sheets",
      label: "시트/HQ CRM",
      role: "reference",
      ok: true,
      partial: true,
      latestSyncedAt: null,
      message: "시트와 HQ CRM은 운영 기준 DB가 아니라 확인·동기화 참고자료로만 사용합니다.",
    },
  ]

  return {
    generatedAt: now.toISOString(),
    sources: { leadsOk, neoAccountsOk, portalCustomersOk, warnings, statuses: sourceStatuses },
    summary: {
      total: sorted.length,
      leadCount: sorted.filter((row) => row.source === "lead").length,
      accountCount: sorted.filter((row) => row.source === "neo_account").length,
      customerCount: sorted.filter((row) => row.source === "customer").length,
      highPriorityCount: sorted.filter((row) => row.score >= 68).length,
      ownerCount: owners.length,
      viewCounts: computed.viewCounts,
      availableTags: computed.availableTags,
      hiddenUnconfirmedCount: computed.hiddenUnconfirmedCount,
      noContactRecordCount: sorted.filter((row) => !row.lastContactAt).length,
    },
    healthDistribution,
    pagination: {
      limit,
      offset,
      returned: pageRows.length,
      total: sorted.length,
      hasMore: nextOffset < sorted.length,
      nextOffset: nextOffset < sorted.length ? nextOffset : null,
    },
    owners,
    rows: pageRows,
    meta: computed.meta,
    segment: computed.segment,
    sort: computed.sort,
  }
}

export interface CrmUnifiedCustomersExport {
  generatedAt: string
  /** 현재 조건의 전체 건수 */
  total: number
  /** 내보낸 행(상한까지, 목록과 같은 정렬) */
  rows: CrmUnifiedCustomerRow[]
  /** total > 상한 — 뒤쪽 행이 잘렸다 */
  truncated: boolean
  limit: number
  meta: CrmUnifiedCustomersMeta
  /** 켜진 조건 문구(파일 안내용) */
  segmentLabels: string[]
}

/** CSV 내보내기 상한 — 한 번에 내려보내는 최대 행 수. 넘으면 truncated 로 알린다. */
export const CRM_UNIFIED_EXPORT_MAX_ROWS = 5_000

/**
 * CSV 내보내기용 — 페이지가 아니라 현재 조건 전체를(상한까지) 목록과 같은 계산·정렬로 돌려준다.
 * 계산은 스냅샷(60초 Data Cache) 위의 메모리 필터라 추가 원격 조회가 없다.
 */
export async function getCrmUnifiedCustomersForExport(
  options: Omit<CrmUnifiedCustomersOptions, "limit" | "offset"> = {},
  maxRows = CRM_UNIFIED_EXPORT_MAX_ROWS
): Promise<CrmUnifiedCustomersExport> {
  const limit = clampInteger(maxRows, CRM_UNIFIED_EXPORT_MAX_ROWS, 1, CRM_UNIFIED_EXPORT_MAX_ROWS)
  const computed = await computeUnifiedList(options)
  return {
    generatedAt: computed.now.toISOString(),
    total: computed.sorted.length,
    rows: computed.sorted.slice(0, limit),
    truncated: computed.sorted.length > limit,
    limit,
    meta: computed.meta,
    segmentLabels: computed.segment.labels,
  }
}

// health-distribution 라우트 전용 최소 경로 — 소스 스냅샷(unstable_cache 60초, Data Cache)만
// 태우고, 도넛 숫자와 무관한 후처리(태그 부착·필터·세그먼트별 viewCounts 8회 재순회·
// sortPriorityItems 전량 정렬·오너 집계)는 전부 건너뛴다. 카운트 산식은
// collectHealthDistribution을 그대로 재사용해 상위 4개 키가 getCrmUnifiedCustomers().healthDistribution과
// 동일한 값을 내고, 같은 순회에서 모은 담당별 분포(byOwner)를 덧붙인다(T2).
export async function getCrmUnifiedHealthDistribution(
  options: { now?: Date; bypassCache?: boolean } = {}
): Promise<CrmHealthDistributionWithOwners> {
  const now = options.now ?? new Date()
  const bypassCache = options.bypassCache === true
  const snapshot = await getSourceSnapshot(now, options.now != null || bypassCache)
  if (bypassCache) revalidateTag(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, { expire: 0 })
  return collectHealthDistribution(snapshot.rows, now.getTime())
}
