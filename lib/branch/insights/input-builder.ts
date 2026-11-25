import "server-only"
import { createHash } from "crypto"
import type { DshOutput, DshBreakdownRow } from "@/lib/branch/parsers/dsh"
import type { KpiRow } from "@/lib/branch/parsers/kpi"
import type { BranchRevDeal } from "@/lib/repositories/branch-deals"
import { teamPacing } from "@/lib/branch/computations/pacing"
import { deriveMemberTeams } from "@/lib/branch/computations/member-teams"
import { computeHeatmap } from "@/lib/branch/computations/heatmap"
import { dealProbability } from "@/lib/branch/computations/pipeline"
import { confirmedMonthAmount } from "@/lib/branch/computations/rev-confirmed"
import { dedupeDshByKind } from "@/lib/branch/dsh-dedupe"
import { fyOf, fiscalQuarter, ymKey } from "@/lib/branch/fiscal"
import type { Period } from "@/lib/branch/computations/heatmap"
import type { BranchWeeklyCompassReport } from "@/lib/branch/weekly-report-contract"
import { classifySalesLedgerProductCategory } from "@/lib/branch/product-category"
import { normalizeBranchMemberName } from "@/lib/branch/member-names"

export type TeamScope = "ALL" | "BD" | "MKT" | "CSM"

export interface InsightInput {
  fiscalPeriod: string
  team: TeamScope
  scope: Period
  team_pacing: { goal: number; status: number; pacing_pct: number }

  // pre-computed top-line numbers so the LLM doesn't re-derive
  summary_metrics: {
    total_goal: number
    total_confirmed_revenue: number
    total_pipeline_value: number
    gap_to_goal: number
    top_region: { region: string; revenue: number } | null
    worst_region: { region: string; progress_pct: number } | null
    best_manager: { name: string; achievement_pct: number } | null
    worst_manager: { name: string; achievement_pct: number } | null
  }

  // deal mix from DSH (only when team === "ALL"; otherwise empty arrays)
  deal_mix: {
    by_category: Array<{ name: string; goal: number; actual: number; pct: number }>
    by_status_type: Array<{ name: string; goal: number; actual: number; pct: number }>
    by_channel: Array<{ name: string; goal: number; actual: number; pct: number }>
  }

  // data caveats so LLM can mention gaps explicitly
  data_caveats: string[]

  managers: Array<{
    name: string; team: string|null
    goal: number; status: number; pipeline: number
    achievement_pct: number
    deals_total: number; deals_confirmed: number
    new_renew: { new: number; renew: number }
    kpi: Record<string, [number, number]>
  }>
  regions: Array<{ region: string; target: number; revenue: number; progress_pct: number; status: string }>
  bottleneck_kpi: { name: string; pct: number; worst_member: string|null }
  closing_deals: Array<{ customer: string; manager: string|null; expected: number; due: string|null }>
  events_30d: Array<{ title: string; date: string; region?: string|null }>
  campaigns_30d: Array<{ name: string; sent_at: string; open_pct: number }>
  hw_alerts: Array<{ product: string; current: number; threshold: number }>

  // 본사 양식 一 — 1. DSH 제품별 회수 목표·누계(월·분기·연, CNY). team=ALL 일 때만 제품 분해.
  performance: InsightPerformanceBlock

  // 본사 양식 二 — 이번 달 REV 회수(고객별 확정·미확정, CNY).
  month_collections: InsightCollectionsBlock

  // KA(REV 딜 importance=KA) 이번 분기 고객 — 매출(REV) 지표. 주간 보고 2순위.
  ka_quarter: InsightKaBlock

  // Compass(마케팅·BD CRM) — 끝난 주(월~일 KST) 리드 퍼널과 월간 과정 평가. 매출이 아니다.
  compass_weekly: InsightCompassBlock
}

export interface InsightPerformanceBlock {
  month: string
  quarter: string
  rows: Array<{ product: "HW" | "SW" | "OTHER" | "TOTAL"; month_goal: number; month_actual: number; quarter_goal: number; quarter_actual: number; year_goal: number; year_actual: number }>
}

