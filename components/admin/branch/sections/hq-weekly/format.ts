// 본사 주간 보고서 표기 헬퍼 — 문서 표와 ② 요약이 같은 자리수·단위를 쓴다.

/** 만 단위 1자리(1,000만 이상은 정수). 0·없음은 "-". */
export function wan(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value === 0) return "-"
  const w = value / 10_000
  return Math.abs(w) >= 1000 ? Math.round(w).toLocaleString("en-US") : w.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
/** 고객 명세용 만 단위 2자리(템플릿 표기 '9.74'). */
export function wan2(value: number) {
  return (value / 10_000).toLocaleString("en-US", { maximumFractionDigits: 2 })
}
export function rate(actual: number, goal: number) {
  return goal > 0 ? `${((actual / goal) * 100).toFixed(1)}%` : "-"
}
/** 막대 폭용 0~100 정수 퍼센트. */
export function ratePct(actual: number, goal: number) {
  return goal > 0 ? Math.max(0, Math.min(100, Math.round((actual / goal) * 100))) : 0
}
export function shortDate(ymd: string) {
  const [, m, d] = ymd.split("-")
  return `${Number(m)}/${Number(d)}`
}
/** ISO 시각 → KST 날짜(M/D). */
export function kstShort(iso: string | null) {
  if (!iso) return "-"
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? "-" : shortDate(new Date(ms + 9 * 3600_000).toISOString().slice(0, 10))
}
/** 첫 문장 — 。！？ 또는 공백이 뒤따르는 . ! ? 에서 끊는다(54.2 같은 소수점은 유지). */
export function firstSentence(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ")
  const match = /^(.+?(?:[。！？]|[.!?](?=\s|$)))/.exec(trimmed)
  return match ? match[1] : trimmed
}
