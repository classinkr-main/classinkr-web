import type { FormattedCell } from "@/lib/branch/google-sheets"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export const KPI_RANGE = "'3. KPI'!A1:AL200"
export const KPI_METRICS = ["LD", "ACC", "OPP", "SOL", "VST"] as const
export type KpiMetric = typeof KPI_METRICS[number]
export type KpiPair = { goal: number; actual: number }

export interface KpiRow { member: string; pairs: Record<KpiMetric, KpiPair> }

export interface KpiBlocks {
  fy: KpiRow[]
  months: Record<number, KpiRow[]>
}

const GOAL_COLS = [4, 5, 6, 7, 8] as const
const ACTUAL_COLS = [14, 15, 16, 17, 18] as const

function parseRow(row: FormattedCell[], member: string): KpiRow {
  const pairs = {} as Record<KpiMetric, KpiPair>
  KPI_METRICS.forEach((m, i) => {
    const goal = Number(row[GOAL_COLS[i]]?.value)
    const actual = Number(row[ACTUAL_COLS[i]]?.value)
    pairs[m] = { goal: Number.isFinite(goal) ? goal : 0, actual: Number.isFinite(actual) ? actual : 0 }
  })
  return { member, pairs }
}

export function parseKpiBlocks(grid: FormattedCell[][]): KpiBlocks {
  const fy: KpiRow[] = []
  const months: Record<number, KpiRow[]> = {}
  let currentMonth: number | null = null

  for (let r = 2; r < grid.length; r++) {
    const row = grid[r] ?? []
    const firstCell = String(row[0]?.value ?? "").trim()
    if (!firstCell) continue
    if (/^([1-9]|1[0-2])$/.test(firstCell)) {
      currentMonth = Number(firstCell)
      if (!months[currentMonth]) months[currentMonth] = []
      continue
    }
    if (firstCell.toLowerCase().startsWith("fy")) continue
    if (firstCell.toLowerCase() === "sum") continue
    const member = normalizeBranchMemberName(firstCell)
    if (!member) continue
    const kpiRow = parseRow(row, member)
    if (currentMonth === null) fy.push(kpiRow)
    else months[currentMonth].push(kpiRow)
  }

  return { fy, months }
}

function quarterCalendarMonths(q: 1 | 2 | 3 | 4): number[] {
  if (q === 1) return [4, 5, 6]
  if (q === 2) return [7, 8, 9]
  if (q === 3) return [10, 11, 12]
  return [1, 2, 3]
}

export function selectKpiRows(blocks: KpiBlocks, period: "M" | "Q" | "Y", now: Date): KpiRow[] {
  if (period === "Y") return blocks.fy

  const calMonth = now.getUTCMonth() + 1
  if (period === "M") {
    const mRows = blocks.months[calMonth]
    return mRows?.length ? mRows : blocks.fy
  }

  // Q: aggregate months in the current fiscal quarter
  const q = fiscalQuarter(calMonth)
  const qMonths = quarterCalendarMonths(q)
  const available = qMonths.filter((m) => blocks.months[m]?.length)
  if (available.length === 0) return blocks.fy

  const acc = new Map<string, Record<KpiMetric, KpiPair>>()
  for (const mo of available) {
    for (const row of blocks.months[mo]) {
      if (!acc.has(row.member)) {
        const init = {} as Record<KpiMetric, KpiPair>
        KPI_METRICS.forEach((m) => { init[m] = { goal: 0, actual: 0 } })
        acc.set(row.member, init)
      }
      const existing = acc.get(row.member)!
      KPI_METRICS.forEach((m) => {
        existing[m].goal += row.pairs[m].goal
        existing[m].actual += row.pairs[m].actual
      })
    }
  }

  return Array.from(acc.entries()).map(([member, pairs]) => ({ member, pairs }))
}

// Backward-compat: FY block only
export function parseKpi(grid: FormattedCell[][]): KpiRow[] {
  return parseKpiBlocks(grid).fy
}
