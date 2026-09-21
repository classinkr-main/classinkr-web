// 통합 고객(ClassIn 고객 DB) 화면 공유 타입·상수·순수 헬퍼.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import type {
  CrmUnifiedCustomerRow,
  CrmUnifiedCustomerSource,
  CrmUnifiedLifecycle,
  CrmUnifiedSavedView,
} from "@/lib/repositories/crm-unified-customers"
import { deriveCustomerFlags, type CustomerFlag } from "@/lib/crm/customer-flags"
import {
  STATUS_TONE_BG_CLASS,
  STATUS_TONE_BORDER_CLASS,
  STATUS_TONE_TEXT_STRONG_CLASS,
  type StatusTone,
} from "@/lib/crm/status-tone"
import { normalizeTag } from "@/lib/crm/tag-suggestions"

export type SourceFilter = "all" | CrmUnifiedCustomerSource
export type LifecycleFilter = "all" | CrmUnifiedLifecycle
export type SavedViewFilter = CrmUnifiedSavedView

export interface CrmUnifiedCustomers {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    portalCustomersOk?: boolean
    warnings: string[]
    statuses: Array<{
      key: "classin_leads" | "app_customers" | "external_crm" | "sheets"
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
    customerCount?: number
    highPriorityCount: number
    ownerCount: number
    viewCounts?: Record<string, number>
    availableTags?: string[]
    /** 확인 게이트로 숨긴 미확인 리드 수(서버 산출, 토글 on이면 0). 구 응답 호환으로 선택. */
    hiddenUnconfirmedCount?: number
  }
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
}

export type CustomerSourceStatus = CrmUnifiedCustomers["sources"]["statuses"][number]

export function summarizeCustomerSources(statuses: CustomerSourceStatus[]) {
  const primary = statuses.filter((status) => status.role === "primary")
  const reference = statuses.filter((status) => status.role === "reference")
  return {
    primaryReady: primary.filter((status) => status.ok && !status.partial).length,
    primaryTotal: primary.length,
    referenceTotal: reference.length,
  }
}

/**
 * 원천 상태 → DESIGN.md 운영 상태 스케일 톤. 실패(ok=false)가 부분 동기화(partial)보다 우선한다 —
 * 실패한 원천을 주의색으로 낮춰 그리지 않는다.
 */
export function customerSourceStatusTone(status: Pick<CustomerSourceStatus, "ok" | "partial">): StatusTone {
  if (!status.ok) return "danger"
  if (status.partial) return "warning"
  return "ok"
}

/**
 * 원천 상태 타일 색 — lib/crm/status-tone.ts 토큰만 조합한다(2026-09-21). 예전엔 실패 톤이 팔레트
 * 밖 주황 계열 리터럴, 정상 보더가 토큰과 다른 녹색이었다(은퇴 값 목록은
 * tests/crm/unified-customer-source-tone.test.ts). 타일 제목은 12px 굵은 글자라 강조 텍스트색
 * (textStrong)을 써서 틴트 배경 위 대비를 AA(4.5:1) 이상으로 둔다.
 */
export function customerSourceTone(status: Pick<CustomerSourceStatus, "ok" | "partial">) {
  const tone = customerSourceStatusTone(status)
  return {
    surface: `${STATUS_TONE_BORDER_CLASS[tone]} ${STATUS_TONE_BG_CLASS[tone]}`,
    text: STATUS_TONE_TEXT_STRONG_CLASS[tone],
  }
}

export const SOURCE_FILTERS: Array<{ key: SourceFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "lead", label: "리드" },
  { key: "neo_account", label: "고객" },
  { key: "customer", label: "전환 고객" },
]

export const LIFECYCLE_FILTERS: Array<{ key: LifecycleFilter; label: string }> = [
  { key: "all", label: "상태 전체" },
  { key: "new_lead", label: "신규 리드" },
  { key: "active_lead", label: "접촉 중" },
  { key: "account_risk", label: "관리 필요" },
  { key: "active_account", label: "활성 고객" },
  { key: "closed", label: "종료" },
]

