import "server-only"

import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import {
  buildLeadPriorityItem,
  buildNeoAccountPriorityItem,
  CRM_PRIORITY_BUCKET_LABELS,
  sortPriorityItems,
  type CrmPriorityBucket,
  type CrmPriorityItem,
  type CrmPrioritySource,
} from "@/lib/crm/priority"
import { getLeads } from "@/lib/repositories/leads"

export interface CrmPriorityQueueOptions {
  limit?: number
  owner?: string
  source?: CrmPrioritySource | "all"
  bucket?: CrmPriorityBucket | "all"
  now?: Date
}

export interface CrmPriorityQueue {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    warnings: string[]
  }
  summary: {
    total: number
    critical: number
    high: number
    leadCount: number
    neoAccountCount: number
    ownerCount: number
    bucketCounts: Record<CrmPriorityBucket, number>
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

function normalizeOwner(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

function applyFilters(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  const owner = normalizeOwner(options.owner)
  const source = options.source ?? "all"
  const bucket = options.bucket ?? "all"

  return items.filter((item) => {
    if (source !== "all" && item.source !== source) return false
    if (owner && normalizeOwner(item.ownerName) !== owner) return false
    if (bucket !== "all" && item.bucket !== bucket) return false
    return true
  })
}

function applyBaseFilters(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  return applyFilters(items, { ...options, bucket: "all" })
}

function buildBucketCounts(items: CrmPriorityItem[]) {
  const counts: Record<CrmPriorityBucket, number> = {
    today: 0,
    renewal: 0,
    stale_recovery: 0,
    watch: 0,
  }
  for (const item of items) counts[item.bucket] += 1
  return counts
}

function buildBucketOptions(counts: Record<CrmPriorityBucket, number>) {
  return (Object.keys(CRM_PRIORITY_BUCKET_LABELS) as CrmPriorityBucket[]).map((bucket) => ({
    bucket,
    label: CRM_PRIORITY_BUCKET_LABELS[bucket],
    count: counts[bucket],
  }))
}

function buildOwnerOptions(items: CrmPriorityItem[]) {
  const counts = new Map<string, number>()
  for (const item of items) {
    if (!item.ownerName) continue
    counts.set(item.ownerName, (counts.get(item.ownerName) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([ownerName, count]) => ({ ownerName, count }))
    .sort((a, b) => b.count - a.count || a.ownerName.localeCompare(b.ownerName, "ko"))
}

export async function getCrmPriorityQueue(
  options: CrmPriorityQueueOptions = {}
): Promise<CrmPriorityQueue> {
  const now = options.now ?? new Date()
  const warnings: string[] = []
  let leadsOk = true
  let neoAccountsOk = true

  const [leadResult, neoResult] = await Promise.allSettled([getLeads(), getNeoCrmCustomers()])

  const items: CrmPriorityItem[] = []

  if (leadResult.status === "fulfilled") {
    for (const lead of leadResult.value) {
      const item = buildLeadPriorityItem(lead, now)
      if (item) items.push(item)
    }
  } else {
    leadsOk = false
    warnings.push("리드 우선순위를 불러오지 못했습니다.")
  }

  if (neoResult.status === "fulfilled" && neoResult.value.ok) {
    for (const account of neoResult.value.rows) {
      const item = buildNeoAccountPriorityItem(account, now)
      if (item) items.push(item)
    }
  } else {
    neoAccountsOk = false
    warnings.push("동기화 고객 참고 데이터를 불러오지 못했습니다.")
  }

  const sorted = sortPriorityItems(items)
  const baseFiltered = applyBaseFilters(sorted, options)
  const filtered = applyFilters(sorted, options)
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50))
  const visible = filtered.slice(0, limit)
  const owners = buildOwnerOptions(sorted)
  const bucketCounts = buildBucketCounts(baseFiltered)

  return {
    generatedAt: now.toISOString(),
    sources: { leadsOk, neoAccountsOk, warnings },
    summary: {
      total: filtered.length,
      critical: filtered.filter((item) => item.severity === "critical").length,
      high: filtered.filter((item) => item.severity === "high").length,
      leadCount: filtered.filter((item) => item.source === "lead").length,
      neoAccountCount: filtered.filter((item) => item.source === "neo_account").length,
      ownerCount: owners.length,
      bucketCounts,
    },
    buckets: buildBucketOptions(bucketCounts),
    owners,
    items: visible,
  }
}
