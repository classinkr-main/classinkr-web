import type { FormattedCell } from "@/lib/branch/google-sheets"
import { normalizeMonthHeader } from "./rev"

export const DSH_RANGE = "DSH!A1:V200"
export const DSH_COLS = { label: 0, kind: 4, annual: 5, q1: 6, q4: 9, monthStart: 10 } as const

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

const TEAM_HEADERS = ["BD", "MKT", "CSM"]

function asNum(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function parseDsh(grid: FormattedCell[][], refFy: number): DshOutput {
  if (grid.length === 0) return { rows: [], members: {} }
  const headers = grid[0] ?? []
  const monthMap: Array<{ idx: number; ym: string }> = []
  for (let i = DSH_COLS.monthStart; i < headers.length; i++) {
    const ym = normalizeMonthHeader(headers[i]?.value, refFy)
    if (ym) monthMap.push({ idx: i, ym })
  }

  const rows: DshRow[] = []
  const members: Record<string, string> = {}
  let currentTeam: string | null = null

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const labelRaw = String(row[DSH_COLS.label]?.value ?? "").trim()
    const labelOriginal = String(row[DSH_COLS.label]?.value ?? "")
    const indented = labelOriginal.startsWith("  ") || labelOriginal.startsWith("\t")
    if (!labelRaw) continue
    const kind = String(row[DSH_COLS.kind]?.value ?? "").toLowerCase().trim()
    if (kind !== "goal" && kind !== "status") continue
    const k = kind as DshKind
    const months: Record<string, number> = {}
    for (const { idx, ym } of monthMap) months[ym] = asNum(row[idx]?.value)
    const base = {
      kind: k,
      annual: asNum(row[DSH_COLS.annual]?.value),
      quarters: [asNum(row[DSH_COLS.q1]?.value), asNum(row[DSH_COLS.q1+1]?.value), asNum(row[DSH_COLS.q1+2]?.value), asNum(row[DSH_COLS.q4]?.value)] as [number, number, number, number],
      months,
    }
    if (TEAM_HEADERS.includes(labelRaw) && !indented) {
      currentTeam = labelRaw
      rows.push({ level: "team", team: currentTeam, ...base })
    } else if (currentTeam) {
      rows.push({ level: "member", team: currentTeam, member: labelRaw, ...base })
      members[labelRaw] = currentTeam
    }
  }
  return { rows, members }
}
