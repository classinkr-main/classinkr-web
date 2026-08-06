// 통합 고객 목록의 순수 뷰 규칙 — 타입 + 매칭 함수만 담는 클라이언트 안전 모듈.
// 서버 전용 코드(Supabase/server-only)를 절대 import하지 않는다. 데이터 적재는
// lib/repositories/crm-unified-customers.ts(서버 저장소)가 담당하고, 이 모듈은
// "어떤 행이 어떤 저장 뷰에 보이는가"라는 규칙만 소유한다(단위 테스트 대상).

import type { CrmPrioritySource } from "@/lib/crm/priority"

// "customer" = 리드 전환(convert-v2)이 만드는 portal customers 테이블의 앱 고객.
export type CrmUnifiedCustomerSource = CrmPrioritySource | "customer"
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
  moneyLabel: string | null
  href: string
  updatedAt: string | null
  expireAt: string | null
  balance: number | null
  tags: string[]
  /** 리드 유입 출신 (lead 전용, 그 외 null) */
  origin: "site" | "ad" | "team" | null
  /** NEO(회사 CRM) 등록 확정 여부 — crm_source_links lead→external_account confirmed */
  crmRegistered: boolean
  /** 미확인(confirmed_at null)·status new 리드 — site_leads/unanswered 뷰에서만 노출 */
  provisional: boolean
  /** 응답 SLA 대상 소스(demo_modal/contact_page/meta_lead_ads) 여부 */
  slaTarget: boolean
  /** 이 리드를 대상으로 한 팀 최초 기록 시각 (없으면 null) */
  firstResponseAt: string | null
  /** 리드 생성 시각(SLA 경과 계산용, lead 전용) */
  createdAt: string | null
  /** 사람이 남긴 CRM 기록 중 가장 최근 컨택 시각 */
  lastContactAt?: string | null
  /** Portal V2에서 현재 진행 중인 딜 수 */
  activeDealCount?: number
}

export function rowMatchesOwner(row: CrmUnifiedCustomerRow, ownerKeys: Set<string>) {
  if (ownerKeys.size === 0) return true
  return row.ownerKeys.some((key) => ownerKeys.has(key))
}

export function daysUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return (time - nowMs) / 86_400_000
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
  // 최근 컨택: 사람이 남긴 CRM 기록이 최근 30일 안에 있는 고객/리드.
  if (view === "recent_contact") {
    const d = daysUntil(row.lastContactAt ?? null, nowMs)
    return d != null && d <= 0 && d >= -30
  }
  // 진행 중인 딜: Portal V2 고객 중 active_deals가 1건 이상.
  if (view === "active_deal") return row.source === "customer" && (row.activeDealCount ?? 0) > 0
  // 만료 임박: NEO 만료일이 14일 이내(지난 것 포함).
  if (view === "expiring") {
    const d = daysUntil(row.expireAt, nowMs)
    return d != null && d <= 14
  }
  // 30일+ 미접촉: 마지막 활동(updatedAt)이 30일보다 오래됨.
  if (view === "dormant") {
    const d = daysUntil(row.updatedAt, nowMs)
    return d != null && d <= -30
  }
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
  return true
}

// 미확인(provisional) 리드는 처리 큐 또는 실제 컨택 근거가 있는 뷰에서만 노출한다.
const PROVISIONAL_VISIBLE_VIEWS: ReadonlySet<CrmUnifiedSavedView> = new Set([
  "site_leads",
  "unanswered",
  "recent_contact",
])

export function rowVisibleInView(
  row: CrmUnifiedCustomerRow,
  view: CrmUnifiedSavedView,
  ownerKeys: Set<string>,
  nowMs: number
) {
  if (row.provisional && !PROVISIONAL_VISIBLE_VIEWS.has(view)) return false
  return matchesSavedView(row, view, ownerKeys, nowMs)
}
