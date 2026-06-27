// "이번 주 해야 할 일" 작업대의 task 버킷 분류(culture-fit §4.3). 순수 함수로 분리해 테스트한다.

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export type WeekAheadBucket = "overdue" | "today" | "week" | "snoozed" | "nodue" | "later"

// 화면에 표시하는 버킷 순서. "later"(7일 이후)는 집계만 하고 표시하지 않는다.
export const WEEK_AHEAD_VISIBLE_BUCKETS: WeekAheadBucket[] = ["overdue", "today", "week", "snoozed", "nodue"]

export function kstDayStart(ms: number): number {
  const kst = ms + KST_OFFSET_MS
  return Math.floor(kst / DAY_MS) * DAY_MS - KST_OFFSET_MS
}

export interface WeekAheadTaskLike {
  status: string
  dueAt: string | null
}

export function classifyTaskBucket(task: WeekAheadTaskLike, nowMs: number): WeekAheadBucket {
  if (task.status === "snoozed") return "snoozed"
  if (!task.dueAt) return "nodue"
  const time = new Date(task.dueAt).getTime()
  if (Number.isNaN(time)) return "nodue"
  if (time < nowMs) return "overdue"
  const todayStart = kstDayStart(nowMs)
  if (time < todayStart + DAY_MS) return "today"
  if (time < todayStart + 7 * DAY_MS) return "week"
  return "later"
}
