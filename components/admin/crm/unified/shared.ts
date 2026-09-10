// 통합 고객(ClassIn 고객 DB) 화면 공유 타입·상수·순수 헬퍼.
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import type {
  CrmUnifiedCustomerRow,
  CrmUnifiedCustomerSource,
  CrmUnifiedLifecycle,
  CrmUnifiedSavedView,
} from "@/lib/repositories/crm-unified-customers"
import { deriveCustomerFlags, type CustomerFlag } from "@/lib/crm/customer-flags"

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

export function customerSourceTone(status: CustomerSourceStatus) {
  if (!status.ok) {
    return {
      surface: "border-[#F6D5C5] bg-[#FEF3EE]",
      text: "text-[#B85C33]",
    }
  }
  if (status.partial) {
    return {
      surface: "border-[#ECD29C] bg-[#FBF1E0]",
      text: "text-[#7A520F]",
    }
  }
  return {
    surface: "border-[#D7EBDD] bg-[#ECFDF5]",
    text: "text-[#084734]",
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

export const CACHE_TTL_MS = 90_000
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
  offset: number
}) {
  const params = new URLSearchParams({ limit: String(PAGE_LIMIT), offset: String(input.offset) })
  if (input.query.trim()) params.set("q", input.query.trim())
  if (input.source !== "all") params.set("source", input.source)
  if (input.lifecycle !== "all") params.set("lifecycle", input.lifecycle)
  if (input.view !== "all") params.set("view", input.view)
  if (input.owner) params.set("owner", input.owner)
  if (input.tag) params.set("tag", input.tag)
  return `/api/admin/crm/customers/unified?${params.toString()}`
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
