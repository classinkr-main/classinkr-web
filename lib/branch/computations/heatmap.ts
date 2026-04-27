import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { fyOf, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"

export type Period = "M" | "Q" | "Y"
export interface RegionTopCustomer {
  customer: string
  manager: string | null
  team: string | null
  status: string | null
  first_payment: string | null
  target: number
  revenue: number
}

export interface RegionRow {
  region: string; target: number; revenue: number
  progress: number; status: "good" | "warning" | "critical"; velocity: number
  deals_count: number; confirmed_count: number; open_target: number
  top_customers: RegionTopCustomer[]
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
  const byRegion = new Map<string, {
    target: number
    revenue: number
    deals_count: number
    confirmed_count: number
    open_target: number
    customers: Map<string, RegionTopCustomer>
  }>()

  const ensure = (region: string) => {
    let acc = byRegion.get(region)
    if (!acc) {
      acc = { target: 0, revenue: 0, deals_count: 0, confirmed_count: 0, open_target: 0, customers: new Map() }
      byRegion.set(region, acc)
    }
    return acc
  }

  for (const d of filtered) {
    const region = d.region ?? "미정"
    const acc = ensure(region)
    const target = Number(d.contract_target ?? 0)
    acc.target += target
    acc.deals_count += 1

    const hasRedFlags = Object.keys(d.monthly_red).length > 0
    let rev = 0
    if (d.first_payment) {
      for (const [ym, amt] of Object.entries(d.monthly_payments)) {
        if (hasRedFlags && !d.monthly_red[ym]) continue
        if (!inScope(ym, scope, now)) continue
        rev += Number(amt)
      }
      acc.confirmed_count += 1
      acc.revenue += rev
    } else {
      acc.open_target += target
    }

    const customerKey = d.customer_name || `row-${d.sheet_row}`
    const current = acc.customers.get(customerKey)
    if (current) {
      current.target += target
      current.revenue += rev
      current.first_payment = current.first_payment ?? d.first_payment
    } else {
      acc.customers.set(customerKey, {
        customer: d.customer_name,
        manager: d.manager,
        team: d.team,
        status: d.status,
        first_payment: d.first_payment,
        target,
        revenue: rev,
      })
    }
  }
  const rows: RegionRow[] = []
  for (const [region, acc] of byRegion) {
    const { target, revenue } = acc
    const progress = target > 0 ? (revenue / target) * 100 : 0
    rows.push({
      region,
      target,
      revenue,
      progress,
      status: statusOf(progress),
      velocity: 0,
      deals_count: acc.deals_count,
      confirmed_count: acc.confirmed_count,
      open_target: acc.open_target,
      top_customers: [...acc.customers.values()]
        .filter((customer) => customer.target > 0 || customer.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue || b.target - a.target)
        .slice(0, 5),
    })
  }
  if (scope === "Q") {
    const monthIdx = now.getUTCMonth() + 1
    const q = fiscalQuarter(monthIdx)
    const qStartMonth = q === 4 ? 1 : q * 3 + 1   // Q1=4, Q2=7, Q3=10, Q4=1
    const monthsInto = (monthIdx - qStartMonth + 12) % 12
    const dayInQ = Math.max(1, monthsInto * 30 + now.getUTCDate())
    const qPct = Math.min(100, (dayInQ / 90) * 100)
    rows.forEach((r) => { r.velocity = qPct > 0 ? r.progress / qPct : 0 })
  }
  return rows.sort((a, b) => b.target - a.target)
}
