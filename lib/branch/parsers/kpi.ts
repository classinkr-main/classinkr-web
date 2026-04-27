import type { FormattedCell } from "@/lib/branch/google-sheets"

export const KPI_RANGE = "KPI!A1:AZ60"
export const KPI_METRICS = ["LD", "ACC", "OPP", "SOL", "VST"] as const
export type KpiMetric = typeof KPI_METRICS[number]
export type KpiPair = { goal: number; actual: number }

export interface KpiRow { member: string; pairs: Record<KpiMetric, KpiPair> }

export function parseKpi(grid: FormattedCell[][]): KpiRow[] {
  const out: KpiRow[] = []
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const member = String(row[0]?.value ?? "").trim()
    if (!member) continue
    const pairs = {} as Record<KpiMetric, KpiPair>
    KPI_METRICS.forEach((m, i) => {
      const goal = Number(row[1 + i]?.value); const actual = Number(row[21 + i]?.value)
      pairs[m] = { goal: Number.isFinite(goal) ? goal : 0, actual: Number.isFinite(actual) ? actual : 0 }
    })
    out.push({ member, pairs })
  }
  return out
}
