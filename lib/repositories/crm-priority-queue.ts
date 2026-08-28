import "server-only"

import { getNeoCrmCustomers, type NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
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
} from "@/lib/crm/priority"
import { classifyTodayCallSlot, isMetaLeadItem } from "@/lib/crm/today-calls"
import { getLeads, onLeadsMutated, type LeadRecord } from "@/lib/repositories/leads"
import { listCrmTasks, onCrmTasksMutated, type CrmTaskRecord } from "@/lib/repositories/crm-tasks"
import { onContactLogsMutated } from "@/lib/repositories/contact-logs"
import { getLeadsActivitySummary, type LeadActivityBadge } from "@/lib/repositories/lead-activity"
import {
  EMPTY_COMPASS_DEMO_SOURCE,
  buildCompassDemoIndex,
  type CompassDemoSource,
} from "@/lib/crm/compass-demo-signal"
import { loadCompassDemoSource } from "@/lib/crm/compass-demo-source"

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
    laneTotals: Record<CrmPriorityLane, number>
    /** 현재 소스·담당·레인 범위에서 시점 필터와 무관한 긴급 후보 수. */
    laneCritical: number
    /**
     * 소스 필터를 걷어낸 건수(담당자 필터는 유지). 목록에서 할 일을 분리해 놓고도
     * "할 일 N건"을 정직하게 표시하려면 현재 뷰가 아니라 전체 기준이 필요하다.
     */
    sourceTotals: { lead: number; neoAccount: number; task: number }
    /**
     * Compass 실측 데모 현황. unmatched 는 데모 기록은 있는데 우리 리드/계정의 전화로
     * 붙지 않은 건수다 — 조용히 버리지 않고 화면에 건수로 노출한다.
     * down=true 면 "데모 0건"이 아니라 "Compass 연결 끊김"이다.
     */
    demo: { total: number; matched: number; unmatched: number; down: boolean }
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

/**
 * CRM 홈은 lead + NEO 후보를 한 응답에서 받아 클라이언트가 "오늘 전화" 쿼터를 고른다.
 * 전역 점수순으로 먼저 limit 하면 한 소스가 50칸을 채운 뒤라 다른 슬롯 후보는 복구할 수 없다.
 *
 * 여기서는 정렬을 다시 계산하지 않고, 이미 우선순위순인 배열에서 클라이언트가 실제로 쓰는
 * 최소 슬롯만 먼저 예약한다. 남은 칸은 원래 전역 순서로 채우므로 기존 우선순위 의미도 유지한다.
 */
export function selectVisiblePriorityItems(
  items: CrmPriorityItem[],
  limit: number,
  source: CrmPriorityQueueSource = "all"
) {
  if (source !== "customer" || items.length <= limit) return items.slice(0, limit)

  const selectedIds = new Set<string>()
  const reserve = (predicate: (item: CrmPriorityItem) => boolean, count: number) => {
    for (const item of items) {
      if (selectedIds.size >= limit || count <= 0) break
      if (selectedIds.has(item.id) || !predicate(item)) continue
      selectedIds.add(item.id)
      count -= 1
    }
  }

  const isNonMetaSlot = (slot: ReturnType<typeof classifyTodayCallSlot>) =>
    (item: CrmPriorityItem) => !isMetaLeadItem(item) && classifyTodayCallSlot(item) === slot

  // limit이 작아도 신규 응대와 기존 고객이 서로를 완전히 밀어내지 않도록 1칸씩 먼저 잡는다.
  reserve(isNonMetaSlot("new_response"), 1)
  reserve(isNonMetaSlot("money"), 1)
  reserve(isNonMetaSlot("reengage"), 1)
  reserve(isMetaLeadItem, 1)

  // 기본 5건 쿼터(신규 2 · 돈 2 · 재활성 1)와 메타 요약 top 4에 필요한 추가 후보.
  reserve(isNonMetaSlot("new_response"), 1)
  reserve(isNonMetaSlot("money"), 1)
  reserve(isMetaLeadItem, 3)

  for (const item of items) {
    if (selectedIds.size >= limit) break
    selectedIds.add(item.id)
  }

  // 예약 때문에 먼 후보가 들어와도 반환 순서는 원래 전역 우선순위를 그대로 따른다.
  return items.filter((item) => selectedIds.has(item.id)).slice(0, limit)
}

