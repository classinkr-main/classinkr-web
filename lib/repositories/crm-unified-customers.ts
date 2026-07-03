import "server-only"

import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import {
  CRM_PRIORITY_BUCKET_LABELS,
  buildLeadPriorityItem,
  buildNeoAccountPriorityItem,
  sortPriorityItems,
  type CrmPriorityBucket,
  type CrmPriorityItem,
  type CrmPrioritySource,
} from "@/lib/crm/priority"
import { listAllCustomerListItemsLite } from "@/lib/portal/repositories/customers"
import type { CustomerListItem } from "@/lib/portal/types"
import { listConfirmedLeadCustomerLinks } from "@/lib/repositories/crm-source-links"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { computeCustomerHealth, type CustomerHealthBand } from "@/lib/crm/customer-health"
import { getAllCustomerTagsMap } from "./crm-customer-tags"

// "customer" = 리드 전환(convert-v2)이 만드는 portal customers 테이블의 앱 고객.
export type CrmUnifiedCustomerSource = CrmPrioritySource | "customer"
export type CrmUnifiedLifecycle = "new_lead" | "active_lead" | "account_risk" | "active_account" | "closed"
export type CrmUnifiedSavedView =
  | "all"
  | "priority"
  | "new_leads"
  | "needs_care"
  | "my_owner"
  | "expiring"
  | "dormant"
  | "hot_lead"
  | "upsell"

// 칩 카운트를 보여줄 세그먼트(저장 뷰).
export const CRM_SEGMENT_VIEWS = ["expiring", "dormant", "hot_lead", "upsell"] as const
export type CrmUnifiedSourceStatusKey = "classin_leads" | "app_customers" | "external_crm" | "sheets"

export interface CrmUnifiedCustomerRow {
  key: string
  source: CrmUnifiedCustomerSource
  sourceLabel: string
  name: string
  contact: string | null
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
}

// 활성 고객(neo_account) 건강도 분포 — computeCustomerHealth(SSOT)로 매핑한 실집계.
export interface CrmHealthDistribution {
  total: number
  safe: number
  watch: number
  risk: number
}

