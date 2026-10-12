import "server-only"

import {
  getNeoCrmCustomerDetail,
  type NeoCrmCustomerDetail,
  type NeoCrmCustomerEeoAccount,
  type NeoCrmCustomerMoneyItem,
} from "@/lib/admin-crm-customers-neo"
import { getCompassActivitiesByLeadIds, getCompassLeadsByPhoneKeys } from "@/lib/compass/bridge"
import { compassLeadUrl, normalizePhoneKey } from "@/lib/compass/normalize"
import { pickRepresentativeCompassRow } from "@/lib/compass/overlay"
import {
  toCompassTimelineEntries,
  type CompassTimelineEntry,
} from "@/lib/crm/compass-timeline"
import { EXPIRING_SOON_DAYS } from "@/lib/crm/customer-segment-spec"
import { classifyLeadOrigin, type LeadOriginClass } from "@/lib/crm/capture/origin"
import {
  buildCustomerContactSummary,
  HUMAN_CONTACT_EVENT_SOURCE_TYPES,
  isHumanContactEventSource,
  isLeadEraRow,
  type CustomerContactSummary,
} from "@/lib/crm/customer-contact-summary"
import { leadContactEventTitle } from "@/lib/crm/lead-contact-event"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import { buildLeadPriorityItem } from "@/lib/crm/priority"
import {
  EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY,
  EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY,
  getCrmAccountProductSummary,
  getCrmMoneyLineItemsSummary,
  type CrmAccountProductSummary,
} from "@/lib/repositories/crm-account-money"
import type {
  CrmMoneyLineItem,
  CrmMoneyLineItemsMeta,
  CrmUnmatchedOutboundCandidate,
} from "@/lib/crm/money-line-items"
import { deriveServiceRisk, type ServiceRisk } from "@/lib/crm/service-risk"
import { getCustomerTags } from "@/lib/repositories/crm-customer-tags"
import {
  LEAD_CONTACT_MIRROR_SOURCE_TYPES,
  listCrmCustomerEvents,
  type CrmCustomerEventRecord,
  type CrmCustomerEventTargetType,
  type ListCrmCustomerEventsResult,
} from "@/lib/repositories/crm-events"
import { findConfirmedLeadNeoLink } from "@/lib/repositories/crm-source-links"
import { listCrmDeals, type ListCrmDealsResult } from "@/lib/repositories/crm-deals"
import { listCrmTasks, type ListCrmTasksResult } from "@/lib/repositories/crm-tasks"
import { getLeadById, type LeadRecord } from "@/lib/repositories/leads"
import { hasAdClickId } from "@/lib/crm/lead-attribution"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ContactLogResult, ContactLogType } from "@/lib/supabase/database.types"

export type Customer360Source = "lead" | "neo_account"
export type Customer360Severity = "critical" | "high" | "medium" | "low"

const DAY_MS = 24 * 60 * 60 * 1000

export interface ParsedCustomerKey {
  source: "lead" | "neo"
  entityId: string
  targetType: Customer360Source
}

/**
 * 라우트 세그먼트로 들어온 고객 키를 원래 모양(`lead:{id}`)으로 되돌린다.
 * Next 16.2 는 동적 페이지 본문의 params 를 퍼센트 인코딩된 채(`lead%3A{id}`) 넘긴다 — 같은 요청의
 * generateMetadata·라우트 핸들러는 디코드된 값을 받는다. 그대로 파싱하면 ':' 가 없어 상세 페이지가 404 였다
 * (2026-09-29 운영 재현: 탭 제목은 고객 이름인데 본문은 notFound). '%' 가 없으면 그대로, 잘못된 시퀀스면 원문.
 */
