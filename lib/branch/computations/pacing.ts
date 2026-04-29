import type { DshOutput, DshRow } from "@/lib/branch/parsers/dsh"
import { fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import type { Period } from "./heatmap"

export interface PacingValue { goal: number; status: number; pacing_pct: number }

function pickValue(row: DshRow, scope: Period, now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1]
  return row.months[ymKey(now)] ?? 0
}

export function teamPacing(dsh: DshOutput, team: string, scope: Period, now: Date): PacingValue {
  const goal = dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "goal")
  const status = dsh.rows.find((r) => r.level === "team" && r.team === team && r.kind === "status")
  const g = goal ? pickValue(goal, scope, now) : 0
  const s = status ? pickValue(status, scope, now) : 0
  return { goal: g, status: s, pacing_pct: g > 0 ? (s / g) * 100 : 0 }
}

export function memberPacing(dsh: DshOutput, member: string, scope: Period, now: Date): PacingValue & { team: string | null } {
  const team = dsh.members[member] ?? null
  const goal = dsh.rows.find((r) => r.level === "member" && r.member === member && r.kind === "goal")
  const status = dsh.rows.find((r) => r.level === "member" && r.member === member && r.kind === "status")
  const g = goal ? pickValue(goal, scope, now) : 0
  const s = status ? pickValue(status, scope, now) : 0
  return { team, goal: g, status: s, pacing_pct: g > 0 ? (s / g) * 100 : 0 }
}

export function listMembersByTeam(dsh: DshOutput, team: string | "ALL"): string[] {
  if (team === "ALL") return Object.keys(dsh.members)
  return Object.entries(dsh.members).filter(([, t]) => t === team).map(([m]) => m)
}