export interface CrmUnifiedCustomersOptions {
  q?: string
  source?: CrmUnifiedCustomerSource | "all"
  lifecycle?: CrmUnifiedLifecycle | "all"
  view?: CrmUnifiedSavedView
  owner?: string
  ownerKeys?: string[]
  tag?: string
  limit?: number
  offset?: number
  now?: Date
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

function formatKRW(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (!amount) return null
  return `${Math.round(amount).toLocaleString("ko-KR")}원`
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

function defaultLeadAction(lead: LeadRecord) {
  if (lead.status === "new") return "첫 응답"
  if (lead.status === "contacted") return "팔로업"
  return "기록 확인"
}

function accountLifecycle(priority: CrmPriorityItem | null): CrmUnifiedLifecycle {
  return priority && priority.score >= 42 ? "account_risk" : "active_account"
}

// 리드 전환 산출물(portal customers) → 통합 행. 거래 요약(customer_deal_summary)이 있으면
// 미수·진행 딜 신호로 다음 액션과 점수를 보수적으로 잡는다(우선순위 엔진 미적용 소스).
function buildPortalCustomerRow(item: CustomerListItem): CrmUnifiedCustomerRow {
  const { customer, summary } = item
  const outstanding = summary?.outstanding_amount ?? 0
  const activeDeals = summary?.active_deals ?? 0
  const contractedLabel = formatKRW(summary?.contracted_amount)
  const outstandingLabel = formatKRW(outstanding)
  return {
    key: `customer:${customer.id}`,
    tags: [],
    source: "customer",
    sourceLabel: "전환 고객",
    name: [customer.name, customer.campus_name].filter(Boolean).join(" · "),
    contact: customer.phone ?? customer.email ?? customer.contact_name,
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
    moneyLabel:
      contractedLabel && outstandingLabel
        ? `계약 ${contractedLabel} · 미수 ${outstandingLabel}`
        : contractedLabel
          ? `계약 ${contractedLabel}`
          : outstandingLabel
            ? `미수 ${outstandingLabel}`
            : null,
    href: `/admin/crm/deals/kpi/${encodeURIComponent(customer.partner_account_id)}`,
    updatedAt: summary?.last_deal_updated_at ?? customer.updated_at ?? customer.created_at,
    expireAt: null,
    balance: null,
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
  const haystack = [row.name, row.contact, row.ownerName, row.statusLabel, row.priorityReason]
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

function sortBucketForRow(row: CrmUnifiedCustomerRow): CrmPriorityBucket {
  if (row.source === "lead" && row.score >= 42) return "today"
  if (row.source === "neo_account" && row.nextActionLabel.includes("연장")) return "renewal"
  if (row.source === "neo_account" && row.nextActionLabel.includes("장기")) return "stale_recovery"
  return "watch"
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(Math.floor(numeric), max))
}

function rowMatchesOwner(row: CrmUnifiedCustomerRow, ownerKeys: Set<string>) {
  if (ownerKeys.size === 0) return true
  return row.ownerKeys.some((key) => ownerKeys.has(key))
}

function daysUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return (time - nowMs) / 86_400_000
}

// 우선순위 점수 → 리스크 등급(목록 severity와 동일 임계). 건강도 입력으로 사용.
function severityFromScore(score: number): "critical" | "high" | "medium" | "low" {
  return score >= 85 ? "critical" : score >= 68 ? "high" : score >= 42 ? "medium" : "low"
}

// 활성 고객(neo_account) 행 → 건강도 밴드. score·만료·잔액·라이프사이클 신호를 SSOT 산식에 투입.
function rowHealthBand(row: CrmUnifiedCustomerRow, nowMs: number): CustomerHealthBand {
  return computeCustomerHealth({
    riskSeverity: severityFromScore(row.score),
    serviceLevel: row.lifecycle === "account_risk" ? "soon" : "normal",
    hasOutstanding: (row.balance ?? 0) > 0,
    daysToExpire: daysUntil(row.expireAt, nowMs),
    lastContactDays: null,
  }).band
}

function matchesSavedView(
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
  return true
}

export async function getCrmUnifiedCustomers(
  options: CrmUnifiedCustomersOptions = {}
): Promise<CrmUnifiedCustomers> {
  const now = options.now ?? new Date()
  const warnings: string[] = []
  let leadsOk = true
  let neoAccountsOk = true
  let portalCustomersOk = true
  let rows: CrmUnifiedCustomerRow[] = []

  const [leadResult, neoResult, portalCustomersResult, convertedLinksResult] = await Promise.allSettled([
    getLeads(),
    getNeoCrmCustomers(),
    listAllCustomerListItemsLite(),
    listConfirmedLeadCustomerLinks(),
  ])

  if (leadResult.status === "fulfilled") {
    for (const lead of leadResult.value) {
      const priority = buildLeadPriorityItem(lead, now)
      rows.push({
        key: `lead:${lead.id}`,
        tags: [],
        source: "lead",
        sourceLabel: "리드",
        name: leadName(lead),
        contact: lead.phone ?? lead.email ?? lead.source,
        ownerName: lead.assigned_to ?? null,
        ownerKeys: uniqueOwnerKeys([lead.assigned_to]),
        lifecycle: leadLifecycle(lead),
        statusLabel: leadStatusLabel(lead),
        nextActionLabel: priority?.actionLabel ?? defaultLeadAction(lead),
        priorityReason: priority?.reason ?? "리드 상태 확인",
        score: priority?.score ?? (lead.status === "new" ? 40 : 20),
        moneyLabel: null,
        href: `/admin/crm/customers/leads?lead=${encodeURIComponent(lead.id)}`,
        updatedAt: lead.follow_up_at ?? lead.timestamp,
        expireAt: null,
        balance: null,
      })
    }
  } else {
    leadsOk = false
    warnings.push("리드 목록을 불러오지 못했습니다.")
  }

  if (neoResult.status === "fulfilled" && neoResult.value.ok) {
    for (const account of neoResult.value.rows) {
      const priority = buildNeoAccountPriorityItem(account, now)
      const balanceLabel = formatCNY(account.balance)
      const orderLabel = formatUSD(account.orderAmount)
      rows.push({
        key: `neo:${account.accountId}`,
        tags: [],
        source: "neo_account",
        sourceLabel: "고객",
        name: account.name,
        contact: account.phone ?? account.uid ?? account.accountId,
        ownerName: account.ownerName,
        ownerKeys: uniqueOwnerKeys([account.ownerName, account.ownerId]),
        lifecycle: accountLifecycle(priority),
        statusLabel: priority ? "관리 필요" : "활성 고객",
        nextActionLabel: priority?.actionLabel ?? "관계 유지",
        priorityReason: priority?.reason ?? "최근 고객 상태 정상",
        score: priority?.score ?? 10,
        moneyLabel:
          balanceLabel && orderLabel
            ? `잔액 ${balanceLabel} · 오더 ${orderLabel}`
            : balanceLabel
              ? `잔액 ${balanceLabel}`
              : orderLabel
                ? `오더 ${orderLabel}`
                : null,
        href: `/admin/crm/customers/accounts?account=${encodeURIComponent(account.accountId)}`,
        updatedAt: account.updatedAt ?? account.lastClassAt ?? account.expireAt,
        expireAt: account.expireAt ?? null,
        balance: account.balance ?? null,
      })
    }

    if (neoResult.value.syncHealth.isShroffAccountStale) {
      warnings.push("외부 CRM 고객 동기화가 최신 상태가 아니어서 잔액·만료일·최근 수업 정보가 일부 누락될 수 있습니다.")
    }
  } else {
    neoAccountsOk = false
    warnings.push("외부 CRM 고객 동기화 목록을 불러오지 못했습니다.")
  }

  if (portalCustomersResult.status === "fulfilled") {
    for (const item of portalCustomersResult.value) {
      rows.push(buildPortalCustomerRow(item))
    }
  } else {
    portalCustomersOk = false
    warnings.push("리드 전환 고객(앱 고객 DB) 목록을 불러오지 못했습니다.")
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
      if (customerRow.statusLabel === "전환 고객") customerRow.statusLabel = "리드 전환 완료"
      return false
    })
  }

