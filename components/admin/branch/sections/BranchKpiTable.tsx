"use client"
// KR Team 파이프라인 — 매출 · 시트 영업 KPI 표(2026-11-24 시안 '파이프라인 A+B ③' 채택).
// 예전 팀 아코디언(알약 5개씩)과 'BD 활동 병목' 표를 하나로 합쳤다: 담당자 × (매출/목표, 활동 지표 5종, 병목).
// 평가 범위 규칙은 그대로다 — 시트 영업 KPI는 SHEET_KPI_ACTIVE_TEAMS(BD)만 판정하고, MKT 과정지표는
// Compass 평가표가 정본이라 시트 수치를 싣지 않는다. 이전 조직(CSM) 이력은 원본 값(음수 포함)을 보존하되
// 현재 상태(페이스 미달·주의)를 판정하지 않는다.
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Search } from "lucide-react"
import { cnyExact } from "@/lib/branch/money-format"
import { branchTeamLabel, isCurrentBranchTeam, isLegacyBranchTeam, SHEET_KPI_ACTIVE_TEAMS } from "@/lib/branch/current-organization"
import { teamColorOf } from "@/lib/branch/team-colors"
import { matchesTokens, tokenize } from "../search-tokens"
import MoneyValue from "../MoneyValue"
import type { BranchKpiMemberRow, BranchKpiResponse, BranchKpiTeamRow, Period, Team } from "../types"

// KPI 시트 메트릭 키(lib/branch/parsers/kpi.ts KPI_METRICS) → 표기 라벨. 표 열 순서도 이 순서를 따른다.
const KPI_METRICS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "LD", label: "리드" },
  { key: "ACC", label: "계정" },
  { key: "OPP", label: "기회" },
  { key: "SOL", label: "솔루션" },
  { key: "VST", label: "방문" },
]
const METRIC_LABEL: Record<string, string> = Object.fromEntries(KPI_METRICS.map((m) => [m.key, m.label]))

// 활동 병목 3단 — <30% 페이스 미달 / <60% 주의 / 그 외 표시 없음(표에서는 양호를 따로 적지 않는다).
const SHORTFALL_PCT = 30
const CAUTION_PCT = 60

type Mode = "current" | "legacy"

interface Group {
  team: BranchKpiTeamRow
  label: string
  members: BranchKpiMemberRow[]
}

function ratio(actual: number, goal: number) {
  return goal > 0 ? (actual / goal) * 100 : 0
}

function worstMetric(kpi: BranchKpiMemberRow["kpi"]) {
  let worst: { metric: string; actual: number; goal: number; pct: number } | null = null
  for (const [metric, pair] of Object.entries(kpi ?? {})) {
    if (!pair || pair.goal <= 0) continue
    const value = ratio(pair.actual, pair.goal)
    if (!worst || value < worst.pct) worst = { metric, actual: pair.actual, goal: pair.goal, pct: value }
  }
  return worst
}

function RevenueCell({ actual, goal }: { actual: number; goal: number }) {
  const value = ratio(actual, goal)
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[#F0F0EC]" aria-hidden="true">
        <span className="block h-full rounded-full bg-[#31302E]" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </span>
      {goal > 0 ? <b className="tabular-nums text-[#111110]">{value.toFixed(0)}%</b> : <span className="text-[#615D59]">목표 없음</span>}
      <span className="text-[11.5px] tabular-nums text-[#615D59]" title={`¥${cnyExact(actual)} / ¥${cnyExact(goal)} · 시트 원값`}>
        <MoneyValue value={actual} /> / <MoneyValue value={goal} />
      </span>
    </div>
  )
}

function MetricCells({ kpi, judge }: { kpi: BranchKpiMemberRow["kpi"] | Record<string, { actual: number; goal: number }>; judge: boolean }) {
  return (
    <>
      {KPI_METRICS.map(({ key }) => {
        const pair = kpi[key]
        if (!pair) return <td key={key} className="px-3 py-2 text-right text-[#A39E98]">–</td>
        const value = ratio(pair.actual, pair.goal)
        return (
          <td key={key} className="px-3 py-2 text-right tabular-nums">
            <span className="block text-[12.5px] text-[#111110]">{pair.actual}/{pair.goal}</span>
            {pair.goal > 0 ? (
              <span className={`block text-[11px] ${judge && value < SHORTFALL_PCT ? "font-semibold text-[#B43E3E]" : "text-[#615D59]"}`}>{value.toFixed(0)}%</span>
            ) : null}
          </td>
        )
      })}
    </>
  )
}

