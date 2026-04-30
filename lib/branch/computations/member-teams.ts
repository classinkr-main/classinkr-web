import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export function deriveMemberTeams(deals: BranchRevDeal[]): Record<string, string> {
  const tally = new Map<string, Map<string, number>>()
  for (const d of deals) {
    const m = normalizeBranchMemberName(d.manager)
    if (!m || !d.team) continue
    if (!tally.has(m)) tally.set(m, new Map())
    const t = tally.get(m)!
    t.set(d.team, (t.get(d.team) ?? 0) + 1)
  }
  const out: Record<string, string> = {}
  for (const [member, teams] of tally) {
    let bestTeam: string | null = null
    let bestCount = 0
    for (const [team, count] of teams) {
      if (count > bestCount) { bestCount = count; bestTeam = team }
    }
    if (bestTeam) out[member] = bestTeam
  }
  return out
}

export function listMembersByTeamFromDeals(deals: BranchRevDeal[], team: string | "ALL"): string[] {
  const map = deriveMemberTeams(deals)
  if (team === "ALL") return Object.keys(map)
  return Object.entries(map).filter(([, t]) => t === team).map(([m]) => m)
}
