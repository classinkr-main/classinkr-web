import type { FormattedCell } from "@/lib/branch/google-sheets"
import { normalizeMonthHeader } from "./rev"

export const DSH_RANGE = "'1. DSH'!A1:W300"
// Real DSH layout: A=team-label (mostly empty), B=section, C=cat, D=new/renew, E=direct/channel,
// F=Year, G-J=Q1-Q4, K-V=months 4..3, W=Ratio
export const DSH_COLS = { section: 1, annual: 5, q1: 6, q4: 9, monthStart: 10 } as const

export type DshLevel = "team" | "member"
export type DshKind = "goal" | "status"

export interface DshRow {
  level: DshLevel
  team: string
  member?: string
  kind: DshKind
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

export interface DshOutput { rows: DshRow[]; members: Record<string, string> }

function asNum(v: unknown): number {
  if (v == null) return 0
  const cleaned = typeof v === "number" ? v : Number(String(v).replace(/[,¥$\s]/g, ""))
  return Number.isFinite(cleaned) ? cleaned : 0
}

export function parseDsh(grid: FormattedCell[][], refFy: number): DshOutput {
  if (grid.length < 2) return { rows: [], members: {} }
  const headers = grid[0] ?? []
  const monthMap: Array<{ idx: number; ym: string }> = []
  for (let i = DSH_COLS.monthStart; i < headers.length; i++) {
    const ym = normalizeMonthHeader(headers[i]?.value, refFy)
    if (ym) monthMap.push({ idx: i, ym })
  }

  // Aggregate Goal (rows where col B === "Goal" plus subsequent rows until next section)
  // and Status (col B === "Status" plus subsequent rows until next section).
  const aggregate = (kind: "goal" | "status"): DshRow => {
    let annual = 0
    const quarters: [number, number, number, number] = [0, 0, 0, 0]
    const months: Record<string, number> = {}
    for (const { ym } of monthMap) months[ym] = 0
    let inSection = false
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r] ?? []
      const section = String(row[DSH_COLS.section]?.value ?? "").trim().toLowerCase()
      if (section === kind) inSection = true
      else if (section && section !== "") {
        // Section change. Stop aggregating once we've left the section block.
        if (inSection && !["software", "hardware"].includes(section)) inSection = false
      }
      if (!inSection) continue
      // Skip the header row (col B === kind name with no numbers).
      annual += asNum(row[DSH_COLS.annual]?.value)
      quarters[0] += asNum(row[DSH_COLS.q1]?.value)
      quarters[1] += asNum(row[DSH_COLS.q1 + 1]?.value)
      quarters[2] += asNum(row[DSH_COLS.q1 + 2]?.value)
      quarters[3] += asNum(row[DSH_COLS.q4]?.value)
      for (const { idx, ym } of monthMap) months[ym] += asNum(row[idx]?.value)
    }
    return { level: "team", team: "ALL", kind, annual, quarters, months }
  }

  return {
    rows: [aggregate("goal"), aggregate("status")],
    members: {},  // No member info in DSH; KPI parser provides member names.
  }
}