// ── 소스 스냅샷 60초 모듈 캐시 (레버 05) ────────────────────────────────────
// CRM 홈 필터·담당자 토글마다 leads+NEO+할일 200건+참여요약+쇼룸 ICS를 매번
// 전량 재수집했다(실측 병목). 여기서 캐시하는 건 "소스 수집" 결과뿐이다 — 점수
// 계산(buildXPriorityItem)·필터·정렬은 이 아래에서 요청마다 다시 실행되며 그때의
// now를 쓰므로, 캐시가 최대 60초 묵어도 점수·버킷 판정 자체는 staleness가 없다
// (묵는 건 원본 데이터뿐). 선례: lib/repositories/crm-unified-customers.ts의
// sourceSnapshotCache/SOURCE_SNAPSHOT_TTL_MS 구조를 그대로 따른다.
// - 3개 필수 소스가 전부 성공했을 때만 저장한다(complete) — 부분 실패 스냅샷을
//   60초 고정하지 않고 다음 요청이 즉시 재시도한다(실패 캐시 금지).
// - 참여 신호·데모 일정은 원래도 보조 지표라 실패해도 경고 없이 빈 값으로 빠지며,
//   complete 판정에도 넣지 않는다(원본 동작 유지).
// - options.now가 주어진 호출(테스트·고정 시각)은 캐시를 읽지도 쓰지도 않는다.
// - 이 파일에는 쓰기 경로가 없다. 대신 소스 모듈의 쓰기 알림을 구독해(파일 하단)
//   할 일 완료·리드 변경·컨택 로그 직후 스냅샷을 버린다 — TTL만 믿으면 이미 끝낸
//   할 일이 "오늘 전화" 패널에 최대 60초 되살아난다.
interface CrmPrioritySourceSnapshot {
  leads: LeadRecord[]
  leadsOk: boolean
  neoRows: NeoCrmCustomerRow[]
  neoAccountsOk: boolean
  tasks: CrmTaskRecord[]
  tasksOk: boolean
  engagements: Record<string, LeadActivityBadge> | null
  demoSource: CompassDemoSource
  warnings: string[]
  complete: boolean
}

let sourceSnapshotCache: { at: number; value: CrmPrioritySourceSnapshot } | null = null
let sourceSnapshotInFlight: Promise<CrmPrioritySourceSnapshot> | null = null
// 무효화 시점 이전에 시작된 수집이 뒤늦게 캐시를 되채우는 걸 막는 세대 표식.
let sourceSnapshotGeneration = 0
const SOURCE_SNAPSHOT_TTL_MS = 60_000

/**
 * 소스 스냅샷을 즉시 버린다. 의존성 없이 모듈 캐시만 만지므로 어느 쓰기 경로에서
 * 불러도 안전하다(파일 하단에서 리드·할 일·컨택 로그 쓰기에 구독으로 연결한다).
 */
export function invalidateCrmPrioritySourceSnapshot() {
  sourceSnapshotGeneration += 1
  sourceSnapshotCache = null
  sourceSnapshotInFlight = null
}

async function getSourceSnapshot(bypassCache: boolean): Promise<CrmPrioritySourceSnapshot> {
  if (bypassCache) return loadSourceSnapshot()

  const cached = sourceSnapshotCache
  if (cached && Date.now() - cached.at < SOURCE_SNAPSHOT_TTL_MS) return cached.value
  if (sourceSnapshotInFlight) return sourceSnapshotInFlight

  const generation = sourceSnapshotGeneration
  const request = loadSourceSnapshot()
    .then((value) => {
      // 수집 도중 쓰기가 들어왔다면 이 결과는 이미 낡았다 — 반환만 하고 캐시하지 않는다.
      if (value.complete && generation === sourceSnapshotGeneration) {
        sourceSnapshotCache = { at: Date.now(), value }
      }
      return value
    })
    .finally(() => {
      if (sourceSnapshotInFlight === request) sourceSnapshotInFlight = null
    })
  sourceSnapshotInFlight = request
  return request
}

