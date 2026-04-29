import type { FormattedCell } from "@/lib/branch/google-sheets"

export const KPI_RANGE = "'3. KPI'!A1:AL200"
export const KPI_METRICS = ["LD", "ACC", "OPP", "SOL", "VST"] as const
export type KpiMetric = typeof KPI_METRICS[number]
export type KpiPair = { goal: number; actual: number }

export interface KpiRow { member: string; pairs: Record<KpiMetric, KpiPair> }

const GOAL_COLS = [4, 5, 6, 7, 8] as const     // Lead, Acc., opp., Sol., Visit (Goal section)
const ACTUAL_COLS = [14, 15, 16, 17, 18] as const  // same metrics in Status section

export function parseKpi(grid: FormattedCell[][]): KpiRow[] {
  const out: KpiRow[] = []
  // The first data block is the FY summary. Later blocks repeat the same rows by month.
  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    const member = String(row[0]?.value ?? "").trim()
    if (!member) {
      if (out.length > 0) break
      continue
    }
    if (/^([1-9]|1[0-2])$/.test(member)) break
    if (member.toLowerCase().startsWith("fy")) continue
    if (member.toLowerCase() === "sum") continue
    const pairs = {} as Record<KpiMetric, KpiPair>
    KPI_METRICS.forEach((m, i) => {
      const goal = Number(row[GOAL_COLS[i]]?.value)
      const actual = Number(row[ACTUAL_COLS[i]]?.value)
      pairs[m] = { goal: Number.isFinite(goal) ? goal : 0, actual: Number.isFinite(actual) ? actual : 0 }
    })
    out.push({ member, pairs })
  }
  return out
}
