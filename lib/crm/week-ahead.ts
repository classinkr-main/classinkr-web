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

/** 홈 같은 요약 표면에서 한 번에 그리는 할 일 행 수. 나머지는 "+N건 더 보기"로 접는다. */
export const WEEK_AHEAD_PREVIEW_ROWS = 6

export interface WeekAheadBucketSlice<T> {
  bucket: WeekAheadBucket
  /** 예산 안에서 실제로 그릴 항목 */
  tasks: T[]
  /** 이 버킷의 전체 건수 — 헤더 카운트는 잘라내기 전 값을 써야 총량이 숨지 않는다 */
  total: number
}

export interface WeekAheadBudget<T> {
  slices: WeekAheadBucketSlice<T>[]
  shownCount: number
  totalCount: number
  hiddenCount: number
}

/**
 * 표시 예산 배분 — 버킷을 전부 펼치면 활성 할 일이 수십 개일 때 홈이 그대로 수십 행이 된다.
 * 버킷 우선순위(지연 → 오늘 → 이번 주 → 미룬 → 기한 없음) 순으로 budget만큼만 채우고,
 * 잘린 수는 hiddenCount로 따로 돌려준다. budget이 null이면 제한 없이 전부 돌려준다.
 *
 * 한 건도 못 채운 버킷은 slices에서 빠진다(빈 헤더만 남는 걸 막는다) — 대신 그 건수도
 * hiddenCount에 들어가므로 "+N건 더 보기"를 누르면 그대로 드러난다.
 */
export function budgetWeekAheadBuckets<T>(
  groups: Record<WeekAheadBucket, T[]>,
  budget: number | null
): WeekAheadBudget<T> {
  const slices: WeekAheadBucketSlice<T>[] = []
  let shownCount = 0
  let totalCount = 0

  for (const bucket of WEEK_AHEAD_VISIBLE_BUCKETS) {
    const tasks = groups[bucket] ?? []
    totalCount += tasks.length
    if (tasks.length === 0) continue

    const remaining = budget == null ? tasks.length : Math.max(0, budget - shownCount)
    if (remaining === 0) continue

    const take = Math.min(remaining, tasks.length)
    slices.push({ bucket, tasks: tasks.slice(0, take), total: tasks.length })
    shownCount += take
  }

  return { slices, shownCount, totalCount, hiddenCount: totalCount - shownCount }
}
