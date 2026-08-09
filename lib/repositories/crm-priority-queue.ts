import "server-only"

import { getNeoCrmCustomers } from "@/lib/admin-crm-customers-neo"
import {
  buildLeadPriorityItem,
  buildNeoAccountPriorityItem,
  buildTaskPriorityItem,
  CRM_PRIORITY_BUCKET_LABELS,
  CRM_PRIORITY_LANE_LABELS,
  sortPriorityItems,
  type CrmPriorityBucket,
  type CrmPriorityItem,
  type CrmPriorityLane,
  type CrmPrioritySource,
  type CrmPriorityTier,
} from "@/lib/crm/priority"
import { getLeads } from "@/lib/repositories/leads"
import {
  crmContactTargetKey,
  getCrmCustomerContactMaps,
} from "@/lib/repositories/crm-events"
import { listCrmTasks, type CrmTaskRecord } from "@/lib/repositories/crm-tasks"
import { getLeadsActivitySummary } from "@/lib/repositories/lead-activity"
import { getShowroomCalendarEvents } from "@/lib/showroom-ics-calendar"
import { buildDemoSignalIndex } from "@/lib/crm/demo-signal"

/**
 * "customer" 는 리드 + ClassIn 고객을 한 묶음으로 보는 가상 소스다.
 * 현황 홈의 [고객 운영 우선순위]가 할 일과 경쟁하지 않게 하려고 둔다.
 */
export type CrmPriorityQueueSource = CrmPrioritySource | "customer" | "all"

export interface CrmPriorityQueueOptions {
  limit?: number
  owner?: string
  ownerKeys?: string[]
  source?: CrmPriorityQueueSource
  lane?: CrmPriorityLane | "all"
  bucket?: CrmPriorityBucket | "all"
  now?: Date
}

export interface CrmPriorityQueue {
  generatedAt: string
  sources: {
    leadsOk: boolean
    neoAccountsOk: boolean
    tasksOk: boolean
    warnings: string[]
  }
  summary: {
    total: number
    critical: number
    high: number
    leadCount: number
    neoAccountCount: number
    taskCount: number
    ownerCount: number
    bucketCounts: Record<CrmPriorityBucket, number>
    /** 현재 소스·담당·레인 범위(시점 필터 제외)의 티어 분포 — 티어 탭·요약 배지 기준. */
    tierCounts: Record<CrmPriorityTier, number>
    laneTotals: Record<CrmPriorityLane, number>
    /** 현재 소스·담당·레인 범위에서 시점 필터와 무관한 긴급 후보 수. */
    laneCritical: number
    /**
     * 소스 필터를 걷어낸 건수(담당자 필터는 유지). 목록에서 할 일을 분리해 놓고도
     * "할 일 N건"을 정직하게 표시하려면 현재 뷰가 아니라 전체 기준이 필요하다.
     */
    sourceTotals: { lead: number; neoAccount: number; task: number }
    /**
     * 쇼룸 캘린더 데모 현황. unmatched 는 일정은 있는데 고객을 못 붙인 건수다 —
     * 제목이 자유 텍스트라 전수 매칭이 안 되므로, 조용히 버리지 않고 화면에 노출한다.
     */
    demo: { total: number; matched: number; unmatched: number }
  }
  buckets: Array<{ bucket: CrmPriorityBucket; label: string; count: number }>
  lanes: Array<{ lane: CrmPriorityLane; label: string; count: number }>
  owners: Array<{ ownerName: string; count: number }>
  items: CrmPriorityItem[]
}

function normalizeOwner(value: string | null | undefined) {
  return value?.trim().toLowerCase() || ""
}

function buildOwnerFilter(options: CrmPriorityQueueOptions) {
  return new Set([options.owner, ...(options.ownerKeys ?? [])].map(normalizeOwner).filter(Boolean))
}

function applyFilters(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  const ownerKeys = buildOwnerFilter(options)
  const source = options.source ?? "all"
  const lane = options.lane ?? "all"
  const bucket = options.bucket ?? "all"

  return items.filter((item) => {
    if (source === "customer") {
      if (item.source !== "lead" && item.source !== "neo_account") return false
    } else if (source !== "all" && item.source !== source) return false
    if (ownerKeys.size > 0 && !item.ownerKeys.some((key) => ownerKeys.has(key))) return false
    if (lane !== "all" && item.lane !== lane) return false
    if (bucket !== "all" && item.bucket !== bucket) return false
    return true
  })
}

