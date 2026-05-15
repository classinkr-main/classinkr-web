export const FISCAL_MONTH_ORDER = [4,5,6,7,8,9,10,11,12,1,2,3] as const

export function fyOf(d: Date): number {
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + 1
  return m >= 4 ? y : y - 1
}
export function fyStart(d: Date): Date { return new Date(Date.UTC(fyOf(d), 3, 1)) }
export function fiscalQuarter(month: number): 1|2|3|4 {
  if (month >= 4 && month <= 6) return 1
  if (month >= 7 && month <= 9) return 2
  if (month >= 10 && month <= 12) return 3
  return 4
}
export function fiscalMonthIndex(month: number): number {
  return FISCAL_MONTH_ORDER.indexOf(month as 4|5|6|7|8|9|10|11|12|1|2|3)
}
export function ymKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2,"0")}`
}
export function currentFyPeriod(now: Date): { fy: number; quarter: 1|2|3|4; month: string } {
  return { fy: fyOf(now), quarter: fiscalQuarter(now.getUTCMonth() + 1), month: ymKey(now) }
}

export function parseYmMonth(value: string | null | undefined): string | null {
  const text = value?.trim()
  if (!text || !/^\d{4}-(0[1-9]|1[0-2])$/.test(text)) return null
  return text
}

export function dateFromYmMonth(ym: string): Date {
  const [year, month] = ym.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

export function resolvePeriodDate(scope: "M" | "Q" | "Y", month: string | null | undefined, fallback = new Date()): Date | null {
  if (scope !== "M") return fallback
  if (!month) return fallback
  const parsed = parseYmMonth(month)
  return parsed ? dateFromYmMonth(parsed) : null
}
