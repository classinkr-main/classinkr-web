/**
 * A4 — 기록 목록 날짜 그룹핑과 기간 프리셋 범위 계산. 순수 함수(I/O 없음).
 *
 * 한국은 DST가 없으므로 +9h 고정 오프셋으로 KST 달력일 경계를 계산한다(SSR·테스트에서 결정적).
 * lib/crm/activity-week-summary.ts와 같은 기법이지만, 이 파일은 "일" 단위 그룹·범위만 다루고
 * 그 파일의 "주" 단위 계산에 의존하지 않는다(서로 다른 소비처가 각자 필요한 범위만 계산).
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const

interface KstDateParts {
  year: number
  month: number // 0-based
  date: number
  weekday: number // 0=일 … 6=토
}

function kstParts(ms: number): KstDateParts {
  const shifted = new Date(ms + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    date: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  }
}

/** KST 달력일 00:00에 대응하는 UTC epoch ms. */
function kstDayStartMs(ms: number): number {
  const { year, month, date } = kstParts(ms)
  return Date.UTC(year, month, date) - KST_OFFSET_MS
}

function dayKeyOf(parts: KstDateParts): string {
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.date).padStart(2, "0")}`
}

/** "9/21 (월)" 형식. */
function monthDayWeekdayLabel(parts: KstDateParts): string {
  return `${parts.month + 1}/${parts.date} (${WEEKDAY_LABELS[parts.weekday]})`
}

export interface ActivityDateGroupable {
  occurredAt: string
}

export interface ActivityDateGroup<T> {
  /** "YYYY-MM-DD" (KST). 날짜를 못 읽은 행은 "unknown". */
  dayKey: string
  /** "오늘 · 9/21 (월)" | "어제 · 9/20 (일)" | "9/19 (금)" | "날짜 미상" */
  label: string
  rows: T[]
}

/**
 * occurredAt(KST 달력일) 기준으로 그룹핑한다. 입력 순서를 유지하고(occurred_at 내림차순 API
 * 계약을 전제하지 않는다 — 그룹 등장 순서는 각 그룹의 첫 행이 나온 위치를 따른다), 같은 날짜가
 * 비연속으로 나타나도(페이지 "더 보기" 병합 등) 먼저 나온 그룹에 합친다. occurredAt 파싱 실패
 * 행은 "날짜 미상" 그룹 하나로 모은다(드물게 손상된 레코드를 조용히 버리지 않기 위함).
 */
export function groupEventsByKstDay<T extends ActivityDateGroupable>(
  rows: readonly T[],
  nowMs: number
): ActivityDateGroup<T>[] {
  const todayKey = dayKeyOf(kstParts(nowMs))
  const yesterdayKey = dayKeyOf(kstParts(nowMs - DAY_MS))

  const order: string[] = []
  const byKey = new Map<string, ActivityDateGroup<T>>()

  for (const row of rows) {
    const occurredMs = Date.parse(row.occurredAt)
    const isValid = Number.isFinite(occurredMs)
    const key = isValid ? dayKeyOf(kstParts(occurredMs)) : "unknown"

    let group = byKey.get(key)
    if (!group) {
      let label: string
      if (!isValid) {
        label = "날짜 미상"
      } else {
        const parts = kstParts(occurredMs)
        const dayLabel = monthDayWeekdayLabel(parts)
        label = key === todayKey ? `오늘 · ${dayLabel}` : key === yesterdayKey ? `어제 · ${dayLabel}` : dayLabel
      }
      group = { dayKey: key, label, rows: [] }
      byKey.set(key, group)
      order.push(key)
    }
    group.rows.push(row)
  }

  return order.map((key) => {
    const group = byKey.get(key)
    if (!group) throw new Error(`[activity-date-groups] 내부 불일치 — 그룹 키 ${key}를 찾을 수 없습니다.`)
    return group
  })
}

export type ActivityPeriodPreset = "today" | "7d" | "30d" | "all"

export interface ActivityPeriodOption {
  key: ActivityPeriodPreset
  label: string
}

/** 기록 화면 기간 칩 — 기본은 "전체"(세션 state, URL 미반영). */
export const ACTIVITY_PERIOD_PRESETS: ActivityPeriodOption[] = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "all", label: "전체" },
]

/** 오늘(0)부터 며칠 전까지 포함하는지. "전체"는 범위 자체가 없다(아래서 별도 처리). */
const PERIOD_LOOKBACK_DAYS: Record<Exclude<ActivityPeriodPreset, "all">, number> = {
  today: 0,
  "7d": 6,
  "30d": 29,
}

/**
 * 기간 프리셋 → occurred_at 조회 범위(KST 일 경계, from 포함·to 포함).
 * "전체"는 둘 다 생략한다(서버가 무제한 조회).
 */
export function resolveActivityPeriod(preset: ActivityPeriodPreset, nowMs: number): { from?: string; to?: string } {
  if (preset === "all") return {}
  const todayStartMs = kstDayStartMs(nowMs)
  const fromMs = todayStartMs - PERIOD_LOOKBACK_DAYS[preset] * DAY_MS
  const todayEndMs = todayStartMs + DAY_MS - 1 // 오늘 23:59:59.999 KST
  return { from: new Date(fromMs).toISOString(), to: new Date(todayEndMs).toISOString() }
}