export function normalizeUnifiedCustomerKeyParam(raw: string): string {
  if (!raw.includes("%")) return raw
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

// unified 행 key는 `lead:{id}` 또는 `neo:{accountId}`. accountId에 ':'가 있을 수 있어 첫 ':'에서만 분리한다.
// 라우트 세그먼트 원문(퍼센트 인코딩)도 받는다 — normalizeUnifiedCustomerKeyParam.
export function parseUnifiedCustomerKey(rawKey: string | null | undefined): ParsedCustomerKey | null {
  if (!rawKey) return null
  const key = normalizeUnifiedCustomerKeyParam(rawKey)
  const idx = key.indexOf(":")
  if (idx <= 0) return null
  const source = key.slice(0, idx)
  const entityId = key.slice(idx + 1).trim()
  if (!entityId) return null
  if (source === "lead") return { source: "lead", entityId, targetType: "lead" }
  if (source === "neo") return { source: "neo", entityId, targetType: "neo_account" }
  return null
}

export interface Customer360Header {
  key: string
  source: Customer360Source
  sourceLabel: string
  name: string
  statusLabel: string
  ownerName: string | null
  ownerKeys: string[]
  region: string | null
  score: number | null
  priorityReason: string | null
  nextActionLabel: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface Customer360ContactField {
  label: string
  value: string
}

export interface Customer360Contacts {
  phone: string | null
  email: string | null
  message: string | null
  extra: Customer360ContactField[]
}

export interface Customer360Money {
  available: boolean
  label: string | null
  totalBalance: number | null
  totalOrderAmount: number | null
  orders: NeoCrmCustomerMoneyItem[]
  collections: NeoCrmCustomerMoneyItem[]
  performances: NeoCrmCustomerMoneyItem[]
  eeoAccounts: NeoCrmCustomerEeoAccount[]
  /**
   * M2 — 고객 단위 품목별 대수(`deal_line_items`·HW 출고를 계정키로 합산). lead 대상이거나
   * 조회에 실패하면 빈 배열 + lineItemsMeta.note로 이유를 밝힌다(360 전체를 막지 않는다).
   */
  lineItems: CrmMoneyLineItem[]
  lineItemsMeta: CrmMoneyLineItemsMeta
  /** M4 — 이름은 비슷하지만 아직 확정 링크가 없는 HW 출고 후보(유사도 상위 5). */
  unmatchedOutbound: CrmUnmatchedOutboundCandidate[]
}

export interface Customer360Risk {
  severity: Customer360Severity
  reasons: string[]
  overdueTaskCount: number
  riskEventCount: number
  nearestExpireAt: string | null
  totalBalance: number | null
}

/**
 * Compass(마케팅팀 앱) 활동 병합 결과.
 * `down`은 "활동이 없다"가 아니라 "브리지가 끊겨 확인할 수 없다"는 뜻이다 — 화면은 둘을 구분한다.
 */
export interface Customer360Compass {
  /** 전화 정규화 키로 매칭된 Compass 리드 id들 */
  leadIds: number[]
  /**
   * 대표 리드 딥링크(매칭 리드가 하나도 없으면 null). 같은 전화에 Compass 리드가 여러 건이면
   * lib/compass/overlay pickRepresentativeCompassRow(최근성 → id) — 리드 보드 칩과 같은 리드를 연다.
   */
  href: string | null
  /**
   * A안(2026-09-25) — 대표 리드의 Compass 단계 원값(normalize.ts 사전 키, 예: "contact"·"bd"). 표시 보조용이며
   * 옛 캐시·픽스처에는 없을 수 있다(옵셔널). 본문(next_action·메모)은 싣지 않는다.
   */
  stage?: string | null
  entries: CompassTimelineEntry[]
  down: boolean
  /**
   * CT9 — 매칭 Compass 리드의 다음 액션 예정 시각(종료(lost) 리드 제외). 본문(next_action)은
   * 싣지 않는다 — 어드민에 Compass 텍스트를 복제하지 않는다(lib/compass/overlay.ts 계약).
   */
  nextActionAts: string[]
}

/**
 * CT9 — 확정 연결된 과거 리드("리드 시절") 기록 병합 상태.
 * NEO 계정 360 만 채운다(crm_source_links lead→external_account confirmed). 리드 360 은 leadIds=[].
 */
export interface Customer360LinkedLeads {
  /** 확정 연결된 리드 id(최신 확정순, 상한 LINKED_LEAD_LIMIT) */
  leadIds: string[]
  /** 상한을 넘어 일부 리드만 합쳤다 */
  truncated: boolean
  /** 타임라인(activity.rows)에 합쳐진 리드 시절 행 수 — 상한 자르기 뒤 실제로 보이는 수 */
  mergedCount: number
  /** 연결·연락 로그 조회 실패 — 리드 시절 기록이 빠졌을 수 있다(0건과 다르다) */
  down: boolean
}

export interface Customer360 {
  generatedAt: string
  key: string
  source: Customer360Source
  entityId: string
  found: boolean
  health: { ok: boolean; warnings: string[] }
  header: Customer360Header | null
  contacts: Customer360Contacts | null
  money: Customer360Money
  /** REV/HW 원장을 계정키로 조인한 제품 매출 요약(SW·HW 결제 누적, 칠판 대수, 매칭 여부) */
  productSummary: CrmAccountProductSummary
  /** 리드 유입 출신(site/ad/team) — lead 전용, 그 외 null */
  origin: LeadOriginClass | null
  /** 리드가 NEO(회사 CRM) 계정으로 등록 확정됐는지 — crm_source_links lead→external_account confirmed */
  crmRegistered: boolean
  /**
   * A안(2026-09-25) — 리드 상태 원값(new·contacted·converted·closed). NEO 계정·미발견은 null.
   * 기록 위치 판정(lib/crm/write-surface: 전환 리드는 Home 정본)용 additive 필드 — 옛 캐시 페이로드·
   * 테스트 픽스처에는 없을 수 있어 옵셔널이다.
   */
  leadStatus?: LeadRecord["status"] | null
  /** 확정된 NEO 계정 id (crmRegistered=true일 때만, 그 외 null) */
  neoAccountId: string | null
  risk: Customer360Risk
  serviceRisk: ServiceRisk | null
  /**
   * 활동 타임라인. 자기 기록(조회 키 정확 일치) + CT9 병합분 — NEO 계정 360 은 확정 연결 리드의
   * 기록(target_type lead = 리드 시절), 두 대상 모두 CRM 미러가 빠진 리드 연락 로그 원본 행.
   * 병합이 있으면 합친 뒤 eventsLimit 로 자르고 total 은 원천별 합이다(중복 제거 후).
   */
  activity: ListCrmCustomerEventsResult
  /** CT9 — 확정 연결 리드 병합 상태 */
  linkedLeads: Customer360LinkedLeads
  /** CT9 — 마지막 연락 · 다음 연락(lib/crm/customer-contact-summary SSOT, generatedAt 기준) */
  contactSummary: CustomerContactSummary
  /** Compass 활동(콜·미팅·메모·재유입·단계 변경) — 기존 타임라인에 소스 라벨로 병합된다 */
  compass: Customer360Compass
  tasks: ListCrmTasksResult
  deals: ListCrmDealsResult
  /** 수기 라벨(crm_customer_tags) — 드로어 온-오픈 별도 태그 fetch를 없애기 위한 additive 필드 */
  tags: string[]
}

function latestLastClassAt(eeoAccounts: NeoCrmCustomerEeoAccount[]): string | null {
  let best: number | null = null
  let bestIso: string | null = null
  for (const account of eeoAccounts) {
    if (!account.lastClassAt) continue
    const time = new Date(account.lastClassAt).getTime()
    if (Number.isNaN(time)) continue
    if (best == null || time > best) {
      best = time
      bestIso = account.lastClassAt
    }
  }
  return bestIso
}

function latestEeoSyncedAt(eeoAccounts: NeoCrmCustomerEeoAccount[]): string | null {
  let latest: string | null = null
  for (const account of eeoAccounts) {
    if (!account.syncedAt) continue
    const time = new Date(account.syncedAt).getTime()
    if (Number.isNaN(time)) continue
    if (!latest || time > new Date(latest).getTime()) latest = account.syncedAt
  }
  return latest
}

export interface GetCrmCustomer360Options {
  eventsLimit?: number
  tasksLimit?: number
  /** 딜 조회 상한. 상세 페이지는 드로어보다 넉넉히 잡아 요약 집계가 전체를 덮게 한다. */
  dealsLimit?: number
  now?: Date
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function uniqueOwnerKeys(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.map((value) => value?.trim().toLowerCase()).filter((value): value is string => Boolean(value))
    ),
  ]
}

function leadDisplayName(lead: LeadRecord) {
  return lead.org || lead.name || lead.email || lead.phone || "이름 없는 리드"
}

const LEAD_STATUS_LABELS: Record<LeadRecord["status"], string> = {
  new: "신규 리드",
  contacted: "접촉 중",
  converted: "전환 완료",
  closed: "종료",
}

export function buildLeadHeader(key: string, lead: LeadRecord, now = new Date()): Customer360Header {
  const priority = buildLeadPriorityItem(lead, now)
  return {
    key,
    source: "lead",
    sourceLabel: "리드",
    name: leadDisplayName(lead),
    statusLabel: LEAD_STATUS_LABELS[lead.status] ?? "리드",
    ownerName: lead.assigned_to ?? null,
    ownerKeys: uniqueOwnerKeys([lead.assigned_to]),
    region: deriveLeadRegionLabel(lead),
    score: priority?.score ?? null,
    priorityReason: priority?.reason ?? null,
    nextActionLabel: priority?.actionLabel ?? null,
    createdAt: lead.timestamp ?? null,
    updatedAt: lead.follow_up_at ?? lead.timestamp ?? null,
  }
}

export function buildLeadContacts(lead: LeadRecord): Customer360Contacts {
  const extra: Customer360ContactField[] = []
  if (lead.org) extra.push({ label: "기관", value: lead.org })
  if (lead.role) extra.push({ label: "역할", value: lead.role })
  if (lead.size) extra.push({ label: "규모", value: lead.size })
  if (lead.source) extra.push({ label: "유입", value: lead.source_detail ? `${lead.source} · ${lead.source_detail}` : lead.source })
  if (lead.lead_magnet) extra.push({ label: "자료", value: lead.lead_magnet })
  return {
    phone: lead.phone ?? null,
    email: lead.email ?? null,
    message: lead.message ?? null,
    extra,
  }
}

function nearestExpireAt(eeoAccounts: NeoCrmCustomerEeoAccount[]): string | null {
  let best: number | null = null
  let bestIso: string | null = null
  for (const account of eeoAccounts) {
    if (!account.expireAt) continue
    const time = new Date(account.expireAt).getTime()
    if (Number.isNaN(time)) continue
    if (best == null || time < best) {
      best = time
      bestIso = account.expireAt
    }
  }
  return bestIso
}

function sumNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (present.length === 0) return null
  return present.reduce((sum, value) => sum + value, 0)
}

