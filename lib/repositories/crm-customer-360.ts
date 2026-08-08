import "server-only"

import {
  getNeoCrmCustomerDetail,
  type NeoCrmCustomerDetail,
  type NeoCrmCustomerEeoAccount,
  type NeoCrmCustomerMoneyItem,
} from "@/lib/admin-crm-customers-neo"
import { classifyLeadOrigin, type LeadOriginClass } from "@/lib/crm/capture/origin"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import { buildLeadPriorityItem } from "@/lib/crm/priority"
import {
  EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY,
  getCrmAccountProductSummary,
  type CrmAccountProductSummary,
} from "@/lib/repositories/crm-account-money"
import { deriveServiceRisk, type ServiceRisk } from "@/lib/crm/service-risk"
import { getCustomerTags } from "@/lib/repositories/crm-customer-tags"
import { listCrmCustomerEvents, type ListCrmCustomerEventsResult } from "@/lib/repositories/crm-events"
import { findConfirmedLeadNeoLink } from "@/lib/repositories/crm-source-links"
import { listCrmDeals, type ListCrmDealsResult } from "@/lib/repositories/crm-deals"
import { listCrmTasks, type ListCrmTasksResult } from "@/lib/repositories/crm-tasks"
import { getLeadById, type LeadRecord } from "@/lib/repositories/leads"

export type Customer360Source = "lead" | "neo_account"
export type Customer360Severity = "critical" | "high" | "medium" | "low"

const DAY_MS = 24 * 60 * 60 * 1000

export interface ParsedCustomerKey {
  source: "lead" | "neo"
  entityId: string
  targetType: Customer360Source
}

// unified 행 key는 `lead:{id}` 또는 `neo:{accountId}`. accountId에 ':'가 있을 수 있어 첫 ':'에서만 분리한다.
export function parseUnifiedCustomerKey(key: string | null | undefined): ParsedCustomerKey | null {
  if (!key) return null
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
}

export interface Customer360Risk {
  severity: Customer360Severity
  reasons: string[]
  overdueTaskCount: number
  riskEventCount: number
  nearestExpireAt: string | null
  totalBalance: number | null
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
  /** 확정된 NEO 계정 id (crmRegistered=true일 때만, 그 외 null) */
  neoAccountId: string | null
  risk: Customer360Risk
  serviceRisk: ServiceRisk | null
  activity: ListCrmCustomerEventsResult
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
  }
}

export function buildNeoHeader(key: string, detail: NeoCrmCustomerDetail, now = new Date()): Customer360Header {
  const account = detail.account
  const expiringSoon = detail.eeoAccounts.some((eeo) => {
    if (!eeo.expireAt) return false
    const time = new Date(eeo.expireAt).getTime()
    if (Number.isNaN(time)) return false
    return time - now.getTime() <= 30 * DAY_MS
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

const EMPTY_MONEY: Customer360Money = {
  available: false,
  label: null,
  totalBalance: null,
  totalOrderAmount: null,
  orders: [],
  collections: [],
  performances: [],
  eeoAccounts: [],
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

  const [headerResult, eventsResult, tasksResult, dealsResult, neoLinkResult, tagsResult] = await Promise.allSettled([
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
  ])

  let header: Customer360Header | null = null
  let contacts: Customer360Contacts | null = null
  let money: Customer360Money = EMPTY_MONEY
  let serviceRisk: ServiceRisk | null = null
  let found = false
  let origin: LeadOriginClass | null = null

  if (headerResult.status === "fulfilled") {
    if (parsed.source === "lead") {
      const lead = headerResult.value as LeadRecord | null
      if (lead) {
        header = buildLeadHeader(key, lead, now)
        contacts = buildLeadContacts(lead)
        origin = classifyLeadOrigin(
          lead.source,
          Boolean(lead.gclid || lead.fbclid || lead.msclkid || lead.ttclid)
        )
        found = true
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

  const activity = eventsResult.status === "fulfilled" ? eventsResult.value : emptyEventsResult()
  if (eventsResult.status === "rejected") warnings.push("활동 기록을 불러오지 못했습니다.")

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
    riskEventCount: activity.summary.risks,
    nearestExpireAt: parsed.source === "neo" ? nearestExpireAt(money.eeoAccounts) : null,
    totalBalance: money.totalBalance,
    now,
  })

  // 제품 매출 요약 — 고객명(header.name)을 계정키로 REV/HW 원장에 조인. 비핵심이라 실패해도
  // 드로어 전체를 막지 않게 unmatched 폴백으로 흡수하고 경고만 남긴다.
  let productSummary: CrmAccountProductSummary = EMPTY_CRM_ACCOUNT_PRODUCT_SUMMARY
  if (found && header?.name) {
    try {
      productSummary = await getCrmAccountProductSummary(header.name)
    } catch {
      warnings.push("제품 매출 요약을 불러오지 못했습니다.")
    }
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
    risk,
    serviceRisk,
    activity,
    tasks,
    deals,
    tags,
  }
}
