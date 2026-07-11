// CrmActionRail 순수 헬퍼 — 오늘 할 일 선별·정렬, 기한 라벨, 기록 딥링크.
// 상태 전이는 절대 여기서 하지 않는다(명시 액션 API 전용, admin-os-operating-decisions §4).

import type { CrmTaskPriority, CrmTaskRecord } from "@/lib/repositories/crm-tasks"

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const PRIORITY_RANK: Record<CrmTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
}

function kstDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10)
}

export function isRailOverdue(task: CrmTaskRecord, now: Date): boolean {
  if (task.status !== "open" || !task.dueAt) return false
  const time = new Date(task.dueAt).getTime()
  return !Number.isNaN(time) && time < now.getTime()
}

export function isDueTodayKst(task: CrmTaskRecord, now: Date): boolean {
  if (task.status !== "open") return false
  const due = kstDayKey(task.dueAt)
  return due != null && due === kstDayKey(now.toISOString())
}

// 미루기(snoozed) 태스크 중 재개일이 지난 것 — 다시 표면에 올라와야 한다.
export function isSnoozeResumed(task: CrmTaskRecord, now: Date): boolean {
  if (task.status !== "snoozed") return false
  if (!task.snoozedUntil) return true
  const time = new Date(task.snoozedUntil).getTime()
  return Number.isNaN(time) || time <= now.getTime()
}

// 정렬 그룹: 0=지남, 1=오늘 마감, 2=재개된 미루기, 3=나머지 열린 할 일.
function railGroup(task: CrmTaskRecord, now: Date): number {
  if (isRailOverdue(task, now)) return 0
  if (isDueTodayKst(task, now)) return 1
  if (isSnoozeResumed(task, now)) return 2
  return 3
}

/**
 * 오늘 할 일 요약용 상위 N 선별.
 * - 미래 재개일을 가진 미루기(snoozed)는 의도적으로 감춘 것이므로 제외한다.
 * - 지남 → 오늘 마감 → 재개된 미루기 → 나머지, 그룹 안에서는
 *   우선순위(urgent>high>normal>low) → 기한 오름차순(무기한 마지막) → 최근 생성 순.
 */
export function rankRailTasks(rows: CrmTaskRecord[], now: Date, limit = 7): CrmTaskRecord[] {
  const visible = rows.filter((task) => {
    if (task.status === "open") return true
    if (task.status === "snoozed") return isSnoozeResumed(task, now)
    return false
  })

  const dueMs = (task: CrmTaskRecord) => {
    if (!task.dueAt) return Number.POSITIVE_INFINITY
    const time = new Date(task.dueAt).getTime()
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
  }

  return visible
    .slice()
    .sort((a, b) => {
      const group = railGroup(a, now) - railGroup(b, now)
      if (group !== 0) return group
      const priority = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2)
      if (priority !== 0) return priority
      const due = dueMs(a) - dueMs(b)
      if (due !== 0) return due
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    })
    .slice(0, Math.max(0, limit))
}

function formatShort(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// 레일 태스크 행의 기한 캡션(기준 명시: KST 재개/마감).
export function taskDueLabel(task: CrmTaskRecord, now: Date): { text: string; tone: "danger" | "caution" | "neutral" } {
  if (task.status === "snoozed") {
    return {
      text: task.snoozedUntil ? `재개 ${formatShort(task.snoozedUntil)}` : "재개일 없음",
      tone: "caution",
    }
  }
  if (!task.dueAt) return { text: "기한 없음", tone: "neutral" }
  if (isRailOverdue(task, now)) return { text: `지남 · ${formatShort(task.dueAt)}`, tone: "danger" }
  if (isDueTodayKst(task, now)) return { text: `오늘 ${formatShort(task.dueAt)}`, tone: "caution" }
  return { text: formatShort(task.dueAt), tone: "neutral" }
}

/**
 * 기록 표면 딥링크 — targetId가 있으면 해당 고객으로 스코프된 타임라인으로 간다.
 * (신호→행동 딥링크 원칙: 레일의 최근 기록/태스크 대상에서 바로 이동)
 */
export function activityDeepLink(input: {
  targetId: string | null | undefined
  targetType?: string | null
  targetLabel?: string | null
}): string {
  const targetId = input.targetId?.trim()
  if (!targetId) return "/admin/crm/activity"
  const params = new URLSearchParams({ targetId })
  if (input.targetType && input.targetType !== "unknown" && input.targetType !== "all") {
    params.set("targetType", input.targetType)
  }
  if (input.targetLabel?.trim()) params.set("targetLabel", input.targetLabel.trim())
  return `/admin/crm/activity?${params.toString()}`
}
