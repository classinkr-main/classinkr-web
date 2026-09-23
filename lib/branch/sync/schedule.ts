// 매출 시트 자동 동기화(크론) 스케줄 — 화면 문구의 정본.
//
// vercel.json "/api/cron/sync-branch"의 schedule(UTC)을 그대로 옮긴 사본이다. 화면이 "매일 17:38(KST)"처럼
// 시각을 손으로 적어 두면 크론 시각이 바뀌어도 문구가 그대로 남는다(라운드 5 S-11 — 실제는 17:00이었다).
// tests/branch/sync-schedule.test.ts가 이 값과 vercel.json을 대조하므로 한쪽만 바꾸면 테스트가 깨진다.
export const BRANCH_SYNC_CRON_UTC = "0 8 * * *"

const KST_OFFSET_HOURS = 9

/**
 * "분 시 * * *"(매일) 형식의 UTC 크론 식을 KST 시각 목록 문구로 바꾼다. 예: "0 8 * * *" → "매일 17:00",
 * "0 0,4,8 * * *" → "매일 09:00·13:00·17:00". 매일이 아닌 식(요일·날짜 지정 등)이나 해석할 수 없는 식은 null.
 */
export function describeDailyCronKst(expression: string): string | null {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minuteField, hourField, dayOfMonth, month, dayOfWeek] = parts
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") return null
  if (!/^\d{1,2}$/.test(minuteField)) return null
  const minute = Number(minuteField)
  if (minute > 59) return null
  const hours = hourField.split(",")
  if (hours.length === 0 || hours.some((hour) => !/^\d{1,2}$/.test(hour) || Number(hour) > 23)) return null
  const labels = hours
    .map((hour) => (Number(hour) + KST_OFFSET_HOURS) % 24)
    .sort((a, b) => a - b)
    .map((hour) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`)
  return `매일 ${labels.join("·")}`
}

/** 화면 문구: "매일 17:00(KST) 자동 동기화". 스케줄을 해석할 수 없으면 시각 없이 "자동 동기화". */
export function branchSyncScheduleLabel(): string {
  const label = describeDailyCronKst(BRANCH_SYNC_CRON_UTC)
  return label ? `${label}(KST) 자동 동기화` : "자동 동기화"
}
