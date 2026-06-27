import "server-only"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getCrmPriorityQueue } from "@/lib/repositories/crm-priority-queue"
import type { CrmPriorityItem, CrmPrioritySeverity } from "@/lib/crm/priority"

const DAY_MS = 24 * 60 * 60 * 1000
const UNASSIGNED = "미배정"

export type ManagerAttentionKind =
  | "overdue_task"
  | "unresponded_lead"
  | "renewal_risk"
  | "deal_no_action"

export interface ManagerOwnerRow {
  ownerKey: string | null
  ownerName: string
  completedTasks: number
  overdueTasks: number
  openTasks: number
  openDeals: number
  dealsNoNextAction: number
}

export interface ManagerAttentionItem {
  id: string
  kind: ManagerAttentionKind
  title: string
  reason: string
  ownerName: string
  href: string | null
  severity: CrmPrioritySeverity
}

export interface CrmManagerReport {
  generatedAt: string
  windowDays: number
  health: { ok: boolean; warnings: string[] }
  sources: { tasksOk: boolean; dealsOk: boolean; queueOk: boolean }
  totals: {
    managers: number
    completedTasks: number
    overdueTasks: number
    openDeals: number
    dealsNoNextAction: number
    unrespondedLeads: number
    riskCustomers: number
  }
  owners: ManagerOwnerRow[]
  attention: ManagerAttentionItem[]
}

interface TaskAggRow {
  owner_key: string | null
  owner_name_snapshot: string | null
  status: string
  due_at: string | null
}

interface DealAggRow {
  owner_key: string | null
  owner_name_snapshot: string | null
  next_task_id: string | null
}

function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) return false
  const haystack = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase()
  return haystack.includes("42p01") || haystack.includes("does not exist") || haystack.includes("schema cache")
}

function ownerIdentity(ownerKey: string | null, ownerName: string | null) {
  const key = ownerKey?.trim() || null
  const name = ownerName?.trim() || null
  return { key, name: name ?? key ?? UNASSIGNED, mapKey: key ?? name?.toLowerCase() ?? "__unassigned__" }
}

function ensureOwner(map: Map<string, ManagerOwnerRow>, ownerKey: string | null, ownerName: string | null) {
  const { key, name, mapKey } = ownerIdentity(ownerKey, ownerName)
  let row = map.get(mapKey)
  if (!row) {
    row = {
      ownerKey: key,
      ownerName: name,
      completedTasks: 0,
      overdueTasks: 0,
      openTasks: 0,
      openDeals: 0,
      dealsNoNextAction: 0,
    }
    map.set(mapKey, row)
  }
  return row
}

export function attentionFromQueueItem(item: CrmPriorityItem): ManagerAttentionItem | null {
  let kind: ManagerAttentionKind | null = null
  if (item.source === "task") kind = "overdue_task"
  else if (item.source === "lead" && item.action === "respond_lead") kind = "unresponded_lead"
  else if (item.source === "neo_account") kind = "renewal_risk"
  if (!kind) return null
  // overdue_task만 실제 지연으로 본다(미래 task는 제외).
  if (kind === "overdue_task" && item.bucket !== "today") return null
  return {
    id: item.id,
    kind,
    title: item.title,
    reason: item.reason,
    ownerName: item.ownerName ?? UNASSIGNED,
    href: item.href,
    severity: item.severity,
  }
}

