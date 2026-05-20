import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { unstable_cache } from "next/cache"
import { readRangeWithFormat, envSheetId } from "@/lib/branch/google-sheets"
import { parseKpi, KPI_RANGE } from "@/lib/branch/parsers/kpi"
import { listBranchRevDeals } from "@/lib/repositories/branch-deals"
import { fyOf, fiscalQuarter } from "@/lib/branch/fiscal"
import { buildManagerInsightInput } from "@/lib/branch/insights/manager-input-builder"
import { callManagerInsight } from "@/lib/branch/insights/manager-runner"
import { deriveMemberTeams } from "@/lib/branch/computations/member-teams"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

type InsightScope = "M" | "Q" | "Y"

const INSIGHT_SCOPES = new Set<InsightScope>(["M", "Q", "Y"])

const readKpi = unstable_cache(
  async () => parseKpi(await readRangeWithFormat(envSheetId("dashboard"), KPI_RANGE)),
  ["branch-kpi"], { revalidate: 60, tags: ["branch-kpi"] },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req); if (err) return err
  const url = new URL(req.url)
  const manager = normalizeBranchMemberName(url.searchParams.get("name"))
  if (!manager) return NextResponse.json({ error: "name query required" }, { status: 400 })
  const rawScope = url.searchParams.get("scope") ?? "Q"
  if (!INSIGHT_SCOPES.has(rawScope as InsightScope)) {
    return NextResponse.json({ error: "Invalid scope query" }, { status: 400 })
  }
  const scope = rawScope as InsightScope

  try {
    const now = new Date()
    const [allDeals, kpiRows] = await Promise.all([listBranchRevDeals(), readKpi()])
    const deals = allDeals.filter((d) => d.manager === manager)
    if (deals.length === 0) return NextResponse.json({ error: `매니저 "${manager}" 의 딜 데이터 없음` }, { status: 404 })
    const kpiRow = kpiRows.find((r) => r.member === manager) ?? null
    const memberTeams = deriveMemberTeams(allDeals)
    const team = memberTeams[manager] ?? null

    const fy = fyOf(now)
    const q = fiscalQuarter(now.getUTCMonth() + 1)
    const fiscalPeriod = `FY${fy}-Q${q}`

    const input = buildManagerInsightInput({ manager, team, scope, now, fiscalPeriod, deals, kpiRow })
    const { result, model } = await callManagerInsight(input)
    return NextResponse.json({ manager, team, fiscalPeriod, scope, input_summary: input.metrics, result, model })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