export const SAVED_VIEW_FILTERS: Array<{
  key: SavedViewFilter
  label: string
  description: string
}> = [
  { key: "my_owner", label: "내 리드·고객", description: "내 계정에 배정된 리드와 고객" },
  { key: "priority", label: "우선 처리", description: "점수 68점 이상" },
  { key: "new_leads", label: "신규 리드", description: "첫 응답 대상" },
  { key: "needs_care", label: "관리 필요 고객", description: "만료·휴면 위험" },
  { key: "recent_contact", label: "최근 컨택", description: "최근 30일 내 사람이 남긴 CRM 기록" },
  { key: "active_deal", label: "진행 중인 딜", description: "Portal V2 진행 딜 1건 이상" },
  { key: "hot_lead", label: "고전환 리드", description: "점수 상위 리드" },
  { key: "upsell", label: "업셀 후보", description: "활성 고객 · 잔액 보유" },
  { key: "site_leads", label: "홈페이지 유입", description: "홈페이지로 들어와 NEO 미등록" },
  { key: "unanswered", label: "미응답", description: "첫 응답 전 리드 (24h 초과 위험)" },
  { key: "dormant", label: "30일+ 미접촉", description: "마지막 활동 30일 초과" },
  { key: "expiring", label: "만료 임박", description: "만료 14일 이내(지난 것 포함)" },
  // 2026-09-20 Compass 정리 라운드 S4 — 세그먼트 딥링크(커맨드 팔레트·홈 타일)가 착지하는 저장 뷰.
  { key: "meta_leads", label: "메타 광고 리드", description: "광고 클릭·Meta 리드 광고 유입" },
  { key: "registered_leads", label: "NEO 등록 리드", description: "NEO CRM 에 등록 확정된 리드" },
]

const PRIMARY_SAVED_VIEW_KEYS = new Set<SavedViewFilter>([
  "my_owner",
  "priority",
  "new_leads",
  "unanswered",
  "hot_lead",
  "upsell",
  "needs_care",
])
export const PRIMARY_SAVED_VIEW_FILTERS = SAVED_VIEW_FILTERS.filter((filter) => PRIMARY_SAVED_VIEW_KEYS.has(filter.key))
export const SECONDARY_SAVED_VIEW_FILTERS = SAVED_VIEW_FILTERS.filter((filter) => !PRIMARY_SAVED_VIEW_KEYS.has(filter.key))

// 캐시 TTL·SWR 창은 lib/crm/client-cache.ts(CRM_CACHE_TTL_MS · CRM_CACHE_SWR_MS)가 SSOT다 —
// 여기 사본(예전 90초)을 두지 않는다(2026-09-17 우선순위 P2, tests/crm/crm-cache-ttl-ssot.test.ts).
// 데스크톱 한 화면에 100행을 붙이면 초기 DOM과 스크린리더 탐색 비용이 과도하다.
// 50행 단위로 맞춰 필터/상세 전환 반응성을 우선한다.
export const PAGE_LIMIT = 50

export const OWNER_STORAGE_KEY = "classin_crm_unified_owner"
export const CURRENT_OWNER_VALUE = "__me"

export function rowToFlags(row: CrmUnifiedCustomerRow): CustomerFlag[] {
  return deriveCustomerFlags({
    // 전환 고객은 계정 계열 신호(잔액·만료 없음)로 취급 — 리드 규칙(new 등) 오적용 방지.
    source: row.source === "lead" ? "lead" : "neo_account",
    lifecycle: row.lifecycle,
    score: row.score,
    expireAt: row.expireAt,
    balance: row.balance,
    updatedAt: row.updatedAt,
  })
}