export default function BranchKpiTable({
  data, loading, error, team, period, selectedMonth,
}: {
  data: BranchKpiResponse | null
  loading: boolean
  error: string | null
  team: Team
  period: Period
  selectedMonth: string
}) {
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<"default" | "asc" | "desc">("default")
  const mode: Mode = isLegacyBranchTeam(team) ? "legacy" : "current"

  const groups = useMemo<Group[]>(() => {
    if (!data) return []
    if (data.scope?.manager) {
      if (!data.members.length) return []
      const goal = data.members.reduce((sum, member) => sum + member.goal, 0)
      const status = data.members.reduce((sum, member) => sum + member.status, 0)
      return [{
        team: { team: data.members[0].team ?? "ALL", goal, status, pacing_pct: goal > 0 ? (status / goal) * 100 : 0 },
        label: `내 담당 · ${data.members.map((member) => member.member).join(", ")}`,
        members: data.members,
      }]
    }
    return data.teams
      .filter((row) => mode === "legacy" ? row.team === team : isCurrentBranchTeam(row.team) && (team === "ALL" || row.team === team))
      .map((row) => ({ team: row, label: branchTeamLabel(row.team), members: data.members.filter((member) => member.team === row.team) }))
  }, [data, team, mode])

  const visibleGroups = useMemo(() => {
    const tokens = tokenize(query)
    const sortMembers = (members: BranchKpiMemberRow[]) => {
      if (sort === "default") return members
      return members.slice().sort((a, b) => {
        const diff = ratio(a.confirmed, a.goal) - ratio(b.confirmed, b.goal)
        return sort === "asc" ? diff : -diff
      })
    }
    const filtered = tokens.length === 0
      ? groups
      : groups.map((group) => ({ ...group, members: group.members.filter((member) => matchesTokens(tokens, [member.member])) }))
        .filter((group) => group.members.length > 0)
    return filtered.map((group) => ({ ...group, members: sortMembers(group.members) }))
  }, [groups, query, sort])

  const ledgerHref = useMemo(() => {
    const base = new URLSearchParams()
    base.set("lens", "rev")
    if (team !== "ALL") base.set("team", team)
    if (period !== "Q") base.set("period", period)
    if (period === "M") base.set("month", selectedMonth)
    return (member: string) => {
      const params = new URLSearchParams(base)
      params.set("mgr", member)
      return `/admin/branch/ledger?${params.toString()}`
    }
  }, [team, period, selectedMonth])

  if (error) return (
    <div role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]">
      담당자 KPI를 불러오지 못했습니다 · {error}
    </div>
  )
  if (loading || !data) return <div className="h-64 animate-pulse rounded-xl bg-[#F0F0EC]" />
  if (groups.length === 0) return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-4 text-[12px] text-[#615D59]">표시할 담당자 KPI가 없습니다.</section>
  )

  const memberCount = groups.reduce((sum, group) => sum + group.members.length, 0)
  const hasCompassTeam = groups.some((group) => !SHEET_KPI_ACTIVE_TEAMS.has(group.team.team))
  const sortLabel = sort === "asc" ? "달성률 낮은순" : sort === "desc" ? "달성률 높은순" : "달성률순 정렬"

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white" aria-label="매출 · 시트 영업 KPI">
      <div className="flex flex-wrap items-center gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">
          {mode === "legacy" ? `${branchTeamLabel(team)} · 매출과 활동 지표` : "매출 · 시트 영업 KPI"}
        </h2>
        <span className="text-[11.5px] text-[#615D59]">
          {memberCount}명 · {mode === "legacy"
            ? "과거 시트의 목표·실적을 보존한 참고 이력입니다. 현재 조직의 병목 권고가 아닙니다."
            : hasCompassTeam ? "활동 지표는 BD 시트 기준 · MKT 과정지표는 Compass 평가표" : "BD 시트 영업 KPI 기준"}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative">
            <span className="sr-only">담당자 검색</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#615D59]" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="담당자 검색"
              className="h-11 min-h-11 w-36 rounded-full border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-3 text-[16px] outline-none transition focus:border-[#111110]/30 md:h-8 md:min-h-0 md:text-[12px]"
            />
          </label>
          <button
            type="button"
            onClick={() => setSort((value) => (value === "default" ? "asc" : value === "asc" ? "desc" : "default"))}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[11.5px] font-semibold text-[#615D59] hover:text-[#111110] md:min-h-8 md:min-w-0"
            title="담당자 매출 달성률 기준 정렬"
          >
            {sort === "desc" ? <ArrowDownNarrowWide className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpNarrowWide className={`h-3.5 w-3.5 ${sort === "default" ? "opacity-40" : ""}`} aria-hidden="true" />}
            {sortLabel}
          </button>
          <Link
            href={mode === "legacy" ? `/admin/branch/ledger?team=${team}` : "/admin/branch/ledger"}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-[#084734] hover:underline md:min-h-8 md:min-w-0"
          >
            딜 수치 편집 →
          </Link>
        </div>
      </div>
      {visibleGroups.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-[#615D59]">&quot;{query}&quot; 검색 결과가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr className="bg-[#F6F5F4] text-[11px] font-semibold text-[#615D59]">
                <th scope="col" className="px-4 py-2 font-semibold">담당</th>
                <th scope="col" className="px-3 py-2 font-semibold">매출 / 목표</th>
                {KPI_METRICS.map((metric) => <th key={metric.key} scope="col" className="px-3 py-2 text-right font-semibold">{metric.label}</th>)}
                <th scope="col" className="px-3 py-2 font-semibold">{mode === "legacy" ? "자료 구분" : "병목"}</th>
              </tr>
            </thead>
            {visibleGroups.map((group) => {
              const sheetKpi = mode === "legacy" || SHEET_KPI_ACTIVE_TEAMS.has(group.team.team)
              const judge = mode === "current" && SHEET_KPI_ACTIVE_TEAMS.has(group.team.team)
              const aggregate: Record<string, { actual: number; goal: number }> = {}
              if (sheetKpi) {
                for (const member of group.members) {
                  for (const [metric, pair] of Object.entries(member.kpi ?? {})) {
                    if (!pair) continue
                    const current = aggregate[metric] ?? { actual: 0, goal: 0 }
                    aggregate[metric] = { actual: current.actual + pair.actual, goal: current.goal + pair.goal }
                  }
                }
              }
              const groupWorst = judge ? worstMetric(aggregate) : null
              const teamColor = teamColorOf(group.team.team)
              return (
                <tbody key={group.team.team} className="border-t border-[#E8E8E4]">
                  <tr className="bg-[#FAFAF8]">
                    <th scope="rowgroup" className="px-4 py-2.5 text-left font-bold" style={{ color: data.scope?.manager ? "#111110" : teamColor }}>
                      {group.label}
                      <span className="ml-1.5 text-[11px] font-medium text-[#615D59]">{group.members.length ? `${group.members.length}명` : "팀 단위 집계"}</span>
                    </th>
                    <td className="px-3 py-2.5"><RevenueCell actual={group.team.status} goal={group.team.goal} /></td>
                    {sheetKpi && group.members.length ? <MetricCells kpi={aggregate} judge={judge} /> : (
                      <td colSpan={KPI_METRICS.length} className="px-3 py-2.5 text-[11.5px] text-[#615D59]">
                        {mode === "legacy" || isLegacyBranchTeam(group.team.team) ? "이전 조직 매출 이력" : "과정지표는 Compass 평가표에서 확인"}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-[11.5px] text-[#615D59]">
                      {mode === "legacy" ? "원본 시트 이력" : groupWorst ? `${METRIC_LABEL[groupWorst.metric] ?? groupWorst.metric} ${groupWorst.pct.toFixed(0)}%` : null}
                    </td>
                  </tr>
                  {group.members.map((member) => {
                    const memberSheetKpi = mode === "legacy" || (member.team != null && SHEET_KPI_ACTIVE_TEAMS.has(member.team))
                    const memberJudge = mode === "current" && member.team != null && SHEET_KPI_ACTIVE_TEAMS.has(member.team)
                    const worst = memberJudge ? worstMetric(member.kpi) : null
                    return (
                      <tr key={member.member} className="border-t border-[#F0F0EC]">
                        <th scope="row" className="px-4 py-1.5 text-left font-semibold text-[#111110]">
                          <Link
                            href={ledgerHref(member.member)}
                            title={`매출 장부에서 ${member.member} 보기`}
                            className="inline-flex min-h-11 min-w-11 items-center hover:underline md:min-h-0 md:min-w-0"
                          >
                            {member.member}
                          </Link>
                          {data.scope?.manager && member.team ? <span className="ml-1.5 text-[11px] font-medium" style={{ color: teamColorOf(member.team) }}>{branchTeamLabel(member.team)}</span> : null}
                        </th>
                        <td className="px-3 py-1.5"><RevenueCell actual={member.confirmed} goal={member.goal} /></td>
                        {memberSheetKpi ? <MetricCells kpi={member.kpi ?? {}} judge={memberJudge} /> : (
                          <td colSpan={KPI_METRICS.length} className="px-3 py-1.5 text-[11.5px] text-[#615D59]">과정지표는 Compass 평가표에서 확인</td>
                        )}
                        <td className="px-3 py-1.5 text-[12px]">
                          {mode === "legacy" ? <span className="text-[11.5px] text-[#615D59]">원본 시트 이력</span>
                            : worst ? (
                              <span>
                                {METRIC_LABEL[worst.metric] ?? worst.metric} {worst.actual}/{worst.goal}{" "}
                                {worst.pct < SHORTFALL_PCT ? <b className="text-[11.5px] text-[#B43E3E]">페이스 미달</b>
                                  : worst.pct < CAUTION_PCT ? <b className="text-[11.5px] text-[#7A520F]">주의</b> : null}
                              </span>
                            ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })}
          </table>
        </div>
      )}
    </section>
  )
}
