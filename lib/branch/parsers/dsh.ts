import type { FormattedCell } from "@/lib/branch/google-sheets"

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

export interface DshBreakdownRow {
  kind: "goal" | "status"
  category: string   // "Software" | "Hardware"
  status_type: string  // "New" | "Renew"
  channel: string    // "Direct" | "Channel"
  annual: number
  quarters: [number, number, number, number]
  months: Record<string, number>
}

export interface DshOutput { rows: DshRow[]; members: Record<string, string>; breakdown?: DshBreakdownRow[] }

function asNum(v: unknown): number {
  if (v == null) return 0
  const cleaned = typeof v === "number" ? v : Number(String(v).replace(/[¥₩$€£,\s]/g, ""))
  return Number.isFinite(cleaned) ? cleaned : 0
}

const ymRe = /^(\d{4})-(\d{1,2})$/
const monthOnlyRe = /^([1-9]|1[0-2])월?$/

function normalizeMonthHeader(value: unknown, refFy: number): string | null {
  if (value == null) return null
  const s = String(value).trim()
  const ym = s.match(ymRe)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, "0")}`
  const mo = s.match(monthOnlyRe)
  if (!mo) return null
  const month = parseInt(mo[1], 10)
  const year = month >= 4 ? refFy : refFy + 1
  return `${year}-${String(month).padStart(2, "0")}`
}

function asText(v: unknown): string {
  return String(v ?? "").trim()
}

function normalizeTeam(v: unknown): string | null {
  const text = asText(v).toUpperCase()
  if (text === "TEAM KR" || text === "ALL") return "ALL"
  if (text === "BD") return "BD"
  if (text === "MK" || text === "MKT") return "MKT"
  if (text === "CSM") return "CSM"
  return null
}

function readNumericRow(grid: FormattedCell[][], rowIdx: number, monthMap: Array<{ idx: number; ym: string }>) {
  const row = grid[rowIdx] ?? []
  const months: Record<string, number> = {}
  for (const { idx, ym } of monthMap) months[ym] = asNum(row[idx]?.value)
  return {
    annual: asNum(row[DSH_COLS.annual]?.value),
    quarters: [
      asNum(row[DSH_COLS.q1]?.value),
      asNum(row[DSH_COLS.q1 + 1]?.value),
      asNum(row[DSH_COLS.q1 + 2]?.value),
      asNum(row[DSH_COLS.q4]?.value),
    ] as [number, number, number, number],
    months,
  }
}

function addNumericRow(target: DshRow, source: ReturnType<typeof readNumericRow>) {
  target.annual += source.annual
  for (let i = 0; i < 4; i++) target.quarters[i] += source.quarters[i]
  for (const [ym, value] of Object.entries(source.months)) {
    target.months[ym] = (target.months[ym] ?? 0) + value
  }
}

export function parseDsh(grid: FormattedCell[][], refFy: number): DshOutput {
  if (grid.length < 2) return { rows: [], members: {}, breakdown: [] }
  const headers = grid[0] ?? []
  const monthMap: Array<{ idx: number; ym: string }> = []
  for (let i = DSH_COLS.monthStart; i < headers.length; i++) {
    const ym = normalizeMonthHeader(headers[i]?.value, refFy)
    if (ym) monthMap.push({ idx: i, ym })
  }

  const rows: DshRow[] = []
  const members: Record<string, string> = {}
  const teamOrder: string[] = []

  const getTeamRow = (team: string, kind: DshKind): DshRow => {
    let row = rows.find((r) => r.level === "team" && r.team === team && r.kind === kind)
    if (!row) {
      const months: Record<string, number> = {}
      for (const { ym } of monthMap) months[ym] = 0
      row = { level: "team", team, kind, annual: 0, quarters: [0, 0, 0, 0], months }
      rows.push(row)
      if (kind === "goal" && team !== "ALL" && !teamOrder.includes(team)) teamOrder.push(team)
    }
    return row
  }

  let currentTeam: string | null = null
  let currentKind: DshKind | null = null
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const labelTeam = normalizeTeam(row[0]?.value)
    const label = asText(row[0]?.value)
    if (label) {
      currentTeam = labelTeam
      currentKind = null
    }
    if (!currentTeam) continue

    const section = asText(row[DSH_COLS.section]?.value).toLowerCase()
    if (section === "goal" || section === "status") currentKind = section
    else if (section && !["software", "hardware"].includes(section)) currentKind = null

    if (!currentKind) continue
    const source = readNumericRow(grid, r, monthMap)
    if (source.annual === 0 && source.quarters.every((q) => q === 0) && Object.values(source.months).every((m) => m === 0)) continue
    addNumericRow(getTeamRow(currentTeam, currentKind), source)
  }

  const memberRows: DshRow[] = []
  for (let r = 1; r < grid.length; r++) {
    const member = asText(grid[r]?.[3]?.value)
    const kindText = asText(grid[r]?.[4]?.value).toLowerCase()
    if (!member || (kindText !== "goal" && kindText !== "status")) continue
    const numeric = readNumericRow(grid, r, monthMap)
    memberRows.push({ level: "member", team: "", member, kind: kindText, ...numeric })
  }

  let teamIdx = 0
  let assignedAnnual = 0
  for (const row of memberRows.filter((r) => r.kind === "goal")) {
    const team = teamOrder[teamIdx]
    if (!team || !row.member) continue
    members[row.member] = team
    assignedAnnual += row.annual
    const teamGoal = rows.find((r) => r.level === "team" && r.team === team && r.kind === "goal")?.annual ?? 0
    if (teamGoal > 0 && Math.abs(assignedAnnual - teamGoal) < 1) {
      teamIdx += 1
      assignedAnnual = 0
    }
  }

  for (const row of memberRows) {
    if (!row.member) continue
    const team = members[row.member]
    if (!team) continue
    rows.push({ ...row, team })
  }

  // Second pass: extract breakdown rows (Goal/Status × Software/Hardware × New/Renew × Direct/Channel)
  const breakdown: DshBreakdownRow[] = []
  let bKind: "goal" | "status" | null = null
  let prevCategory: string | null = null
  let prevStatus: string | null = null
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] ?? []
    const section = String(row[DSH_COLS.section]?.value ?? "").trim().toLowerCase()
    if (section === "goal" || section === "status") {
      bKind = section as "goal" | "status"
    } else if (section && !["software", "hardware", "new", "renew", "direct", "channel"].includes(section)) {
      bKind = null
    }
    if (!bKind) continue
    const cat: string = String(row[2]?.value ?? "").trim() || prevCategory || ""
    const stat: string = String(row[3]?.value ?? "").trim() || prevStatus || ""
    const chan = String(row[4]?.value ?? "").trim()
    if (cat) prevCategory = cat
    if (stat) prevStatus = stat
    if (!cat || !stat || !chan) continue
    if (!["Software", "Hardware"].includes(cat)) continue
    if (!["New", "Renew"].includes(stat)) continue
    if (!["Direct", "Channel"].includes(chan)) continue
    const bMonths: Record<string, number> = {}
    for (const { idx, ym } of monthMap) bMonths[ym] = asNum(row[idx]?.value)
    breakdown.push({
      kind: bKind,
      category: cat,
      status_type: stat,
      channel: chan,
      annual: asNum(row[DSH_COLS.annual]?.value),
      quarters: [
        asNum(row[DSH_COLS.q1]?.value),
        asNum(row[DSH_COLS.q1 + 1]?.value),
        asNum(row[DSH_COLS.q1 + 2]?.value),
        asNum(row[DSH_COLS.q4]?.value),
      ] as [number, number, number, number],
      months: bMonths,
    })
  }

  return { rows, members, breakdown }
}