/** 담당자 필터만 적용 — 소스별 총량을 정직하게 세기 위한 기준선. */
function applyOwnerFilter(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  return applyFilters(items, { ...options, source: "all", lane: "all", bucket: "all" })
}

function applyBaseFilters(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  return applyFilters(items, { ...options, bucket: "all" })
}

/** 현재 소스·담당 범위에서 레인 선택만 걷어낸 총량. 레인 탭 카운트 기준이다. */
function applyLaneBaseFilters(items: CrmPriorityItem[], options: CrmPriorityQueueOptions) {
  return applyFilters(items, { ...options, lane: "all", bucket: "all" })
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

function buildTierCounts(items: CrmPriorityItem[]) {
  const counts: Record<CrmPriorityTier, number> = { p0: 0, p1: 0, p2: 0, p3: 0 }
  for (const item of items) counts[item.tier] += 1
  return counts
}

/**
 * 계정(neo_account) 대상 열린(open/snoozed) 할 일의 target_id별 가장 이른 due_at.
 * 엔진의 자체 예정 작업 축(AccountOwnSignals.openTaskDueAt) 입력이다.
 * 통합 목록(crm-unified-customers)도 같은 함수를 써서 화면 간 티어가 갈리지 않게 한다.
 */
export function buildAccountOpenTaskDueMap(tasks: CrmTaskRecord[]) {
  const map = new Map<string, string>()
  for (const task of tasks) {
    if (task.targetType !== "neo_account" || !task.targetId) continue
    if (task.status !== "open" && task.status !== "snoozed") continue
    if (!task.dueAt) continue
    const current = map.get(task.targetId)
    if (!current || task.dueAt < current) map.set(task.targetId, task.dueAt)
  }
  return map
}

function buildBucketOptions(counts: Record<CrmPriorityBucket, number>) {
  return (Object.keys(CRM_PRIORITY_BUCKET_LABELS) as CrmPriorityBucket[]).map((bucket) => ({
    bucket,
    label: CRM_PRIORITY_BUCKET_LABELS[bucket],
    count: counts[bucket],
  }))
}

function buildLaneCounts(items: CrmPriorityItem[]) {
  const counts: Record<CrmPriorityLane, number> = {
    sales: 0,
    renewal: 0,
    customer_care: 0,
  }
  for (const item of items) counts[item.lane] += 1
  return counts
}

function buildLaneOptions(counts: Record<CrmPriorityLane, number>) {
  return (Object.keys(CRM_PRIORITY_LANE_LABELS) as CrmPriorityLane[]).map((lane) => ({
    lane,
    label: CRM_PRIORITY_LANE_LABELS[lane],
    count: counts[lane],
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
  let tasksOk = true

  const [leadResult, neoResult, taskResult, engagementResult, demoResult, contactMapsResult] =
    await Promise.allSettled([
      getLeads(),
      getNeoCrmCustomers(),
      listCrmTasks({ status: "active", limit: 200, now }),
      getLeadsActivitySummary(),
      getShowroomCalendarEvents(),
      // 자체 컨택 신호 — 20페이지 초과 시 throw하는 함수라 반드시 allSettled로 감싼다.
      getCrmCustomerContactMaps(),
    ])

  const items: CrmPriorityItem[] = []
  // 참여 신호는 우선순위를 더 정확하게 만들 뿐 없어도 큐는 서야 한다 —
  // 실패하면 반응 축만 조용히 빠지고 경고도 띄우지 않는다(보조 지표).
  const engagements = engagementResult.status === "fulfilled" ? engagementResult.value : null
  // 데모 일정도 마찬가지 — 캘린더가 죽어도 큐는 선다.
  const demoIndex = buildDemoSignalIndex(
    demoResult.status === "fulfilled" ? demoResult.value : [],
    now
  )
  // 자체 컨택 기록도 보조 신호 규약 — 실패하면 자체 신호 축만 조용히 빠진다(경고 없음).
  // 통합 목록(crm-unified-customers)과 동일 규약·동일 키로 주입해 화면 간 점수가 갈리지 않게 한다.
  const latestContactMap =
    contactMapsResult.status === "fulfilled"
      ? contactMapsResult.value.latestContactByTarget
      : new Map<string, string>()
  // 계정 열린 할 일 — 이미 로드한 활성 할 일 배열에서 계정별 가장 이른 due를 뽑는다.
  const accountTaskDueMap =
    taskResult.status === "fulfilled" && taskResult.value.health.ok
      ? buildAccountOpenTaskDueMap(taskResult.value.rows)
      : new Map<string, string>()

  if (leadResult.status === "fulfilled") {
    for (const lead of leadResult.value) {
      const item = buildLeadPriorityItem(lead, now, {
        engagement: engagements?.[lead.id] ?? null,
        demoIndex,
      })
      if (item) items.push(item)
    }
  } else {
    leadsOk = false
    warnings.push("리드 우선순위를 불러오지 못했습니다.")
  }

  if (neoResult.status === "fulfilled" && neoResult.value.ok) {
    for (const account of neoResult.value.rows) {
      const item = buildNeoAccountPriorityItem(account, now, {
        demoIndex,
        ownSignals: {
          lastContactAt:
            latestContactMap.get(crmContactTargetKey("neo_account", account.accountId)) ?? null,
          openTaskDueAt: accountTaskDueMap.get(account.accountId) ?? null,
        },
      })
      if (item) items.push(item)
    }
    // NEO 스냅샷 신선도 — 잔액·만료일이 오래된 채 티어를 매길 수 있으므로 화면에 알린다
    // (통합 목록과 같은 문구).
    if (neoResult.value.syncHealth.isShroffAccountStale) {
      warnings.push(
        "외부 CRM 고객 동기화가 최신 상태가 아니어서 잔액·만료일·최근 수업 정보가 일부 누락될 수 있습니다."
      )
    }
  } else {
    neoAccountsOk = false
    warnings.push("동기화 고객 참고 데이터를 불러오지 못했습니다.")
  }

  if (taskResult.status === "fulfilled" && taskResult.value.health.ok) {
    for (const task of taskResult.value.rows) {
      const item = buildTaskPriorityItem(task, now)
      if (item) items.push(item)
    }
  } else {
    tasksOk = false
    warnings.push("CRM 할 일을 불러오지 못했습니다.")
  }

  const sorted = sortPriorityItems(items)
  const baseFiltered = applyBaseFilters(sorted, options)
  const filtered = applyFilters(sorted, options)
  const ownerScoped = applyOwnerFilter(sorted, options)
  const laneBaseFiltered = applyLaneBaseFilters(sorted, options)
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50))
  const visible = filtered.slice(0, limit)
  const owners = buildOwnerOptions(sorted)
  const bucketCounts = buildBucketCounts(baseFiltered)
  const laneTotals = buildLaneCounts(laneBaseFiltered)

  return {
    generatedAt: now.toISOString(),
    sources: { leadsOk, neoAccountsOk, tasksOk, warnings },
    summary: {
      total: filtered.length,
      critical: filtered.filter((item) => item.severity === "critical").length,
      high: filtered.filter((item) => item.severity === "high").length,
      leadCount: filtered.filter((item) => item.source === "lead").length,
      neoAccountCount: filtered.filter((item) => item.source === "neo_account").length,
      taskCount: filtered.filter((item) => item.source === "task").length,
      ownerCount: owners.length,
      bucketCounts,
      tierCounts: buildTierCounts(baseFiltered),
      laneTotals,
      laneCritical: baseFiltered.filter((item) => item.severity === "critical").length,
      sourceTotals: {
        lead: ownerScoped.filter((item) => item.source === "lead").length,
        neoAccount: ownerScoped.filter((item) => item.source === "neo_account").length,
        task: ownerScoped.filter((item) => item.source === "task").length,
      },
      demo: {
        total: demoIndex.total,
        matched: demoIndex.byName.size,
        unmatched: demoIndex.unmatched.length,
      },
    },
    buckets: buildBucketOptions(bucketCounts),
    lanes: buildLaneOptions(laneTotals),
    owners,
    items: visible,
  }
}
