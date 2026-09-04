import { NextRequest, NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { shareInFlightByArgs } from "@/lib/server/share-in-flight"
import { BRANCH_READ_ADMIN_API_ROLES, verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { selectKpiRows, KPI_METRICS } from "@/lib/branch/parsers/kpi"
import { readRevDealsPreferActive } from "@/lib/branch/read-rev-deals"
import { readDshPreferDb, readKpiBlocksPreferDb } from "@/lib/branch/read-dsh-kpi"
import { listMembersByTeam, memberPacing, teamPacing } from "@/lib/branch/computations/pacing"
import { fyOf, resolvePeriodDate } from "@/lib/branch/fiscal"
import { BRANCH_DSH_CACHE_TAG, BRANCH_KPI_CACHE_TAG } from "@/lib/repositories/branch-dsh-kpi-mirror"
import { BRANCH_REV_DEALS_CACHE_TAG } from "@/lib/repositories/branch-deals"
import { SALES_LEDGER_IMPORTS_CACHE_TAG } from "@/lib/repositories/sales-ledger-imports"

type BranchTeam = "ALL" | "BD" | "MKT" | "CSM"
type BranchPeriod = "M" | "Q" | "Y"

const BRANCH_TEAMS = new Set<BranchTeam>(["ALL", "BD", "MKT", "CSM"])
const BRANCH_PERIODS = new Set<BranchPeriod>(["M", "Q", "Y"])

function readTeamParam(url: URL): BranchTeam | NextResponse {
  const team = url.searchParams.get("team") ?? "ALL"
  if (BRANCH_TEAMS.has(team as BranchTeam)) return team as BranchTeam
  return NextResponse.json({ error: "Invalid team query" }, { status: 400 })
}

function readPeriodParam(url: URL): BranchPeriod | NextResponse {
  const period = url.searchParams.get("period") ?? "Q"
  if (BRANCH_PERIODS.has(period as BranchPeriod)) return period as BranchPeriod
  return NextResponse.json({ error: "Invalid period query" }, { status: 400 })
}

// DSH/KPI/REV 모두 DB-우선 사다리(액티브 임포트 → 시트 미러 → 라이브 시트 초기 폴백).
// 계층별 캐시는 read-dsh-kpi.ts / branch-dsh-kpi-mirror.ts / read-rev-deals.ts 안에 있다.
const readDsh = (fy: number) => readDshPreferDb(fy)
const readKpiBlocks = (fy: number) => readKpiBlocksPreferDb(fy)

async function readRevDeals(fy: number, team: BranchTeam) {
  return readRevDealsPreferActive(fy, { team })
}

// pickValue(lib/branch/computations/pacing.ts)·selectKpiRows(lib/branch/parsers/kpi.ts)는
// now의 연·월만 본다(일자·시각 미사용) — 캐시 키를 "YYYY-MM"으로 낮춰도 오늘 실제 시각을 쓸
// 때와 결과가 완전히 같다. now를 그대로(밀리초 포함) 인자로 넘기면 매 요청 값이 달라 캐시
// 키가 절대 재사용되지 않는다.
function monthKeyOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}
function dateFromMonthKey(key: string): Date {
  const [year, month] = key.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, 1))
}

/**
 * 콜드 Fluid 인스턴스 재계산 방지 — DSH/KPI/REV 각 소스는 이미 다층 unstable_cache지만,
 * 이 조립(멤버별 pacing 계산·KPI 행 매칭·딜 매니저 그룹핑)엔 캐시가 없어 소스가 전부 히트여도
 * 매 요청 재계산 + 3개 소스 각각의 캐시 조회 왕복(+ DSH/KPI는 액티브 임포트→미러 사다리를
 * 매번 다시 탄다)이 겹쳤다. 태그는 새로 만들지 않고 하위 4개 소스가 이미 쓰는 태그를 그대로
 * 재사용한다 — 액티브 임포트 재캡처·DSH/KPI 미러 교체·REV 미러 교체 중 무엇이 일어나도 이
 * 조립 캐시가 함께 무효화된다.
 */
async function assembleBranchKpiPayload(team: BranchTeam, period: BranchPeriod, monthKey: string) {
  const now = dateFromMonthKey(monthKey)
  const teams = team === "ALL" ? ["BD", "MKT", "CSM"] : [team]
  const fy = fyOf(now)
  const [dsh, kpiBlocks, deals] = await Promise.all([readDsh(fy), readKpiBlocks(fy), readRevDeals(fy, team)])
  const kpiRows = selectKpiRows(kpiBlocks, period, now)
  const kpiRowsByMember = new Map(kpiRows.map((row) => [row.member, row]))
  const dealsByManager = new Map<string, typeof deals>()
  for (const deal of deals) {
    if (!deal.manager) continue
    const managerDeals = dealsByManager.get(deal.manager)
    if (managerDeals) managerDeals.push(deal)
    else dealsByManager.set(deal.manager, [deal])
  }
  const teamSummaries = teams.map((t) => ({ team: t, ...teamPacing(dsh, t, period, now) }))
  const members = listMembersByTeam(dsh, team).map((member) => {
    const pace = memberPacing(dsh, member, period, now)
    const memberDeals = dealsByManager.get(member) ?? []
    const kpiRow = kpiRowsByMember.get(member)
    const kpi = Object.fromEntries(
      KPI_METRICS.map((metric) => [metric, kpiRow?.pairs[metric] ?? { goal: 0, actual: 0 }]),
    )
    return {
      member,
      team: pace.team,
      goal: pace.goal,
      status: pace.status,
      achievement_pct: pace.pacing_pct,
      confirmed: pace.status,
      deals_total: memberDeals.length,
      deals_confirmed: memberDeals.filter((d) => Boolean(d.first_payment)).length,
      new_renew: memberDeals.reduce((acc, d) => {
        if (d.status === "New") acc.new += 1
        else if (d.status === "Renew") acc.renew += 1
        return acc
      }, { new: 0, renew: 0 }),
      kpi,
    }
  })
  return { teams: teamSummaries, members }
}

const getCachedBranchKpiPayload = unstable_cache(
  // 같은 인스턴스의 동시 미스·재검증은 shareInFlightByArgs 로 한 번만 계산한다(unstable_cache 는 인스턴스 안 동시 호출을 합치지 않는다).
  shareInFlightByArgs("branch-kpi-assembled-v1", assembleBranchKpiPayload),
  ["branch-kpi-assembled-v1"],
  {
    revalidate: 60,
    tags: [
      SALES_LEDGER_IMPORTS_CACHE_TAG,
      BRANCH_DSH_CACHE_TAG,
      BRANCH_KPI_CACHE_TAG,
      BRANCH_REV_DEALS_CACHE_TAG,
    ],
  },
)

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req, BRANCH_READ_ADMIN_API_ROLES); if (err) return err
  const url = new URL(req.url)
  const team = readTeamParam(url); if (team instanceof NextResponse) return team
  const period = readPeriodParam(url); if (period instanceof NextResponse) return period
  const now = resolvePeriodDate(period, url.searchParams.get("month"), new Date())
  if (!now) return NextResponse.json({ error: "Invalid month query" }, { status: 400 })
  try {
    const payload = await getCachedBranchKpiPayload(team, period, monthKeyOf(now))
    return adminCachedJson(payload)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