export function summarizeNeoMoney(detail: NeoCrmCustomerDetail): Customer360Money {
  const totalBalance = sumNullable(detail.eeoAccounts.map((account) => account.balance))
  const totalOrderAmount = sumNullable(detail.orders.map((order) => order.amount))
  return {
    available: detail.orders.length > 0 || detail.collections.length > 0 || detail.eeoAccounts.length > 0,
    label: null,
    totalBalance,
    totalOrderAmount,
    orders: detail.orders,
    collections: detail.collections,
    performances: detail.performances,
    eeoAccounts: detail.eeoAccounts,
    // M2·M4는 header 조립 이후(계정 id 필요) 별도로 채워 넣는다 — 여기서는 자리만 둔다.
    lineItems: [],
    lineItemsMeta: EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY.lineItemsMeta,
    unmatchedOutbound: [],
  }
}

export function buildNeoHeader(key: string, detail: NeoCrmCustomerDetail, now = new Date()): Customer360Header {
  const account = detail.account
  const expiringSoon = detail.eeoAccounts.some((eeo) => {
    if (!eeo.expireAt) return false
    const time = new Date(eeo.expireAt).getTime()
    if (Number.isNaN(time)) return false
    // 만료 임박 일수는 통합 목록·행 플래그와 같은 SSOT 상수(EXPIRING_SOON_DAYS)다. 다만 이 헤더의 "관리 필요"는
    // 만료 임박 + 이미 지난 만료 기준이라, 통합 목록의 "관리 필요 고객" 뷰(우선순위 점수 42+)와는 다른 신호다.
    return time - now.getTime() <= EXPIRING_SOON_DAYS * DAY_MS
  })
  const statusLabel = detail.eeoAccounts.length === 0 ? "고객" : expiringSoon ? "관리 필요" : "활성 고객"
  return {
    key,
    source: "neo_account",
    sourceLabel: "고객",
    name: account?.name ?? "이름 없는 고객",
    statusLabel,
    ownerName: account?.ownerName ?? null,
    ownerKeys: uniqueOwnerKeys([account?.ownerName, account?.accountId]),
    region: account?.region ?? null,
    score: null,
    priorityReason: null,
    nextActionLabel: null,
    createdAt: account?.createdAt ?? null,
    updatedAt: account?.updatedAt ?? null,
  }
}