export async function getCrmManagerReport(
  options: { now?: Date; windowDays?: number } = {}
): Promise<CrmManagerReport> {
  const now = options.now ?? new Date()
  const windowDays = options.windowDays ?? 7
  const windowStartIso = new Date(now.getTime() - windowDays * DAY_MS).toISOString()
  const nowIso = now.toISOString()
  const supabase = createSupabaseAdminClient()
  const warnings: string[] = []

  const [openTasksResult, doneTasksResult, dealsResult, queueResult] = await Promise.allSettled([
    supabase.from("crm_tasks").select("owner_key,owner_name_snapshot,status,due_at").in("status", ["open", "snoozed"]).limit(5000),
    supabase.from("crm_tasks").select("owner_key,owner_name_snapshot,status,due_at").eq("status", "done").gte("completed_at", windowStartIso).limit(5000),
    supabase.from("crm_deals").select("owner_key,owner_name_snapshot,next_task_id").eq("status", "open").limit(2000),
    getCrmPriorityQueue({ limit: 40, now }),
  ])

  const owners = new Map<string, ManagerOwnerRow>()
  let tasksOk = true
  let dealsOk = true
  let queueOk = true

  if (openTasksResult.status === "fulfilled" && !openTasksResult.value.error) {
    for (const row of (openTasksResult.value.data ?? []) as TaskAggRow[]) {
      const owner = ensureOwner(owners, row.owner_key, row.owner_name_snapshot)
      owner.openTasks += 1
      if (row.status === "open" && row.due_at && row.due_at < nowIso) owner.overdueTasks += 1
    }
  } else {
    const error = openTasksResult.status === "fulfilled" ? openTasksResult.value.error : null
    if (!isMissingTableError(error)) tasksOk = false
    warnings.push("할 일 집계를 일부 불러오지 못했습니다.")
  }

  if (doneTasksResult.status === "fulfilled" && !doneTasksResult.value.error) {
    for (const row of (doneTasksResult.value.data ?? []) as TaskAggRow[]) {
      ensureOwner(owners, row.owner_key, row.owner_name_snapshot).completedTasks += 1
    }
  } else if (tasksOk) {
    const error = doneTasksResult.status === "fulfilled" ? doneTasksResult.value.error : null
    if (!isMissingTableError(error)) tasksOk = false
  }

  if (dealsResult.status === "fulfilled" && !dealsResult.value.error) {
    for (const row of (dealsResult.value.data ?? []) as DealAggRow[]) {
      const owner = ensureOwner(owners, row.owner_key, row.owner_name_snapshot)
      owner.openDeals += 1
      if (!row.next_task_id) owner.dealsNoNextAction += 1
    }
  } else {
    const error = dealsResult.status === "fulfilled" ? dealsResult.value.error : null
    if (!isMissingTableError(error)) dealsOk = false
    warnings.push("딜 집계를 일부 불러오지 못했습니다.")
  }

  let attention: ManagerAttentionItem[] = []
  let unrespondedLeads = 0
  let riskCustomers = 0
  if (queueResult.status === "fulfilled") {
    const queue = queueResult.value
    attention = queue.items.map(attentionFromQueueItem).filter((item): item is ManagerAttentionItem => item != null)
    unrespondedLeads = attention.filter((item) => item.kind === "unresponded_lead").length
    riskCustomers = attention.filter((item) => item.kind === "renewal_risk").length
    if (queue.sources.warnings.length) warnings.push(...queue.sources.warnings)
  } else {
    queueOk = false
    warnings.push("우선순위 큐를 불러오지 못했습니다.")
  }

  const ownerRows = Array.from(owners.values()).sort(
    (a, b) =>
      b.overdueTasks - a.overdueTasks ||
      b.dealsNoNextAction - a.dealsNoNextAction ||
      b.openTasks - a.openTasks ||
      a.ownerName.localeCompare(b.ownerName, "ko")
  )

  return {
    generatedAt: now.toISOString(),
    windowDays,
    health: { ok: warnings.length === 0, warnings: [...new Set(warnings)] },
    sources: { tasksOk, dealsOk, queueOk },
    totals: {
      managers: ownerRows.filter((row) => row.ownerName !== UNASSIGNED).length,
      completedTasks: ownerRows.reduce((sum, row) => sum + row.completedTasks, 0),
      overdueTasks: ownerRows.reduce((sum, row) => sum + row.overdueTasks, 0),
      openDeals: ownerRows.reduce((sum, row) => sum + row.openDeals, 0),
      dealsNoNextAction: ownerRows.reduce((sum, row) => sum + row.dealsNoNextAction, 0),
      unrespondedLeads,
      riskCustomers,
    },
    owners: ownerRows,
    attention,
  }
}
