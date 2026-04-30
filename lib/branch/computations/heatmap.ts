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
  region: string
  // Sum of contract_target across deals in the region. Lifetime goal — not
  // scaled by period; the period bites into the numerator instead.
  target: number
  revenue: number
  // Future-month estimate. Past/current confirmed go into revenue; future
  // months and past-non-confirmed months go into projected.
  projected: number
  expected: number
  progress: number
  status: "good" | "warning" | "critical"
  velocity: number
  deals_count: number
  confirmed_count: number
  open_target: number
  top_customers: RegionTopCustomer[]
}

function statusOf(p: number): "good" | "warning" | "critical" {
  if (p >= 95) return "good"
  if (p >= 75) return "warning"
  return "critical"
}

function inScope(ym: string, scope: Period, now: Date): boolean {
  const fy = fyOf(now)
  const m = Number(ym.slice(5, 7))
  const y = Number(ym.slice(0, 4))
  const fyOfYm = m >= 4 ? y : y - 1
  if (fyOfYm !== fy) return false
  if (scope === "Y") return true
  if (scope === "M") return ym === ymKey(now)
  return fiscalQuarter(m) === fiscalQuarter(now.getUTCMonth() + 1)
}

function compareYm(ym: string, now: Date): number {
  const nowKey = ymKey(now)
  return ym < nowKey ? -1 : ym > nowKey ? 1 : 0
}

export function computeHeatmap(deals: BranchRevDeal[], scope: Period, now: Date, teamFilter?: string): RegionRow[] {
  const filtered = teamFilter && teamFilter !== "ALL" ? deals.filter((d) => d.team === teamFilter) : deals
  const byRegion = new Map<string, {
    target: number
    revenue: number
    projected: number
    deals_count: number
    confirmed_count: number
    open_target: number
    customers: Map<string, RegionTopCustomer>
  }>()

  const ensure = (region: string) => {
    let acc = byRegion.get(region)
    if (!acc) {
      acc = { target: 0, revenue: 0, projected: 0, deals_count: 0, confirmed_count: 0, open_target: 0, customers: new Map() }
      byRegion.set(region, acc)
    }
    return acc
  }

  for (const d of filtered) {
    const region = d.region ?? "미정"
    const acc = ensure(region)
    const lifetimeTarget = Number(d.contract_target ?? 0)
    acc.target += lifetimeTarget
    acc.deals_count += 1

    if (!d.first_payment) acc.open_target += lifetimeTarget

    const hasRedFlags = Object.keys(d.monthly_red).length > 0
    let dealRevenue = 0
    let dealProjected = 0
    let countedAsConfirmed = false

    for (const [ym, amtRaw] of Object.entries(d.monthly_payments)) {
      const amt = Number(amtRaw)
      if (!Number.isFinite(amt) || amt === 0) continue
      if (!inScope(ym, scope, now)) continue

      const isFuture = compareYm(ym, now) > 0

      if (isFuture) {
        // Future months are always projection regardless of any flag.
        dealProjected += amt
        continue
      }
      if (!d.first_payment) {
        // Past/current with no first_payment — treat as projection.
        dealProjected += amt
        continue
      }
      // first_payment is set. Sheet without red-flag convention: every
      // monthly_payment counts as confirmed (matches the documented fallback
      // in branch-dashboard-development-log.md). Sheet with red-flag
      // convention: only red-flagged months are confirmed.
      if (!hasRedFlags || d.monthly_red[ym]) {
        dealRevenue += amt
        countedAsConfirmed = true
      } else {
        dealProjected += amt
      }
    }

    acc.revenue += dealRevenue
    acc.projected += dealProjected
    if (countedAsConfirmed) acc.confirmed_count += 1

    const customerKey = d.customer_name || `row-${d.sheet_row}`
    const current = acc.customers.get(customerKey)
    if (current) {
      current.target += lifetimeTarget
      current.revenue += dealRevenue + dealProjected
      current.first_payment = current.first_payment ?? d.first_payment
    } else {
      acc.customers.set(customerKey, {
        customer: d.customer_name,
        manager: d.manager,
        team: d.team,
        status: d.status,
        first_payment: d.first_payment,
        target: lifetimeTarget,
        // Top-customer "revenue" represents expected value (confirmed + projection)
        // so deals weighted toward future months still rank meaningfully.
        revenue: dealRevenue + dealProjected,
      })
    }
  }

  const rows: RegionRow[] = []
  for (const [region, acc] of byRegion) {
    const expected = acc.revenue + acc.projected
    const progress = acc.target > 0 ? (expected / acc.target) * 100 : 0
    rows.push({
      region,
      target: acc.target,
      revenue: acc.revenue,
      projected: acc.projected,
      expected,
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
    const qStartMonth = q === 4 ? 1 : q * 3 + 1
    const monthsInto = (monthIdx - qStartMonth + 12) % 12
    const dayInQ = Math.max(1, monthsInto * 30 + now.getUTCDate())
    const qPct = Math.min(100, (dayInQ / 90) * 100)
    rows.forEach((r) => { r.velocity = qPct > 0 ? r.progress / qPct : 0 })
  }
  return rows.sort((a, b) => b.target - a.target)
}
