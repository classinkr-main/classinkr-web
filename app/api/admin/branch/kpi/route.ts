import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseDsh, DSH_RANGE } from "@/lib/branch/parsers/dsh"
import { parseKpi, KPI_RANGE, KPI_METRICS } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { teamPacing, memberPacing, listMembersByTeam } from "@/lib/branch/computations/pacing"
import { fyOf } from "@/lib/branch/fiscal"

const readDsh = unstable_cache(
  async () => parseDsh(await readRangeWithFormat(envSheetId("dashboard"), DSH_RANGE), fyOf(new Date())),
  ["branch-dsh"], { revalidate: 60, tags: ["branch-dsh"] },
)
const readKpi = unstable_cache(
  async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const team = (url.searchParams.get("team") ?? "ALL") as "ALL"|"BD"|"MKT"|"CSM"
  const period = (url.searchParams.get("period") ?? "Q") as "M"|"Q"|"Y"
  const now = new Date()
  try {
    const [dsh, kpi, deals] = await Promise.all([readDsh(), readKpi(), listBranchRevDeals()])
    const members = listMembersByTeam(dsh, team).filter((m) => kpi.find((k) => k.member === m))
    const teams = team === "ALL" ? ["BD","MKT","CSM"] : [team]
    const teamSummaries = teams.map((t) => ({ team: t, ...teamPacing(dsh, t, period, now) }))
    const memberSummaries = members.map((m) => {
      const p = memberPacing(dsh, m, period, now)
      const k = kpi.find((row) => row.member === m)!
      const dealsOf = deals.filter((d) => d.manager === m)
      const confirmed = dealsOf
        .filter((d) => d.first_payment)
        .reduce((s, d) => s + Object.entries(d.monthly_payments).reduce((a, [ym, v]) => a + (d.monthly_red[ym] ? Number(v) : 0), 0), 0)
      const newRenew = dealsOf.reduce((acc, d) => {
        if (d.status === "New") acc.new += 1
        else if (d.status === "Renew") acc.renew += 1
        return acc
      }, { new: 0, renew: 0 })
      return {
        member: m, team: p.team,
        goal: p.goal, status: p.status, achievement_pct: p.pacing_pct,
        confirmed,
        deals_total: dealsOf.length,
        deals_confirmed: dealsOf.filter((d) => d.first_payment).length,
        new_renew: newRenew,
        kpi: KPI_METRICS.reduce((acc, mt) => ({ ...acc, [mt]: k.pairs[mt] }), {} as Record<string, { goal: number; actual: number }>),
      }
    })
    return NextResponse.json({ teams: teamSummaries, members: memberSummaries })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
