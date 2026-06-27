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
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"

export type CrmUnifiedCustomerSource = CrmPrioritySource
export type CrmUnifiedLifecycle = "new_lead" | "active_lead" | "account_risk" | "active_account" | "closed"
export type CrmUnifiedSavedView = "all" | "priority" | "new_leads" | "needs_care" | "my_owner"
export type CrmUnifiedSourceStatusKey = "classin_leads" | "external_crm" | "sheets"

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
}

export interface CrmUnifiedCustomersOptions {
  q?: string
  source?: CrmUnifiedCustomerSource | "all"
  lifecycle?: CrmUnifiedLifecycle | "all"
  view?: CrmUnifiedSavedView
  owner?: string
  ownerKeys?: string[]
  limit?: number
  offset?: number
  now?: Date
}

export interface CrmUnifiedCustomers {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
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
    highPriorityCount: number
    ownerCount: number
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

function matchesSavedView(row: CrmUnifiedCustomerRow, view: CrmUnifiedSavedView, ownerKeys: Set<string>) {
  if (view === "all") return true
  if (view === "priority") return row.score >= 68
  if (view === "new_leads") return row.lifecycle === "new_lead"
  if (view === "needs_care") return row.source === "neo_account" && row.lifecycle === "account_risk"
  if (view === "my_owner") return ownerKeys.size > 0 && rowMatchesOwner(row, ownerKeys)
  return true
}

export async function getCrmUnifiedCustomers(
  options: CrmUnifiedCustomersOptions = {}
): Promise<CrmUnifiedCustomers> {
  const now = options.now ?? new Date()
  const warnings: string[] = []
  let leadsOk = true
  let neoAccountsOk = true
  const rows: CrmUnifiedCustomerRow[] = []

  const [leadResult, neoResult] = await Promise.allSettled([getLeads(), getNeoCrmCustomers()])

  if (leadResult.status === "fulfilled") {
    for (const lead of leadResult.value) {
      const priority = buildLeadPriorityItem(lead, now)
      rows.push({
        key: `lead:${lead.id}`,
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
      })
    }

    if (neoResult.value.syncHealth.isShroffAccountStale) {
      warnings.push("외부 CRM 고객 동기화가 최신 상태가 아니어서 잔액·만료일·최근 수업 정보가 일부 누락될 수 있습니다.")
    }
  } else {
    neoAccountsOk = false
    warnings.push("외부 CRM 고객 동기화 목록을 불러오지 못했습니다.")
  }

  const query = normalize(options.q)
  const ownerKeys = new Set(uniqueOwnerKeys([options.owner, ...(options.ownerKeys ?? [])]))
  const source = options.source ?? "all"
  const lifecycle = options.lifecycle ?? "all"
  const view = options.view ?? "all"

  const filtered = rows.filter((row) => {
    if (source !== "all" && row.source !== source) return false
    if (lifecycle !== "all" && row.lifecycle !== lifecycle) return false
    if (!rowMatchesOwner(row, ownerKeys)) return false
    if (!matchesSavedView(row, view, ownerKeys)) return false
    if (!includesQuery(row, query)) return false
    return true
  })

  const sortedKeys = new Map(sortPriorityItems(filtered.map((row) => {
    const bucket = sortBucketForRow(row)
    return {
      id: row.key,
      source: row.source,
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
    sources: { leadsOk, neoAccountsOk, warnings, statuses: sourceStatuses },
    summary: {
      total: filtered.length,
      leadCount: filtered.filter((row) => row.source === "lead").length,
      accountCount: filtered.filter((row) => row.source === "neo_account").length,
      highPriorityCount: filtered.filter((row) => row.score >= 68).length,
      ownerCount: owners.length,
    },
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