  // 수기 라벨 — 소규모 태그 테이블을 한 번 읽어 행에 부착(없으면 graceful 빈 맵).
  const tagsMap = await getAllCustomerTagsMap().catch(() => ({}) as Record<string, string[]>)
  for (const row of rows) {
    const idPart = row.key.slice(row.key.indexOf(":") + 1)
    row.tags = tagsMap[`${row.source}:${idPart}`] ?? []
  }
  const availableTags = Array.from(new Set(Object.values(tagsMap).flat())).sort((a, b) => a.localeCompare(b, "ko"))
  const tagFilter = (options.tag ?? "").trim()

  const query = normalize(options.q)
  const ownerKeys = new Set(uniqueOwnerKeys([options.owner, ...(options.ownerKeys ?? [])]))
  const source = options.source ?? "all"
  const lifecycle = options.lifecycle ?? "all"
  const view = options.view ?? "all"

  const nowMs = now.getTime()
  const baseRows = rows.filter((row) => {
    if (source !== "all" && row.source !== source) return false
    if (lifecycle !== "all" && row.lifecycle !== lifecycle) return false
    if (tagFilter && !row.tags.includes(tagFilter)) return false
    if (!rowMatchesOwner(row, ownerKeys)) return false
    if (!includesQuery(row, query)) return false
    return true
  })
  const filtered = baseRows.filter((row) => matchesSavedView(row, view, ownerKeys, nowMs))
  // 세그먼트 칩 카운트 — 현재 검색/담당 범위 안에서 각 세그먼트에 몇 건이 들어오는지.
  const viewCounts = Object.fromEntries(
    CRM_SEGMENT_VIEWS.map((segment) => [
      segment,
      baseRows.filter((row) => matchesSavedView(row, segment, ownerKeys, nowMs)).length,
    ])
  )

  const sortedKeys = new Map(sortPriorityItems(filtered.map((row) => {
    const bucket = sortBucketForRow(row)
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
      bucket,
      bucketLabel: CRM_PRIORITY_BUCKET_LABELS[bucket],
      action: row.source === "lead" ? "follow_up_lead" : "watch_account",
      actionLabel: row.nextActionLabel,
      reason: row.priorityReason,
      href: row.href,
      dueAt: row.updatedAt,
      updatedAt: row.updatedAt,
    }
  })).map((item, index) => [item.id, index]))

  const sorted = [...filtered].sort((a, b) => {
    const aIndex = sortedKeys.get(a.key) ?? Number.MAX_SAFE_INTEGER
    const bIndex = sortedKeys.get(b.key) ?? Number.MAX_SAFE_INTEGER
    return aIndex - bIndex
  })
  // 활성 고객 건강도 분포 — 전역(필터 무관). 코크핏 도넛이 읽는 단일 진실원.
  const healthDistribution = rows.reduce<CrmHealthDistribution>(
    (acc, row) => {
      if (row.source !== "neo_account") return acc
      acc.total += 1
      acc[rowHealthBand(row, nowMs)] += 1
      return acc
    },
    { total: 0, safe: 0, watch: 0, risk: 0 }
  )

  const limit = clampInteger(options.limit, 100, 1, 200)
  const offset = clampInteger(options.offset, 0, 0, 100_000)
  const owners = buildOwnerOptions(rows)
  const pageRows = sorted.slice(offset, offset + limit)
  const nextOffset = offset + pageRows.length
  const neoLatestSyncedAt =
    neoResult.status === "fulfilled" && neoResult.value.ok ? neoResult.value.latestSyncedAt : null
  const neoPartial =
    neoResult.status === "fulfilled" && neoResult.value.ok
      ? neoResult.value.syncHealth.isShroffAccountStale
      : !neoAccountsOk
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
      total: filtered.length,
      leadCount: filtered.filter((row) => row.source === "lead").length,
      accountCount: filtered.filter((row) => row.source === "neo_account").length,
      customerCount: filtered.filter((row) => row.source === "customer").length,
      highPriorityCount: filtered.filter((row) => row.score >= 68).length,
      ownerCount: owners.length,
      viewCounts,
      availableTags,
    },
    healthDistribution,
    pagination: {
      limit,
      offset,
      returned: pageRows.length,
      total: filtered.length,
      hasMore: nextOffset < filtered.length,
      nextOffset: nextOffset < filtered.length ? nextOffset : null,
    },
    owners,
    rows: pageRows,
  }
}
