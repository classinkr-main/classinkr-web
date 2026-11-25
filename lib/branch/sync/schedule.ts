// 매출·하드웨어 시트 자동 동기화 크론(/api/cron/sync-branch) 일정 — 순수 모듈(클라이언트 겸용 — server-only 금지).
//
// 왜(F-47): 장부 상태 줄이 "매일 17:38(KST) 자동 동기화"라고 했지만 vercel.json 은 하루 세 번(09·13·17시 KST) 돈다.
// 화면 문구는 이 상수에서 만들고, vercel.json 과 같은지는 tests/branch/sync/schedule.test.ts 가 vercel.json 을 직접 읽어
// 대조한다(JSON 이라 코드가 import 할 수 없다). 일정을 바꾸면 vercel.json 과 이 파일을 함께 고친다.

export const BRANCH_SYNC_CRON_PATH = "/api/cron/sync-branch"
/** vercel.json 의 schedule 원문(UTC). */
export const BRANCH_SYNC_CRON_SCHEDULE_UTC = "0 0,4,8 * * *"
/** 위 일정의 KST 시각(분은 0). */
export const BRANCH_SYNC_KST_HOURS: readonly number[] = [9, 13, 17]
export const BRANCH_SYNC_KST_MINUTE = 0

const KST_OFFSET_HOURS = 9

/**
 * "분 시 * * *" 꼴(매일, 분·시 목록) UTC 크론 → KST 시각 목록(오름차순). 그 밖의 꼴(요일·날짜 조건, 범위·간격)은 null —
 * 이 모듈이 다루는 일정이 아니다.
 */
export function kstTimesOfDailyCron(schedule: string): { minute: number; hours: number[] } | null {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = fields
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") return null
  if (!/^\d{1,2}$/.test(minuteField) || !/^\d{1,2}(,\d{1,2})*$/.test(hourField)) return null
  const minute = Number(minuteField)
  const utcHours = hourField.split(",").map(Number)
  if (minute > 59 || utcHours.some((hour) => hour > 23)) return null
  const hours = [...new Set(utcHours.map((hour) => (hour + KST_OFFSET_HOURS) % 24))].sort((a, b) => a - b)
  return { minute, hours }
}

/** 화면 문구 — "매일 09·13·17시(KST)". 분이 0 이 아니면 "매일 09:30·13:30(KST)" 꼴. */
export function formatBranchSyncSchedule(
  hours: readonly number[] = BRANCH_SYNC_KST_HOURS,
  minute: number = BRANCH_SYNC_KST_MINUTE,
): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  if (minute === 0) return `매일 ${hours.map(pad).join("·")}시(KST)`
  return `매일 ${hours.map((hour) => `${pad(hour)}:${pad(minute)}`).join("·")}(KST)`
}