async function loadSourceSnapshot(): Promise<CrmPrioritySourceSnapshot> {
  const warnings: string[] = []
  let leadsOk = true
  let neoAccountsOk = true
  let tasksOk = true

  const [leadResult, neoResult, taskResult, engagementResult] = await Promise.allSettled([
    getLeads(),
    getNeoCrmCustomers(),
    listCrmTasks({ status: "active", limit: 200 }),
    getLeadsActivitySummary(),
  ])

  let leads: LeadRecord[] = []
  if (leadResult.status === "fulfilled") {
    leads = leadResult.value
  } else {
    leadsOk = false
    warnings.push("리드 우선순위를 불러오지 못했습니다.")
  }

  let neoRows: NeoCrmCustomerRow[] = []
  if (neoResult.status === "fulfilled" && neoResult.value.ok) {
    neoRows = neoResult.value.rows
  } else {
    neoAccountsOk = false
    warnings.push("동기화 고객 참고 데이터를 불러오지 못했습니다.")
  }

  let tasks: CrmTaskRecord[] = []
  if (taskResult.status === "fulfilled" && taskResult.value.health.ok) {
    tasks = taskResult.value.rows
  } else {
    tasksOk = false
    warnings.push("CRM 할 일을 불러오지 못했습니다.")
  }

  // 참여 신호·데모 실측은 우선순위를 더 정확하게 만들 뿐 없어도 큐는 서야 한다 —
  // 실패하면 조용히 빈 값으로 빠지고 경고도 띄우지 않는다(보조 지표).
  const engagements = engagementResult.status === "fulfilled" ? engagementResult.value : null

  // Compass 데모 조인은 우리 쪽 전화 목록을 입력으로 받으므로 위 수집 뒤에 한 번 더 간다.
  // 기간에 데모가 없으면 전화 조회 없이 끝난다(loadCompassDemoSource 참고).
  const demoSource = await loadCompassDemoSource([
    ...leads.map((lead) => lead.phone),
    ...neoRows.map((row) => row.phone),
  ]).catch(() => ({ ...EMPTY_COMPASS_DEMO_SOURCE, down: true }))

  return {
    leads,
    leadsOk,
    neoRows,
    neoAccountsOk,
    tasks,
    tasksOk,
    engagements,
    demoSource,
    warnings,
    complete: leadsOk && neoAccountsOk && tasksOk,
  }
}

export async function getCrmPriorityQueue(
  options: CrmPriorityQueueOptions = {}
): Promise<CrmPriorityQueue> {
  const now = options.now ?? new Date()
  const snapshot = await getSourceSnapshot(options.now != null)
  const { leadsOk, neoAccountsOk, tasksOk } = snapshot
  const warnings = [...snapshot.warnings]

  const items: CrmPriorityItem[] = []
  const engagements = snapshot.engagements
  const demoIndex = buildCompassDemoIndex(snapshot.demoSource, now)

  for (const lead of snapshot.leads) {
    const item = buildLeadPriorityItem(lead, now, {
      engagement: engagements?.[lead.id] ?? null,
      demoIndex,
    })
    if (item) items.push(item)
  }

  for (const account of snapshot.neoRows) {
    const item = buildNeoAccountPriorityItem(account, now, { demoIndex })
    if (item) items.push(item)
  }

  for (const task of snapshot.tasks) {
    const item = buildTaskPriorityItem(task, now)
    if (item) items.push(item)
  }

  const sorted = sortPriorityItems(items)
  const baseFiltered = applyBaseFilters(sorted, options)
  const filtered = applyFilters(sorted, options)
  const ownerScoped = applyOwnerFilter(sorted, options)
  const laneBaseFiltered = applyLaneBaseFilters(sorted, options)
  const limit = Math.max(1, Math.min(options.limit ?? 12, 50))
  const visible = selectVisiblePriorityItems(filtered, limit, options.source)
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
      laneTotals,
      laneCritical: baseFiltered.filter((item) => item.severity === "critical").length,
      sourceTotals: {
        lead: ownerScoped.filter((item) => item.source === "lead").length,
        neoAccount: ownerScoped.filter((item) => item.source === "neo_account").length,
        task: ownerScoped.filter((item) => item.source === "task").length,
      },
      demo: {
        total: demoIndex.total,
        matched: demoIndex.byPhoneKey.size,
        unmatched: demoIndex.unmatched,
        down: demoIndex.down,
      },
    },
    buckets: buildBucketOptions(bucketCounts),
    lanes: buildLaneOptions(laneTotals),
    owners,
    items: visible,
  }
}

// 소스 쓰기 구독 — 방향은 "소비자가 생산자를 구독"이다. 반대로 leads/crm-tasks 쪽에서
// 이 모듈을 import 하면 이미 여기가 그 둘을 읽고 있어 순환 import가 되고, 쓰기 라우트가
// 큐의 무거운 소스 그래프(NEO·쇼룸 ICS 등)까지 끌어오게 된다.
// 이 모듈이 로드되지 않은 프로세스에서는 구독도 없지만 캐시도 비어 있어 무효화할 것이 없다.
onLeadsMutated(invalidateCrmPrioritySourceSnapshot)
onCrmTasksMutated(invalidateCrmPrioritySourceSnapshot)
onContactLogsMutated(invalidateCrmPrioritySourceSnapshot)