export interface InsightCollectionsBlock {
  month: string
  confirmed: number
  planned_not_confirmed: number
  customers: Array<{ customer: string; manager: string | null; product: "HW" | "SW"; kind: "new" | "renew" | null; confirmed: number; planned_not_confirmed: number }>
}

export interface InsightKaBlock {
  state: "ready" | "missing"
  quarter: string | null
  confirmed: number
  open: number
  customer_count: number
  top_customers: Array<{
    customer: string; manager: string | null; confirmed: number; open: number
    // Compass 이름 매칭 리드(없으면 null) — 진행 서술의 유일한 근거. 이름 매칭이라 확정 연결이 아니다.
    compass: { stage: string | null; next_action: string | null; next_action_at: string | null; last_activity: string | null; week_records: number; recent: string[] } | null
  }>
  compass_state: "ready" | "down" | "missing"
}

export function toInsightKaBlock(report: BranchWeeklyCompassReport | null): InsightKaBlock {
  if (!report) return { state: "missing", quarter: null, confirmed: 0, open: 0, customer_count: 0, top_customers: [], compass_state: "missing" }
  const ka = report.ka
  return {
    state: "ready",
    quarter: ka.quarter,
    confirmed: Math.round(ka.confirmed),
    open: Math.round(ka.open),
    customer_count: ka.customerCount,
    top_customers: ka.customers.slice(0, 8).map((c) => ({
      customer: c.customer, manager: c.manager, confirmed: Math.round(c.confirmed), open: Math.round(c.open),
      compass: c.compass ? {
        stage: c.compass.stageLabel,
        next_action: c.compass.nextAction,
        next_action_at: c.compass.nextActionAt?.slice(0, 10) ?? null,
        last_activity: c.compass.lastActivityAt?.slice(0, 10) ?? null,
        week_records: c.compass.weekActivityCount,
        recent: c.compass.recent.map((r) => `${r.at.slice(5, 10)} ${r.actor ?? ""} ${r.text}`.trim()),
      } : null,
    })),
    compass_state: ka.compassState ?? "ready",
  }
}

export interface InsightCompassBlock {
  state: "ready" | "down" | "missing"
  note: string
  week: string | null
  period: string | null
  previous_period: string | null
  inflow: [number, number] | null
  stages: Array<{ stage: string; this_week: number; prev_week: number }>
  lost: [number, number] | null
  top_lost_reasons: Array<{ reason: string; count: number }>
  owners: Array<{ name: string; inflow: number; demo: number; bd: number; won: number; lost: number }>
  unassigned_inflow: number | null
  evaluation_state: "ready" | "not_configured" | "unavailable" | "missing"
  evaluation: Array<{ name: string; team: string | null; rate_pct: number; grade: string; weakest: string[] }>
}

/** 주간 보고 Compass 구획을 LLM 입력용으로 접는다. 화면과 같은 보고서 객체에서만 만든다. */
export function toInsightCompassBlock(report: BranchWeeklyCompassReport | null): InsightCompassBlock {
  const note = "Compass 리드 퍼널(그 주 유입 리드의 현재 단계 누적)과 Compass 월간 과정 평가. REV 매출·DSH 목표와 합산하지 않는다."
  if (!report) {
    return { state: "missing", note, week: null, period: null, previous_period: null, inflow: null, stages: [], lost: null, top_lost_reasons: [], owners: [], unassigned_inflow: null, evaluation_state: "missing", evaluation: [] }
  }
  const f = report.funnel
  const ready = f.state === "ready"
  return {
    state: f.state,
    note: f.truncated ? `${note} 스캔 상한에 닿아 'N건 이상'으로 읽는다.` : note,
    week: report.week.label,
    period: `${report.week.startDate}~${report.week.endDate}`,
    previous_period: `${report.previousWeek.startDate}~${report.previousWeek.endDate}`,
    inflow: ready ? [f.inflow.current, f.inflow.previous] : null,
    stages: ready ? f.stages.map((s) => ({ stage: s.label, this_week: s.current, prev_week: s.previous })) : [],
    lost: ready ? [f.lost.current, f.lost.previous] : null,
    top_lost_reasons: ready ? f.lostReasons.map((r) => ({ reason: r.label, count: r.count })) : [],
    owners: ready ? f.owners.map((o) => ({ name: o.name, inflow: o.inflow, demo: o.demo, bd: o.bd, won: o.won, lost: o.lost })) : [],
    unassigned_inflow: ready ? f.unassigned : null,
    evaluation_state: report.evaluation.state,
    evaluation: report.evaluation.people.map((p) => ({
      name: p.name, team: p.team, rate_pct: p.rate, grade: p.grade,
      weakest: p.weakest.map((w) => `${w.label} ${w.rate}%`),
    })),
  }
}

