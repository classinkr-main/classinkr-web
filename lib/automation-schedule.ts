/**
 * 예약 규칙이 "오늘" 도는 날인지 판정한다.
 *
 * 예약 규칙은 하루 한 번 깨는 크론(/api/cron/automation, UTC 09:00)이 실행한다. 그래서 규칙의 cron 식에서
 * 볼 것은 "어느 날인가"(일·월·요일 칸)뿐이고 분·시 칸은 보지 않는다 — 하루 한 번의 실행이 그날 몫이다.
 * 예전에는 식이 "매일 09시"와 글자가 다르면 무조건 실행해서 "매주 월요일"·"매월 1일" 규칙이 매일 발송됐다.
 *
 * 지원하는 칸 표기: `*`, 숫자, 쉼표 목록(`1,15`), 구간(`1-5`). 요일은 0·7 = 일요일.
 * 그 밖의 표기(간격 표기 등)나 칸 수가 맞지 않는 식은 "모르는 식"으로 본다 — 호출부는 보내지 않는다.
 */
export type ScheduledDayMatch = "due" | "not_due" | "unsupported"

function parseField(field: string, min: number, max: number): Set<number> | "any" | null {
  if (field === "*") return "any"
  const values = new Set<number>()
  for (const part of field.split(",")) {
    const range = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part)
    if (!range) return null
    const start = Number(range[1])
    const end = range[2] === undefined ? start : Number(range[2])
    if (start < min || end > max || start > end) return null
    for (let value = start; value <= end; value += 1) values.add(value)
  }
  return values
}

export function matchScheduledDay(cron: string, now: Date): ScheduledDayMatch {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return "unsupported"

  const dayOfMonth = parseField(fields[2], 1, 31)
  const month = parseField(fields[3], 1, 12)
  const dayOfWeek = parseField(fields[4], 0, 7)
  if (dayOfMonth === null || month === null || dayOfWeek === null) return "unsupported"

  // 크론을 깨우는 쪽(Vercel)이 UTC 로 식을 읽으므로 같은 기준으로 본다.
  if (month !== "any" && !month.has(now.getUTCMonth() + 1)) return "not_due"

  const weekday = now.getUTCDay()
  const domMatches = dayOfMonth === "any" || dayOfMonth.has(now.getUTCDate())
  const dowMatches = dayOfWeek === "any" || dayOfWeek.has(weekday) || (weekday === 0 && dayOfWeek.has(7))

  // 표준 cron 규칙: 일과 요일을 둘 다 좁히면 어느 한쪽만 맞아도 실행한다.
  const dayMatches =
    dayOfMonth !== "any" && dayOfWeek !== "any" ? domMatches || dowMatches : domMatches && dowMatches
  return dayMatches ? "due" : "not_due"
}