export function listUrl(input: {
  query: string
  source: SourceFilter
  lifecycle: LifecycleFilter
  owner: string
  view: SavedViewFilter
  tag: string
  /** 미확인 포함 토글 — URL(=클라이언트 캐시 키)에 실려 토글 상태별로 캐시가 분리된다. */
  includeUnconfirmed?: boolean
  offset: number
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.source !== "all") params.set("source", input.source)
  if (input.lifecycle !== "all") params.set("lifecycle", input.lifecycle)
  if (input.view !== "all") params.set("view", input.view)
  if (input.owner) params.set("owner", input.owner)
  if (input.tag) params.set("tag", input.tag)
  if (input.includeUnconfirmed) params.set("includeUnconfirmed", "1")
  return `/api/admin/crm/customers/unified?${params.toString()}`
}

// ── 화면 URL 상태(?view= · ?tag=) ──────────────────────────────────────
// 저장 뷰와 라벨은 화면 URL에 실리는 필터다(2026-09-21 — 라벨이 추가됐다). 검색어(?q=)는 착지 시
// 1회 복원만 하고 입력을 URL에 되쓰지 않으며, 원천·상태·담당은 로컬 state다.

export const UNIFIED_CUSTOMERS_PATH = "/admin/crm/customers/unified"

/**
 * `?tag=` 원문 → 라벨 필터 값. 저장 규칙과 같은 normalizeTag(trim → 연속 공백 1칸 → 40자 컷)로
 * 맞춘다 — 서버 필터는 행 태그와 문자열이 정확히 같아야 걸리므로(crm-unified-customers.ts
 * `row.tags.includes(tagFilter)`), 저장된 형태와 어긋난 공백이 0건 결과로 이어지지 않게 한다.
 * 없거나 공백뿐이면 ""(라벨 필터 없음).
 */
export function parseTagParam(raw: string | null | undefined): string {
  return raw ? normalizeTag(raw) : ""
}

/** 태그 관리 화면(/admin/crm/customers/tags) → 그 라벨로 좁힌 통합 고객 목록 딥링크. */
export function unifiedCustomersTagHref(tag: string): string {
  const value = parseTagParam(tag)
  return value ? `${UNIFIED_CUSTOMERS_PATH}?tag=${encodeURIComponent(value)}` : UNIFIED_CUSTOMERS_PATH
}

/**
 * 현재 화면 쿼리에 저장 뷰·라벨 변경을 한 번에 적용한 쿼리 문자열(앞의 `?` 없음)을 만든다.
 * 넘긴 키만 바꾸고 나머지(?account= 드로어·?q= 등)는 그대로 둔다. 둘을 함께 바꿀 때(필터 초기화)
 * 따로 router.replace를 두 번 부르면 두 번째 호출이 같은 이전 쿼리에서 출발해 첫 변경을 덮어쓴다 —
 * 그래서 한 번의 패치로 묶는다.
 */
export function patchUnifiedListParams(
  current: string,
  patch: { view?: SavedViewFilter; tag?: string }
): string {
  const params = new URLSearchParams(current)
  if (patch.view !== undefined) {
    if (patch.view === "all") params.delete("view")
    else params.set("view", patch.view)
  }
  if (patch.tag !== undefined) {
    const tag = parseTagParam(patch.tag)
    if (tag) params.set("tag", tag)
    else params.delete("tag")
  }
  return params.toString()
}

/**
 * 라벨 칩 목록 — 걸려 있는 라벨이 응답의 availableTags에 없어도(방금 이름이 바뀐 태그 딥링크 등)
 * 칩으로 보여 활성 상태와 해제 경로를 잃지 않게 맨 앞에 붙인다.
 */
export function tagChipsWithActive(availableTags: readonly string[] | undefined, activeTag: string): string[] {
  const tags = availableTags ? [...availableTags] : []
  if (activeTag && !tags.includes(activeTag)) tags.unshift(activeTag)
  return tags
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function normalizeText(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function mergePage(
  current: CrmUnifiedCustomers | null,
  next: CrmUnifiedCustomers,
  append: boolean
): CrmUnifiedCustomers {
  if (!append || !current) return next
  const seen = new Set(current.rows.map((row) => row.key))
  const rows = [...current.rows, ...next.rows.filter((row) => !seen.has(row.key))]
  return {
    ...next,
    rows,
    pagination: {
      ...next.pagination,
      offset: 0,
      returned: rows.length,
    },
  }
}