export function digestInput(inp: InsightInput): string {
  return createHash("sha256").update(JSON.stringify(inp)).digest("hex")
}

export interface BuildArgs {
  team: TeamScope
  scope: Period
  now: Date
  dsh: DshOutput
  kpi: KpiRow[]
  deals: BranchRevDeal[]
  events: Array<{ title: string; startsAt: string; location: string|null }>
  campaigns: Array<{ subject: string; sentAt?: string; openPct: number }>
  hwAlerts: Array<{ product: string; current: number; threshold: number }>
  compassWeekly?: BranchWeeklyCompassReport | null
}

function pickBreakdownValue(row: DshBreakdownRow, scope: Period, now: Date): number {
  if (scope === "Y") return row.annual
  if (scope === "Q") return row.quarters[fiscalQuarter(now.getUTCMonth() + 1) - 1] ?? 0
  return row.months[ymKey(now)] ?? 0
}

function buildMix(
  breakdown: DshBreakdownRow[],
  dim: "category" | "status_type" | "channel",
  scope: Period,
  now: Date,
): Array<{ name: string; goal: number; actual: number; pct: number }> {
  const goals = new Map<string, number>()
  const actuals = new Map<string, number>()
  // summary 라우트 deal_mix와 동일한 절대 규칙 — 파서 breakdown은 같은 콤보를 스코프별
  // (전사 + 팀/멤버 섹션)로 반복 방출하므로, 최대-annual 채택(dedupeDshByKind) 없이
  // raw 합산하면 전사 수치가 ~3배로 부푼다.
  const deduped = dedupeDshByKind(breakdown)
  for (const row of deduped.goal.values()) {
    const key = row[dim]
    goals.set(key, (goals.get(key) ?? 0) + pickBreakdownValue(row, scope, now))
  }
  for (const row of deduped.status.values()) {
    const key = row[dim]
    actuals.set(key, (actuals.get(key) ?? 0) + pickBreakdownValue(row, scope, now))
  }
  const keys = new Set([...goals.keys(), ...actuals.keys()])
  return [...keys].map((k) => {
    const g = goals.get(k) ?? 0
    const ac = actuals.get(k) ?? 0
    return { name: k, goal: g, actual: ac, pct: g > 0 ? (ac / g) * 100 : 0 }
  }).sort((x, y) => y.goal - x.goal)
}

function buildPerformance(breakdown: DshBreakdownRow[], now: Date): InsightPerformanceBlock {
  const month = ymKey(now)
  const qIndex = fiscalQuarter(now.getUTCMonth() + 1) - 1
  const dedup = dedupeDshByKind(breakdown)
  const sum = (kind: "goal" | "status", match: (category: string) => boolean) => {
    const out = { month: 0, quarter: 0, year: 0 }
    for (const row of dedup[kind].values()) {
      if (!match(row.category)) continue
      out.month += row.months[month] ?? 0
      out.quarter += row.quarters[qIndex] ?? 0
      out.year += row.annual
    }
    return out
  }
  const groups = [
    { product: "HW" as const, match: (c: string) => c === "Hardware" },
    { product: "SW" as const, match: (c: string) => c === "Software" },
    { product: "OTHER" as const, match: (c: string) => c !== "Hardware" && c !== "Software" },
    { product: "TOTAL" as const, match: () => true },
  ]
  return {
    month,
    quarter: `Q${qIndex + 1}`,
    rows: groups.map((group) => {
      const goal = sum("goal", group.match)
      const status = sum("status", group.match)
      return { product: group.product, month_goal: Math.round(goal.month), month_actual: Math.round(status.month), quarter_goal: Math.round(goal.quarter), quarter_actual: Math.round(status.quarter), year_goal: Math.round(goal.year), year_actual: Math.round(status.year) }
    }).filter((row) => row.product === "TOTAL" || row.year_goal !== 0 || row.year_actual !== 0),
  }
}