export interface RiskInput {
  overdueTaskCount: number
  riskEventCount: number
  nearestExpireAt: string | null
  totalBalance: number | null
  now?: Date
}

export function computeCustomer360Risk(input: RiskInput): Customer360Risk {
  const now = input.now ?? new Date()
  const reasons: string[] = []
  let score = 0

  if (input.overdueTaskCount > 0) {
    score += input.overdueTaskCount * 20
    reasons.push(`지연된 할 일 ${input.overdueTaskCount}건`)
  }
  if (input.riskEventCount > 0) {
    score += input.riskEventCount * 12
    reasons.push(`위험 신호 기록 ${input.riskEventCount}건`)
  }

  if (input.nearestExpireAt) {
    const time = new Date(input.nearestExpireAt).getTime()
    if (!Number.isNaN(time)) {
      const days = Math.floor((time - now.getTime()) / DAY_MS)
      if (days < 0) {
        score += 40
        reasons.push(`${Math.abs(days)}일 전 만료`)
      } else if (days <= 14) {
        score += 28
        reasons.push(`${days}일 내 만료`)
      } else if (days <= 30) {
        score += 16
        reasons.push(`${days}일 내 만료 예정`)
      }
    }
  }

  const severity: Customer360Severity =
    score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : "low"

  return {
    severity,
    reasons,
    overdueTaskCount: input.overdueTaskCount,
    riskEventCount: input.riskEventCount,
    nearestExpireAt: input.nearestExpireAt,
    totalBalance: input.totalBalance,
  }
}

const EMPTY_COMPASS: Customer360Compass = { leadIds: [], href: null, entries: [], down: false, nextActionAts: [] }

/** Compass 리드 단계 중 끝난 것 — 이 리드의 다음 액션은 "다음 연락" 후보가 아니다(normalize.ts: lost=종료). */
const COMPASS_ENDED_STAGES: ReadonlySet<string> = new Set(["lost"])

/**
 * 전화 하나로 Compass 활동을 끌어온다: 전화 → normalizePhoneKey → compass_leads_v →
 * compass_activities_v. 360은 단건 화면이라 추가 쿼리 2회를 허용한다.
 * 전화가 없으면 조회 자체를 하지 않는다(추측 매칭 금지).
 */
async function loadCompassActivity(phone: string | null | undefined): Promise<Customer360Compass> {
  const key = normalizePhoneKey(phone)
  if (!key) return EMPTY_COMPASS

  const leads = await getCompassLeadsByPhoneKeys([key])
  if (leads.down) return { ...EMPTY_COMPASS, down: true }
  const leadIds = leads.rows.map((row) => row.id)
  if (leadIds.length === 0) return EMPTY_COMPASS
  // 대표 행 — 정렬 없는 조회의 leadIds[0] 을 쓰면 같은 전화의 여러 Compass 리드 중 리드 보드 칩과 다른
  // 리드를 열 수 있다. 칩·상태 자동 반영과 같은 규칙(최근성 → id)으로 고정한다.
  const representative = pickRepresentativeCompassRow(leads.rows)
  const href = representative ? compassLeadUrl(representative.id) : null
  const stage = representative?.stage?.trim() || null
  const nextActionAts = leads.rows
    .filter((row) => !COMPASS_ENDED_STAGES.has(row.stage?.trim() ?? ""))
    .map((row) => row.next_action_at?.trim() ?? "")
    .filter(Boolean)

  const activities = await getCompassActivitiesByLeadIds(leadIds)
  if (activities.down) {
    return { leadIds, href, stage, entries: [], down: true, nextActionAts }
  }

  return {
    leadIds,
    href,
    stage,
    entries: toCompassTimelineEntries(activities.rows),
    down: false,
    nextActionAts,
  }
}

// ── CT9 · 연결 리드 기록 병합 ──────────────────────────────────────────────

/** 한 NEO 계정에 합칠 확정 연결 리드 수 상한 — 드문 다건 연결에서 쿼리 폭주를 막는다. */
export const LINKED_LEAD_LIMIT = 5

/**
 * NEO 계정에 확정 연결된 리드 id — source_object='leads' → target_type='external_account' confirmed.
 * external_lead 는 target_id 가 계정 id 가 아니라(CRM 리드 레코드 id) 계정 네임스페이스와 달라 뺀다
 * (crm-source-links.ts listConfirmedLeadNeoAccountLinks 와 같은 판단). source_system='lead' 는 결과를
 * 바꾸지 않지만 같은 모양을 유지한다. crm_source_links_target_idx(target_type, target_id, status)를 탄다.
 */
async function findConfirmedLeadIdsForNeoAccount(
  accountId: string
): Promise<{ leadIds: string[]; truncated: boolean }> {
  const target = accountId.trim()
  if (!target) return { leadIds: [], truncated: false }
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("crm_source_links")
    .select("source_record_key")
    .eq("source_system", "lead")
    .eq("source_object", "leads")
    .eq("target_type", "external_account")
    .eq("target_id", target)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(LINKED_LEAD_LIMIT + 1)
  if (error) throw new Error(`crm_source_links 계정→리드 조회 실패: ${error.message}`)
  const ids = [
    ...new Set(
      ((data ?? []) as Array<{ source_record_key: string | null }>)
        .map((row) => String(row.source_record_key ?? "").trim())
        .filter(Boolean)
    ),
  ]
  return { leadIds: ids.slice(0, LINKED_LEAD_LIMIT), truncated: ids.length > LINKED_LEAD_LIMIT }
}

