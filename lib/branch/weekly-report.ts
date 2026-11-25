import "server-only"
// KR Team 본사 주간 보고 — Compass 구획 조립 정본. 화면(GET /api/admin/branch/weekly-report)과
// AI 인사이트 입력(lib/branch/insights/runner.ts)이 같은 함수를 써서 보고서 숫자와 AI 문장이 어긋나지 않는다.
import { getBusinessDateParts, toBusinessStorageDateTime } from "@/lib/business-time"
import { readCompassKrTeam } from "@/lib/compass/kr-team"
import { buildCompassRangeFunnel, UNASSIGNED_OWNER_LABEL, type CompassRangeFunnel } from "@/lib/compass/summary"
import type { CompassLeadSliceRow } from "@/lib/compass/bridge"
import { deriveMemberTeams } from "@/lib/branch/computations/member-teams"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"
import { branchManagerMatches } from "@/lib/branch/personal-scope"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { fiscalQuarter } from "@/lib/branch/fiscal"
import type {
  BranchWeeklyCompassReport,
  WeeklyCompassEvaluation,
  WeeklyCompassFunnel,
  WeeklyKaSection,
  WeeklyReportWeek,
} from "./weekly-report-contract"

const OWNER_LIMIT = 8
const KA_CUSTOMER_LIMIT = 8
const LOST_REASON_LIMIT = 3

function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** ISO 8601 주 번호(월요일 시작). 연도는 그 주 목요일이 속한 해. */
export function isoWeekLabel(monday: string) {
  const thursday = new Date(Date.parse(`${shiftDate(monday, 3)}T00:00:00Z`))
  const year = thursday.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  const week = Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1
  return `${year} W${String(week).padStart(2, "0")}`
}

function week(monday: string): WeeklyReportWeek {
  const nextMonday = shiftDate(monday, 7)
  return {
    label: isoWeekLabel(monday),
    startDate: monday,
    endDate: shiftDate(monday, 6),
    since: toBusinessStorageDateTime(`${monday}T00:00`),
    until: toBusinessStorageDateTime(`${nextMonday}T00:00`),
  }
}

/** 보고 주 = 오늘(KST)이 속한 주의 바로 앞 주(월~일), 비교 주 = 그 앞 주. 진행 중인 주는 쓰지 않는다. */
export function resolveReportWeeks(now: Date): { week: WeeklyReportWeek; previousWeek: WeeklyReportWeek } {
  const today = getBusinessDateParts(now).date
  const dow = new Date(Date.parse(`${today}T00:00:00Z`)).getUTCDay() // 0=일
  const thisMonday = shiftDate(today, -((dow + 6) % 7))
  return { week: week(shiftDate(thisMonday, -7)), previousWeek: week(shiftDate(thisMonday, -14)) }
}

function ownerOf(row: Pick<CompassLeadSliceRow, "caller" | "owner">): string | null {
  const raw = row.caller?.trim() || row.owner?.trim()
  return raw ? normalizeBranchMemberName(raw) : null
}

function foldFunnel(current: CompassRangeFunnel, previous: CompassRangeFunnel, includeUnassigned: boolean): WeeklyCompassFunnel {
  if (current.down || previous.down) {
    return {
      state: "down", error: current.error ?? previous.error, truncated: false,
      inflow: { current: 0, previous: 0 }, stages: [], lost: { current: 0, previous: 0 }, lostReasons: [], owners: [], unassigned: null,
    }
  }
  const previousByKey = new Map(previous.stages.map((stage) => [stage.key, stage.count]))
  const owners = current.byOwner
    .filter((row) => row.owner !== UNASSIGNED_OWNER_LABEL)
    .slice(0, OWNER_LIMIT)
    .map((row) => ({ name: normalizeBranchMemberName(row.owner) ?? row.owner, inflow: row.total, demo: row.demo, bd: row.bd, won: row.won, lost: row.lost }))
  const unassignedRow = current.byOwner.find((row) => row.owner === UNASSIGNED_OWNER_LABEL)
  return {
    state: "ready",
    truncated: current.truncated || previous.truncated,
    inflow: { current: current.inflowTotal, previous: previous.inflowTotal },
    // 첫 단계(유입)는 inflow와 같은 값이라 뺀다.
    stages: current.stages.slice(1).map((stage) => ({ key: stage.key, label: stage.label, current: stage.count, previous: previousByKey.get(stage.key) ?? 0 })),
    lost: { current: current.lost, previous: previous.lost },
    lostReasons: current.lostReasons.slice(0, LOST_REASON_LIMIT).map((reason) => ({ label: reason.label, count: reason.count })),
    owners,
    unassigned: includeUnassigned ? unassignedRow?.total ?? 0 : null,
  }
}

/** 오늘(KST)이 속한 회계 분기(4월 시작)의 월 키 목록. summary-payload의 분기 월과 같은 규칙. */
export function currentFiscalQuarterMonths(now: Date): { label: string; months: string[] } {
  const [year, month] = getBusinessDateParts(now).month.split("-").map(Number)
  const fy = month >= 4 ? year : year - 1
  const q = fiscalQuarter(month)
  const qMonths = q === 1 ? [4, 5, 6] : q === 2 ? [7, 8, 9] : q === 3 ? [10, 11, 12] : [1, 2, 3]
  return { label: `FY${fy}-Q${q}`, months: qMonths.map((m) => `${m >= 4 ? fy : fy + 1}-${String(m).padStart(2, "0")}`) }
}