function buildCollections(deals: BranchRevDeal[], now: Date): InsightCollectionsBlock {
  const month = ymKey(now)
  const byCustomer = new Map<string, InsightCollectionsBlock["customers"][number]>()
  for (const deal of deals) {
    const amount = Number(deal.monthly_payments?.[month] ?? 0)
    if (!Number.isFinite(amount) || amount === 0) continue
    const confirmed = confirmedMonthAmount(deal, month, amount)
    const key = deal.customer_name.trim().toLowerCase()
    const status = (deal.status ?? "").trim().toLowerCase()
    const entry = byCustomer.get(key) ?? {
      customer: deal.customer_name.trim(),
      manager: normalizeBranchMemberName(deal.manager),
      product: classifySalesLedgerProductCategory({ product: deal.product_version, account: deal.customer_name }) === "hardware" ? "HW" as const : "SW" as const,
      kind: status === "new" || status === "신규" ? "new" as const : status === "renew" || status === "갱신" ? "renew" as const : null,
      confirmed: 0,
      planned_not_confirmed: 0,
    }
    entry.confirmed += confirmed
    entry.planned_not_confirmed += amount - confirmed
    byCustomer.set(key, entry)
  }
  const rows = [...byCustomer.values()].map((row) => ({ ...row, confirmed: Math.round(row.confirmed), planned_not_confirmed: Math.round(row.planned_not_confirmed) }))
  return {
    month,
    confirmed: rows.reduce((sum, row) => sum + row.confirmed, 0),
    planned_not_confirmed: rows.reduce((sum, row) => sum + row.planned_not_confirmed, 0),
    customers: rows.sort((a, b) => (b.confirmed + b.planned_not_confirmed) - (a.confirmed + a.planned_not_confirmed)).slice(0, 10),
  }
}