/** lead_contact_logs 원본 행 — 타임라인 행으로 바꾸는 데 필요한 필드만. */
export interface Customer360LeadContactLogRow {
  id: string
  lead_id: string
  type: ContactLogType
  result: ContactLogResult | null
  notes: string | null
  contacted_at: string
  contacted_by: string | null
}

/** 리드들의 연락 로그 원본(최신순, limit). 연락 로그가 1차 증거이고 crm_customer_events 는 미러다. */
async function listLeadContactLogsForLeads(
  leadIds: string[],
  limit: number
): Promise<Customer360LeadContactLogRow[]> {
  if (leadIds.length === 0) return []
  const sb = createSupabaseAdminClient()
  const { data, error } = await sb
    .from("lead_contact_logs")
    .select("id, lead_id, type, result, notes, contacted_at, contacted_by")
    .in("lead_id", leadIds)
    .order("contacted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
  if (error) throw new Error(`리드 연락 기록 조회 실패: ${error.message}`)
  return (data ?? []) as Customer360LeadContactLogRow[]
}

/**
 * 연락 로그 원본 → 타임라인 행. 미러(logs/route.ts mirrorContactLogToCrm → buildLeadContactEventInput)와
 * 같은 제목·감정을 쓰되, 할 일 승격(nextActions)은 만들지 않는다 — 여기는 읽기 전용 표시다.
 * id 는 `lead-contact-log:{로그 id}` 로 이벤트 id 와 겹치지 않게 한다.
 */
export function leadContactLogToTimelineRow(log: Customer360LeadContactLogRow): CrmCustomerEventRecord {
  return {
    id: `lead-contact-log:${log.id}`,
    targetType: "lead",
    targetId: log.lead_id,
    targetLabel: null,
    sourceType: "lead_contact_log",
    sourceId: log.id,
    occurredAt: log.contacted_at,
    title: leadContactEventTitle(log),
    summary: null,
    body: log.notes,
    meetingPurpose: null,
    ownerName: log.contacted_by,
    attendees: [],
    decisions: [],
    blockers: [],
    nextActions: [],
    sentiment: log.result === "meeting_set" ? "positive" : "neutral",
    stageSignal: null,
    tags: [],
    publicEventId: null,
    attendeeOrigin: null,
    recording: null,
    createdBy: log.contacted_by,
    createdAt: log.contacted_at,
    updatedAt: log.contacted_at,
  }
}

function eventTimeMs(value: string): number {
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

export interface MergeLeadHistoryInput {
  /** 360 대상 종류 — "neo_account" 면 target_type lead 행을 리드 시절로 센다 */
  customerSource: Customer360Source
  /** 자기 기록(조회 키 정확 일치) 조회 결과 */
  own: ListCrmCustomerEventsResult
  /** 확정 연결 리드들의 기록 창(리드별 eventsLimit) */
  linkedEvents: CrmCustomerEventRecord[]
  /** 연결 리드 기록 총수(리드별 total 합) */
  linkedEventsTotal: number
  /** 연락 로그 원본(리드 360 은 자기, NEO 360 은 연결 리드) */
  logs: Customer360LeadContactLogRow[]
  limit: number
}

export interface MergeLeadHistoryResult {
  activity: ListCrmCustomerEventsResult
  /** activity.rows 안의 리드 시절 행 수 */
  mergedCount: number
}

/**
 * 자기 기록 + 연결 리드 기록 + 미러가 없는 연락 로그를 한 타임라인으로 합친다(순수).
 *  - 중복 제거: 같은 id 는 한 번. 연락 로그는 리드 대상 미러 이벤트(source_type ∈ lead_contact_log·call·sms
 *    — 드로어 로그와 기록 컴포저 콜·문자 둘 다, source_id=로그 id)가 이미 있으면 원본 행을 더하지 않는다.
 *  - 합칠 것이 없으면 own 을 그대로 돌려준다(기존 페이지네이션·집계 의미 보존).
 *  - 합치면 최신순 정렬 뒤 limit 로 자른다(기존 50건 상한 규약). total 은 원천별 합, 더 보기는
 *    total > rows 로만 판단한다(offset 페이지네이션은 병합 결과에 의미가 없어 nextOffset=null).
 */
export function mergeLeadHistoryIntoActivity(input: MergeLeadHistoryInput): MergeLeadHistoryResult {
  const { own, customerSource, limit } = input
  const mirrorTypes = new Set<string>(LEAD_CONTACT_MIRROR_SOURCE_TYPES)
  const mirroredLogIds = new Set(
    [...own.rows, ...input.linkedEvents]
      .filter((row) => mirrorTypes.has(row.sourceType) && row.targetType === "lead" && row.sourceId)
      .map((row) => row.sourceId as string)
  )
  const logRows = input.logs.filter((log) => !mirroredLogIds.has(log.id)).map(leadContactLogToTimelineRow)
  const extra = [...input.linkedEvents, ...logRows]
  if (extra.length === 0) {
    return { activity: own, mergedCount: 0 }
  }

  const seen = new Set<string>()
  const pool: Array<{ row: CrmCustomerEventRecord; index: number }> = []
  for (const row of [...own.rows, ...extra]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    pool.push({ row, index: pool.length })
  }
  // 최신순, 동시각이면 원래 순서(자기 기록 먼저) — 안정 정렬을 명시한다.
  pool.sort((a, b) => eventTimeMs(b.row.occurredAt) - eventTimeMs(a.row.occurredAt) || a.index - b.index)
  const rows = pool.slice(0, Math.max(1, limit)).map((item) => item.row)

  const total = own.summary.total + input.linkedEventsTotal + logRows.length
  const returned = rows.length
  const hasMore = total > returned
  return {
    activity: {
      ...own,
      summary: {
        total,
        returned,
        recordings: rows.filter((row) => Boolean(row.recording)).length,
        risks: rows.filter((row) => row.sentiment === "risk").length,
        openNextActions: rows.reduce((sum, row) => sum + row.nextActions.filter((action) => !action.done).length, 0),
      },
      pagination: {
        limit,
        offset: 0,
        returned,
        total,
        hasMore,
        nextOffset: null,
      },
      rows,
    },
    mergedCount: rows.filter((row) => isLeadEraRow(customerSource, row.targetType)).length,
  }
}

/**
 * 조회 창(최신 N건)에 사람 연락이 하나도 없는데 더 오래된 기록이 남아 있으면, 창 밖의 최신 사람 연락을
 * 따로 한 건 찾아야 마지막 연락이 비지 않는다. 창 안에 하나라도 있으면 그것이 전체 최신이다.
 */
export function needsLatestContactProbe(window: ListCrmCustomerEventsResult): boolean {
  return window.pagination.hasMore && !window.rows.some((row) => isHumanContactEventSource(row.sourceType))
}

async function probeLatestContact(
  targetType: CrmCustomerEventTargetType,
  targetId: string
): Promise<CrmCustomerEventRecord[]> {
  const result = await listCrmCustomerEvents({
    targetType,
    targetId,
    sourceTypes: [...HUMAN_CONTACT_EVENT_SOURCE_TYPES],
    limit: 1,
  })
  return result.rows
}

interface LinkedLeadEventsLoad {
  rows: CrmCustomerEventRecord[]
  total: number
  /** 창 밖 최신 사람 연락(마지막 연락 계산 전용 — 타임라인에는 넣지 않는다) */
  probes: CrmCustomerEventRecord[]
}

const EMPTY_LINKED_LEAD_EVENTS: LinkedLeadEventsLoad = { rows: [], total: 0, probes: [] }

/** 연결 리드별 기록 창(eventsLimit) + 필요할 때만 최신 사람 연락 한 건. 리드 수는 LINKED_LEAD_LIMIT 이하. */
async function loadLinkedLeadEvents(leadIds: string[], limit: number): Promise<LinkedLeadEventsLoad> {
  if (leadIds.length === 0) return EMPTY_LINKED_LEAD_EVENTS
  const perLead = await Promise.all(
    leadIds.map(async (leadId) => {
      const window = await listCrmCustomerEvents({ targetType: "lead", targetId: leadId, limit })
      const probes = needsLatestContactProbe(window) ? await probeLatestContact("lead", leadId) : []
      return { window, probes }
    })
  )
  return {
    rows: perLead.flatMap((item) => item.window.rows),
    total: perLead.reduce((sum, item) => sum + item.window.summary.total, 0),
    probes: perLead.flatMap((item) => item.probes),
  }
}

const EMPTY_MONEY: Customer360Money = {
  available: false,
  label: null,
  totalBalance: null,
  totalOrderAmount: null,
  orders: [],
  collections: [],
  performances: [],
  eeoAccounts: [],
  lineItems: [],
  lineItemsMeta: EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY.lineItemsMeta,
  unmatchedOutbound: [],
}

function emptyEventsResult(): ListCrmCustomerEventsResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: false, message: "활동 기록을 불러오지 못했습니다." },
    summary: { total: 0, returned: 0, recordings: 0, risks: 0, openNextActions: 0 },
    pagination: { limit: 0, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

function emptyTasksResult(): ListCrmTasksResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: false, message: "할 일을 불러오지 못했습니다." },
    summary: { total: 0, returned: 0, open: 0, overdue: 0, dueToday: 0, snoozed: 0, done: 0 },
    pagination: { limit: 0, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

function emptyDealsResult(): ListCrmDealsResult {
  return {
    generatedAt: new Date().toISOString(),
    health: { ok: false, message: "딜을 불러오지 못했습니다." },
    summary: { total: 0, returned: 0, open: 0, won: 0, lost: 0, openAmount: 0, noNextActionCount: 0, aggregateTruncated: false },
    pagination: { limit: 0, offset: 0, returned: 0, total: 0, hasMore: false, nextOffset: null },
    rows: [],
  }
}

export async function getCrmCustomer360(
  parsed: ParsedCustomerKey,
  options: GetCrmCustomer360Options = {}
): Promise<Customer360> {
  const now = options.now ?? new Date()
  const eventsLimit = clampInt(options.eventsLimit, 20, 1, 50)
  const tasksLimit = clampInt(options.tasksLimit, 50, 1, 50)
  const dealsLimit = clampInt(options.dealsLimit, 20, 1, 200)
  const key = `${parsed.source}:${parsed.entityId}`
  const warnings: string[] = []

  const [headerResult, eventsResult, tasksResult, dealsResult, neoLinkResult, tagsResult, linkedLeadIdsResult] =
    await Promise.allSettled([
      parsed.source === "lead"
        ? getLeadById(parsed.entityId)
        : getNeoCrmCustomerDetail(parsed.entityId),
      listCrmCustomerEvents({ targetType: parsed.targetType, targetId: parsed.entityId, limit: eventsLimit }),
      listCrmTasks({ targetType: parsed.targetType, targetId: parsed.entityId, status: "active", limit: tasksLimit, now }),
      listCrmDeals({ targetType: parsed.targetType, targetId: parsed.entityId, limit: dealsLimit }),
      // 리드 → NEO 등록 확정 여부(드로어 'NEO 등록됨' 액션용). NEO 계정 드로어는 해당 없음.
      parsed.source === "lead" ? findConfirmedLeadNeoLink(parsed.entityId) : Promise.resolve(null),
      // 수기 라벨 — 드로어가 열릴 때 별도 태그 fetch를 하지 않도록 360에 동승시킨다.
      getCustomerTags(parsed.targetType, parsed.entityId),
      // CT9 — NEO 계정에 확정 연결된 과거 리드(리드 시절 기록 병합 대상). 리드 360 은 해당 없음.
      parsed.source === "neo"
        ? findConfirmedLeadIdsForNeoAccount(parsed.entityId)
        : Promise.resolve({ leadIds: [] as string[], truncated: false }),
    ])

  let header: Customer360Header | null = null
  let contacts: Customer360Contacts | null = null
  let money: Customer360Money = EMPTY_MONEY
  let serviceRisk: ServiceRisk | null = null
  let found = false
  let origin: LeadOriginClass | null = null
  // A안 — 기록 위치 판정용 리드 상태 원값(NEO 계정은 null).
  let leadStatus: LeadRecord["status"] | null = null
  // CT9 — 진행 중인 리드의 팔로업만 "다음 연락" 후보다(전환·종료 리드의 남은 follow_up_at 은 뺀다).
  let leadFollowUpAt: string | null = null

  if (headerResult.status === "fulfilled") {
    if (parsed.source === "lead") {
      const lead = headerResult.value as LeadRecord | null
      if (lead) {
        header = buildLeadHeader(key, lead, now)
        contacts = buildLeadContacts(lead)
        origin = classifyLeadOrigin(lead.source, hasAdClickId(lead))
        leadStatus = lead.status
        found = true
        if (lead.status === "new" || lead.status === "contacted") leadFollowUpAt = lead.follow_up_at ?? null
      }
    } else {
      const detail = headerResult.value as NeoCrmCustomerDetail
      if (detail.ok && detail.account) {
        header = buildNeoHeader(key, detail, now)
        contacts = {
          phone: detail.account.phone,
          email: null,
          message: null,
          extra: [{ label: "고객 ID", value: detail.account.accountId }],
        }
        money = summarizeNeoMoney(detail)
        serviceRisk = deriveServiceRisk({
          hasNeoData: true,
          expireAt: nearestExpireAt(detail.eeoAccounts),
          balance: money.totalBalance,
          lastClassAt: latestLastClassAt(detail.eeoAccounts),
          // 만료·잔액 위험의 최신성은 account 메타가 아니라 실제 서비스(Shroff/EEO) 스냅샷 기준.
          syncedAt: latestEeoSyncedAt(detail.eeoAccounts) ?? detail.account.updatedAt,
          now,
        })
        found = true
      } else if (detail.error) {
        warnings.push(detail.error)
      }
    }
  } else {
    warnings.push("고객 기본 정보를 불러오지 못했습니다.")
  }

  // 자기 기록(조회 키 정확 일치). 리스크 신호는 이 값으로만 센다 — 리드 시절 기록은 과거라 현재 위험을 올리지 않는다.
  const ownActivity = eventsResult.status === "fulfilled" ? eventsResult.value : emptyEventsResult()
  if (eventsResult.status === "rejected") warnings.push("활동 기록을 불러오지 못했습니다.")

  // CT9 — 연결 리드 조회 실패는 경고(health) 대신 linkedLeads.down 으로 말한다(Compass·태그와 같은 additive 원칙).
  const linkedLeadIds =
    linkedLeadIdsResult.status === "fulfilled" ? linkedLeadIdsResult.value : { leadIds: [] as string[], truncated: false }
  let leadHistoryDown = linkedLeadIdsResult.status === "rejected"

  const tasks = tasksResult.status === "fulfilled" ? tasksResult.value : emptyTasksResult()
  if (tasksResult.status === "rejected") warnings.push("할 일을 불러오지 못했습니다.")

  const deals = dealsResult.status === "fulfilled" ? dealsResult.value : emptyDealsResult()
  if (dealsResult.status === "rejected") warnings.push("딜을 불러오지 못했습니다.")

  // NEO 등록 확정 링크 — 실패해도 드로어 전체를 막지 않고 미등록으로 폴백(경고만).
  const neoLink = neoLinkResult.status === "fulfilled" ? neoLinkResult.value : null
  if (neoLinkResult.status === "rejected") warnings.push("NEO 등록 여부를 확인하지 못했습니다.")

  // 수기 라벨 — 실패 시 경고 없이 빈 배열. (기존 드로어의 무음 폴백과 동일하게 두어
  // health.ok(warnings.length===0) 의미가 태그 실패로 바뀌지 않게 한다 — additive 필드 원칙.)
  const tags = tagsResult.status === "fulfilled" ? tagsResult.value : []

  const risk = computeCustomer360Risk({
    overdueTaskCount: tasks.summary.overdue,
    riskEventCount: ownActivity.summary.risks,
    nearestExpireAt: parsed.source === "neo" ? nearestExpireAt(money.eeoAccounts) : null,
    totalBalance: money.totalBalance,
    now,
  })

  // 제품 매출 요약 — 고객명(header.name)을 계정키로 REV/HW 원장에 조인. 비핵심이라 실패해도
  // 드로어 전체를 막지 않게 unmatched 폴백으로 흡수하고 경고만 남긴다.
  // Compass 활동은 전화 조인이라 contacts 가 정해진 뒤에야 갈 수 있다 — 같은 단계에서 병렬로 묶는다.
  // CT9 — 연락 로그 원본을 읽을 리드: 리드 360 은 자기, NEO 360 은 확정 연결 리드.
  const historyLeadIds = !found ? [] : parsed.source === "lead" ? [parsed.entityId] : linkedLeadIds.leadIds
  const [
    productSummaryResult,
    compassResult,
    lineItemsResult,
    contactLogsResult,
    linkedEventsResult,
    ownProbeResult,
  ] = await Promise.allSettled([
    found && header?.name
      ? getCrmAccountProductSummary(header.name)
      : Promise.resolve(EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY),
    found ? loadCompassActivity(contacts?.phone) : Promise.resolve(EMPTY_COMPASS),
    // M2·M4 — 품목별 대수·미매칭 출고 후보. neo 계정만 accountId를 넘긴다(리드는 조인 대상이
    // 아니라는 사실 자체를 note로 밝힌다 — crm-account-money.ts의 accountId===null 분기).
    found && header?.name
      ? getCrmMoneyLineItemsSummary({
          name: header.name,
          accountId: parsed.source === "neo" ? parsed.entityId : null,
        })
      : Promise.resolve(EMPTY_CRM_MONEY_LINE_ITEMS_SUMMARY),
    // CT9 — 연락 로그 원본(미러가 fail-soft 로 빠진 로그도 연락이다 — getCrmCustomerContactMaps 와 같은 규약).
    listLeadContactLogsForLeads(historyLeadIds, eventsLimit),
    // CT9 — 연결 리드 기록(리드 시절). NEO 360 만.
    parsed.source === "neo" && found
      ? loadLinkedLeadEvents(linkedLeadIds.leadIds, eventsLimit)
      : Promise.resolve(EMPTY_LINKED_LEAD_EVENTS),
    // CT9 — 자기 기록 창에 사람 연락이 없고 더 오래된 기록이 남았을 때만 최신 사람 연락 한 건.
    found && eventsResult.status === "fulfilled" && needsLatestContactProbe(ownActivity)
      ? probeLatestContact(parsed.targetType, parsed.entityId)
      : Promise.resolve([] as CrmCustomerEventRecord[]),
  ])

  let productSummary: CrmAccountProductSummary = EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY
  if (productSummaryResult.status === "fulfilled") {
    productSummary = productSummaryResult.value
  } else {
    warnings.push("제품 매출 요약을 불러오지 못했습니다.")
  }

  // Compass 조회 실패는 경고 대신 down 배지로 말한다 — 보조 원천 하나가
  // health.ok(=warnings 없음) 의미를 뒤집지 않게 한다(태그와 같은 additive 원칙).
  const compass: Customer360Compass =
    compassResult.status === "fulfilled" ? compassResult.value : { ...EMPTY_COMPASS, down: true }

  // 품목·미매칭 출고도 비핵심 additive 필드라 실패해도 경고만 남기고 빈 값으로 흡수한다
  // (태그·Compass와 같은 원칙 — 이 조회 하나가 health.ok를 뒤집지 않는다).
  if (lineItemsResult.status === "fulfilled") {
    money = {
      ...money,
      lineItems: lineItemsResult.value.lineItems,
      lineItemsMeta: lineItemsResult.value.lineItemsMeta,
      unmatchedOutbound: lineItemsResult.value.unmatchedOutbound,
    }
  } else {
    warnings.push("품목별 대수를 불러오지 못했습니다.")
  }

  // CT9 — 리드 시절·연락 로그 병합. 조회 실패는 빈 값 + leadHistoryDown(0건과 구분해 화면이 말한다).
  const contactLogs = contactLogsResult.status === "fulfilled" ? contactLogsResult.value : []
  const linkedEvents = linkedEventsResult.status === "fulfilled" ? linkedEventsResult.value : EMPTY_LINKED_LEAD_EVENTS
  const ownProbes = ownProbeResult.status === "fulfilled" ? ownProbeResult.value : []
  if (
    contactLogsResult.status === "rejected" ||
    linkedEventsResult.status === "rejected" ||
    ownProbeResult.status === "rejected"
  ) {
    leadHistoryDown = true
  }

  const merged = mergeLeadHistoryIntoActivity({
    customerSource: parsed.targetType,
    own: ownActivity,
    linkedEvents: linkedEvents.rows,
    linkedEventsTotal: linkedEvents.total,
    logs: contactLogs,
    limit: eventsLimit,
  })

  // 마지막 연락은 상한으로 자르기 전 원천 전부(자기 창 + 연결 리드 창 + 창 밖 최신 연락 probe +
  // 연락 로그 원본) + Compass 로 계산한다 — 화면 목록이 잘려도 최신 연락은 빠지지 않는다.
  const contactSummary = buildCustomerContactSummary({
    now,
    customerSource: parsed.targetType,
    events: [...ownActivity.rows, ...linkedEvents.rows, ...ownProbes, ...linkedEvents.probes],
    contactLogs: contactLogs.map((log) => ({
      type: log.type,
      contactedAt: log.contacted_at,
      contactedBy: log.contacted_by,
    })),
    compassEntries: compass.entries,
    compassDown: compass.down,
    leadHistoryDown,
    followUpAt: leadFollowUpAt,
    tasks: tasks.rows,
    compassNextActionAts: compass.nextActionAts,
  })

  const linkedLeads: Customer360LinkedLeads = {
    leadIds: linkedLeadIds.leadIds,
    truncated: linkedLeadIds.truncated,
    mergedCount: merged.mergedCount,
    down: leadHistoryDown,
  }

  return {
    generatedAt: now.toISOString(),
    key,
    source: parsed.targetType,
    entityId: parsed.entityId,
    found,
    health: { ok: warnings.length === 0, warnings },
    header,
    contacts,
    money,
    productSummary,
    origin,
    crmRegistered: Boolean(neoLink),
    neoAccountId: neoLink?.targetId ?? null,
    leadStatus,
    risk,
    serviceRisk,
    activity: merged.activity,
    linkedLeads,
    contactSummary,
    compass,
    tasks,
    deals,
    tags,
  }
}
