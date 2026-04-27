import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { fyOf, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"

export type Period = "M" | "Q" | "Y"
export interface RegionRow {
  region: string; target: number; revenue: number
  progress: number; status: "good" | "warning" | "critical"; velocity: number
}

function statusOf(p: number): "good"|"warning"|"critical" {
  if (p >= 95) return "good"; if (p >= 75) return "warning"; return "critical"
}

function inScope(ym: string, scope: Period, now: Date): boolean {
  const fy = fyOf(now); const m = Number(ym.slice(5, 7)); const y = Number(ym.slice(0, 4))
  const fyOfYm = m >= 4 ? y : y - 1
  if (fyOfYm !== fy) return false
  if (scope === "Y") return true
  if (scope === "M") return ym === ymKey(now)
  return fiscalQuarter(m) === fiscalQuarter(now.getUTCMonth() + 1)
}

export function computeHeatmap(deals: BranchRevDeal[], scope: Period, now: Date, teamFilter?: string): RegionRow[] {
  const filtered = teamFilter && teamFilter !== "ALL" ? deals.filter((d) => d.team === teamFilter) : deals
  const targets = new Map<string, number>()
  const revenues = new Map<string, number>()
  for (const d of filtered) {
    const region = d.region ?? "미정"
    targets.set(region, (targets.get(region) ?? 0) + Number(d.contract_target ?? 0))
    if (!d.first_payment) continue
    let rev = 0
    for (const [ym, amt] of Object.entries(d.monthly_payments)) {
      if (!d.monthly_red[ym]) continue
      if (!inScope(ym, scope, now)) continue
      rev += Number(amt)
    }
    if (rev) revenues.set(region, (revenues.get(region) ?? 0) + rev)
  }
  const rows: RegionRow[] = []
  for (const [region, target] of targets) {
    const revenue = revenues.get(region) ?? 0
    const progress = target > 0 ? (revenue / target) * 100 : 0
    rows.push({ region, target, revenue, progress, status: statusOf(progress), velocity: 0 })
  }
  if (scope === "Q") {
    const monthIdx = now.getUTCMonth() + 1
    const qStartMonth = (Math.floor((monthIdx - 1 - 3 + 12) % 12 / 3)) * 3 + 4
    const dayInQ = Math.max(1, (now.getUTCMonth() + 1 - qStartMonth) * 30 + now.getUTCDate())
    const qPct = Math.min(100, (dayInQ / 90) * 100)
    rows.forEach((r) => { r.velocity = qPct > 0 ? r.progress / qPct : 0 })
  }
  return rows.sort((a, b) => b.target - a.target)
}