export function buildInsightInput(a: BuildArgs): InsightInput {
  const fy = fyOf(a.now)
  const q = fiscalQuarter(a.now.getUTCMonth() + 1)

  let pacing = { goal: 0, status: 0, pacing_pct: 0 }
  if (a.team === "ALL") {
    for (const t of ["BD","MKT","CSM"] as const) {
      const p = teamPacing(a.dsh, t, a.scope, a.now)
      pacing.goal += p.goal; pacing.status += p.status
    }
  } else {
    pacing = { ...teamPacing(a.dsh, a.team, a.scope, a.now) }
  }
  pacing.pacing_pct = pacing.goal > 0 ? (pacing.status / pacing.goal) * 100 : 0

  const memberTeams = deriveMemberTeams(a.deals)
  const members = a.team === "ALL"
    ? Object.keys(memberTeams)
    : Object.entries(memberTeams).filter(([, t]) => t === a.team).map(([m]) => m)
  const managers = members.map((m) => {
    const k = a.kpi.find((r) => r.member === m)
    const dealsOf = a.deals.filter((d) => d.manager === m)
    const confirmed = dealsOf
      .filter((d) => d.first_payment)
      .reduce((s, d) => {
        return s + Object.entries(d.monthly_payments).reduce(
          (acc, [ym, v]) => acc + confirmedMonthAmount(d, ym, Number(v)),
          0,
        )
      }, 0)
    const goalRow = a.dsh.rows.find((r) => r.level === "member" && r.member === m && r.kind === "goal")
    const goalVal = goalRow?.annual ?? 0
    const pipelineSum = dealsOf
      .filter((d) => !d.first_payment)
      .reduce((s, d) => s + Number(d.contract_target ?? 0) * dealProbability(d), 0)
    return {
      name: m,
      team: memberTeams[m] ?? null,
      goal: goalVal,
      status: confirmed,
      pipeline: pipelineSum,
      achievement_pct: goalVal > 0 ? (confirmed / goalVal) * 100 : 0,
      deals_total: dealsOf.length,
      deals_confirmed: dealsOf.filter((d) => d.first_payment).length,
      new_renew: dealsOf.reduce((acc, d) => {
        if (d.status === "New") acc.new += 1
        else if (d.status === "Renew") acc.renew += 1
        return acc
      }, { new: 0, renew: 0 }),
      kpi: k ? Object.fromEntries(
        Object.entries(k.pairs).map(([m2, v]) => [m2, [v.goal, v.actual]] as const),
      ) as Record<string, [number, number]> : {},
    }
  })

  const regions = computeHeatmap(a.deals, a.scope, a.now, a.team)
    .slice(0, 12)
    .map((r) => ({ region: r.region, target: r.target, revenue: r.revenue, progress_pct: r.progress, status: r.status }))

  const KPIM = ["LD","ACC","OPP","SOL","VST"] as const
  const totals: Record<string, [number, number]> = Object.fromEntries(KPIM.map((m) => [m, [0, 0]]))
  for (const r of a.kpi) {
    for (const m of KPIM) {
      totals[m][0] += r.pairs[m].goal
      totals[m][1] += r.pairs[m].actual
    }
  }
  let bn: string = "LD"; let bnPct = Infinity
  for (const m of KPIM) {
    const [g, ac] = totals[m]
    const pct = g > 0 ? (ac / g) * 100 : 0
    if (pct < bnPct) { bn = m; bnPct = pct }
  }
  const worstMember = a.kpi.length > 0 ? a.kpi
    .map((r) => ({
      m: r.member,
      pct: r.pairs[bn as typeof KPIM[number]].goal > 0
        ? (r.pairs[bn as typeof KPIM[number]].actual / r.pairs[bn as typeof KPIM[number]].goal) * 100
        : 0,
    }))
    .sort((x, y) => x.pct - y.pct)[0]?.m ?? null : null

  const closing_deals = a.deals
    .filter((d) => {
      if (d.first_payment) {
        const fp = new Date(d.first_payment).getTime()
        return fp >= a.now.getTime() && fp <= a.now.getTime() + 30*86400_000
      }
      return dealProbability(d) >= 0.7
    })
    .slice(0, 12)
    .map((d) => ({ customer: d.customer_name, manager: d.manager, expected: Number(d.contract_target ?? 0), due: d.first_payment }))

  // summary_metrics
  const totalConfirmed = managers.reduce((s, m) => s + m.status, 0)
  const totalPipeline = managers.reduce((s, m) => s + m.pipeline, 0)
  const totalGoal = pacing.goal
  const sortedRegionsByRevenue = [...regions].sort((x, y) => y.revenue - x.revenue)
  const topRegion = sortedRegionsByRevenue[0] ?? null
  const sortedRegionsByProgress = [...regions].sort((x, y) => x.progress_pct - y.progress_pct)
  const worstRegion = sortedRegionsByProgress[0] ?? null
  const sortedManagers = [...managers].sort((x, y) => y.achievement_pct - x.achievement_pct)
  const bestManager = sortedManagers[0] ?? null
  const worstManagerCandidate = [...managers]
    .filter((m) => m.goal > 0)
    .sort((x, y) => x.achievement_pct - y.achievement_pct)[0] ?? null

  const summary_metrics = {
    total_goal: totalGoal,
    total_confirmed_revenue: totalConfirmed,
    total_pipeline_value: totalPipeline,
    gap_to_goal: totalGoal - totalConfirmed,
    top_region: topRegion ? { region: topRegion.region, revenue: topRegion.revenue } : null,
    worst_region: worstRegion ? { region: worstRegion.region, progress_pct: worstRegion.progress_pct } : null,
    best_manager: bestManager ? { name: bestManager.name, achievement_pct: bestManager.achievement_pct } : null,
    worst_manager: worstManagerCandidate ? { name: worstManagerCandidate.name, achievement_pct: worstManagerCandidate.achievement_pct } : null,
  }

  // deal_mix (only meaningful for ALL — for individual teams DSH doesn't split by team)
  const breakdown = a.dsh.breakdown ?? []
  const deal_mix = a.team === "ALL"
    ? {
        by_category: buildMix(breakdown, "category", a.scope, a.now),
        by_status_type: buildMix(breakdown, "status_type", a.scope, a.now),
        by_channel: buildMix(breakdown, "channel", a.scope, a.now),
      }
    : { by_category: [], by_status_type: [], by_channel: [] }

  // data_caveats
  const data_caveats: string[] = [
    "현재 조직은 BD·MKT다. CSM은 과거 장부 귀속이며 현재 부서나 담당 권한을 뜻하지 않는다.",
    "매출·목표는 연결된 REV·DSH 기준이며, NEO 본사 실적·Compass 평가와 합산하지 않는다. 노션 개정 목표 반영 여부는 별도 대조가 필요하다.",
    "시트 활동 KPI와 Compass 콜·데모 기록은 정의·기간이 확인되기 전까지 동일 지표로 취급하지 않는다.",
  ]
  if (closing_deals.length === 0) data_caveats.push("향후 30일 내 first_payment 가 잡힌 가까운 딜이 없음")
  const events30Count = a.events.filter((e) => {
    const t = new Date(e.startsAt).getTime()
    return t >= a.now.getTime() && t <= a.now.getTime() + 30*86400_000
  }).length
  if (events30Count === 0) data_caveats.push("향후 30일 예정 행사 없음")
  if (a.campaigns.length === 0) data_caveats.push("최근 30일 발송 캠페인 없음")
  if (a.deals.length === 0) data_caveats.push("REV 시트에서 가져온 딜 데이터가 없음 (sync 미실행 가능성)")
  if (a.kpi.length === 0) data_caveats.push("KPI 시트에서 가져온 활동 데이터가 없음")
  if (regions.length === 0) data_caveats.push("지역 정보가 있는 딜이 없음")
  const compass_weekly = toInsightCompassBlock(a.compassWeekly ?? null)
  const ka_quarter = toInsightKaBlock(a.compassWeekly ?? null)
  if (ka_quarter.state === "ready" && ka_quarter.customer_count === 0) data_caveats.push("이번 분기 KA로 표시된 REV 딜이 없음")
  if (compass_weekly.state !== "ready") data_caveats.push("Compass 리드 퍼널을 읽지 못함 — 영업 활동 비교를 단정하지 않는다")
  if (compass_weekly.evaluation_state !== "ready") data_caveats.push("Compass 월간 과정 평가 연결 전 또는 조회 실패")

  return {
    fiscalPeriod: `FY${fy}-Q${q}`,
    team: a.team, scope: a.scope,
    team_pacing: pacing,
    summary_metrics,
    deal_mix,
    data_caveats,
    managers, regions,
    bottleneck_kpi: { name: bn, pct: bnPct === Infinity ? 0 : bnPct, worst_member: worstMember },
    closing_deals,
    events_30d: a.events
      .filter((e) => new Date(e.startsAt).getTime() >= a.now.getTime() && new Date(e.startsAt).getTime() <= a.now.getTime() + 30*86400_000)
      .slice(0, 12)
      .map((e) => ({ title: e.title, date: e.startsAt.slice(0,10), region: e.location })),
    campaigns_30d: a.campaigns
      .filter((c) => c.sentAt)
      .slice(0, 8)
      .map((c) => ({ name: c.subject, sent_at: c.sentAt!, open_pct: c.openPct })),
    hw_alerts: a.hwAlerts.slice(0, 5),
    performance: a.team === "ALL" ? buildPerformance(breakdown, a.now) : { month: ymKey(a.now), quarter: `Q${q}`, rows: [] },
    month_collections: buildCollections(a.deals, a.now),
    ka_quarter,
    compass_weekly,
  }
}