/** KA 고객 이번 분기 확정·미확정 — 팀·개인 범위는 REV 딜의 team·manager로 거른다. */
export function buildKaSection(deals: readonly BranchRevDeal[], { now, team, manager }: { now: Date; team: string; manager?: string | null }): WeeklyKaSection {
  const quarter = currentFiscalQuarterMonths(now)
  const byCustomer = new Map<string, { customer: string; manager: string | null; team: string | null; confirmed: number; open: number; deals: number }>()
  for (const deal of deals) {
    if ((deal.importance ?? "").trim().toUpperCase() !== "KA") continue
    if (manager ? !branchManagerMatches(deal.manager, manager) : team !== "ALL" && deal.team !== team) continue
    let confirmed = 0
    let planned = 0
    for (const ym of quarter.months) {
      const amount = Number(deal.monthly_payments?.[ym] ?? 0)
      if (!Number.isFinite(amount) || amount === 0) continue
      planned += amount
      confirmed += confirmedMonthAmount(deal, ym, amount)
    }
    if (planned === 0 && confirmed === 0) continue
    const key = deal.customer_name.trim().toLowerCase()
    const row = byCustomer.get(key) ?? { customer: deal.customer_name.trim(), manager: normalizeBranchMemberName(deal.manager), team: deal.team, confirmed: 0, open: 0, deals: 0 }
    row.confirmed += confirmed
    row.open += planned - confirmed
    row.deals += 1
    byCustomer.set(key, row)
  }
  const rows = [...byCustomer.values()].map((row) => ({ ...row, total: row.confirmed + row.open }))
  return {
    quarter: quarter.label,
    months: quarter.months,
    confirmed: rows.reduce((sum, row) => sum + row.confirmed, 0),
    open: rows.reduce((sum, row) => sum + row.open, 0),
    customerCount: rows.length,
    customers: rows.sort((a, b) => b.total - a.total || a.customer.localeCompare(b.customer, "ko")).slice(0, KA_CUSTOMER_LIMIT),
  }
}

export async function buildBranchWeeklyCompassReport({ now = new Date(), team, manager, deals }: {
  now?: Date
  team: string
  manager?: string | null
  /** 담당→팀 폴백 매핑용(Compass 명단이 없을 때). */
  deals: readonly BranchRevDeal[]
}): Promise<BranchWeeklyCompassReport> {
  const weeks = resolveReportWeeks(now)
  const month = weeks.week.endDate.slice(0, 7)
  const scoped = Boolean(manager) || team !== "ALL"

  const krTeam = await readCompassKrTeam(month)
  // 담당→팀: Compass 월간 명단이 정본, 없으면 REV 장부의 담당 팀(최빈값).
  let teamSource: BranchWeeklyCompassReport["scope"]["teamSource"] = null
  const memberTeam = new Map<string, string>()
  if (krTeam.state === "ready") {
    teamSource = "compass_roster"
    for (const person of krTeam.snapshot.roster) {
      const name = normalizeBranchMemberName(person.name)
      if (name && person.team) memberTeam.set(name.toLowerCase(), person.team)
    }
  } else {
    teamSource = "rev_ledger"
    for (const [name, value] of Object.entries(deriveMemberTeams([...deals]))) memberTeam.set(name.toLowerCase(), value)
  }

  const rowFilter = !scoped ? undefined : (row: CompassLeadSliceRow) => {
    const owner = ownerOf(row)
    if (!owner) return false
    if (manager) return branchManagerMatches(owner, manager)
    return memberTeam.get(owner.toLowerCase()) === team
  }

  const [current, previous] = await Promise.all([
    buildCompassRangeFunnel(weeks.week, { rowFilter }),
    buildCompassRangeFunnel(weeks.previousWeek, { rowFilter }),
  ])

  let evaluation: WeeklyCompassEvaluation = { state: krTeam.state, month, basis: null, people: [] }
  if (krTeam.state === "ready") {
    const people = krTeam.snapshot.kpi.report.people
      .map((person) => {
        const name = normalizeBranchMemberName(person.name) ?? person.name
        const weakest = person.items
          .filter((item) => item.kind === "quant" && item.rate != null)
          .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
          .slice(0, 2)
          .map((item) => ({ label: item.label, rate: Math.round(item.rate ?? 0), actual: item.actual, target: item.target, unit: item.unit }))
        return { name, team: memberTeam.get(name.toLowerCase()) ?? null, rate: Math.round(person.rate), grade: person.grade, weakest }
      })
      .filter((person) => manager ? branchManagerMatches(person.name, manager) : team === "ALL" || person.team === team)
      .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name, "ko"))
    evaluation = { state: "ready", month, basis: krTeam.snapshot.kpi.basis, people }
  }

  return {
    generatedAt: now.toISOString(),
    week: weeks.week,
    previousWeek: weeks.previousWeek,
    scope: { team, manager: manager ?? null, teamSource: scoped ? teamSource : null },
    funnel: foldFunnel(current, previous, !scoped),
    evaluation,
    ka: buildKaSection(deals, { now, team, manager }),
  }
}
