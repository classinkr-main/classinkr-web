"use client"
import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowDownNarrowWide, ArrowUpNarrowWide, ChevronRight, Search } from "lucide-react"
import type { BranchKpiResponse, BranchKpiTeamRow, BranchKpiMemberRow } from "../types"
import { cny, cnyExact } from "@/lib/branch/money-format"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import MoneyValue from "../MoneyValue"

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 })
const fmt = (n: number) => numberFmt.format(n)

const KPI_LABELS: Record<string, string> = {
  lead: "리드",
  account: "계정",
  solution: "솔루션",
  opportunity: "기회",
  visit: "방문",
  event: "이벤트",
  content: "콘텐츠",
  template: "템플릿",
  caseStudy: "사례연구",
}

// Teams with active KPI tracking (others render "?" for KPI fields)
const KPI_ACTIVE_TEAMS = new Set(["BD"])

// Placeholder KPI item keys per team — shown as "항목 ?" chips when not yet tracked
const TEAM_KPI_PLACEHOLDERS: Record<string, string[]> = {
  MKT: ["event", "content", "template"],
  CSM: ["caseStudy"],
}

const COLORS = {
  green: "#084734",
  amber: "#A8741A", // Warning 축 — 페이싱 미달 신호(캐논 confidence-tokens와 동일 값)
  amberStrong: "#7A520F", // Warning 강조 — 페이싱이 더 크게 미달일 때(구 올리브 대체)
  border: "rgba(0,0,0,0.08)",
}

function GaugeBar({ value, goal, color, height = 6 }: { value: number; goal: number; color: string; height?: number }) {
  const pct = goal ? Math.min(120, (value / goal) * 100) : 0
  return (
    <div className="relative overflow-hidden rounded-full bg-[rgba(0,0,0,0.05)]" style={{ height }}>
      <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function pickKpiColor(pct: number) {
  if (pct >= 70) return COLORS.green
  if (pct >= 50) return COLORS.amber
  return COLORS.amberStrong
}

function MemberRow({ member, viewMode }: { member: BranchKpiMemberRow; viewMode: "list" | "matrix" }) {
  const teamHasKpi = member.team ? KPI_ACTIVE_TEAMS.has(member.team) : false
  const memberPct = member.goal ? Math.round((member.confirmed / member.goal) * 100) : 0
  const kpiKeys = teamHasKpi ? Object.keys(member.kpi) : []
  // 매출 장부 크로스링크 — PipelineTable(sections/PipelineTable.tsx)의 ledgerHref와
  // 동일 파라미터 규약(lens=rev&mgr=). 장부의 담당 필터는 단일 select라 그대로 전달.
  const ledgerHref = `/admin/branch/ledger?lens=rev&mgr=${encodeURIComponent(member.member)}`
  return (
    <Link href={ledgerHref}
      title={`매출 장부에서 ${member.member} 보기`}
      className="-mx-1.5 grid items-center gap-4 rounded-lg border-t border-[rgba(0,0,0,0.05)] px-1.5 py-2.5 transition hover:bg-white"
      style={{ gridTemplateColumns: "minmax(160px,180px) 1fr 1.3fr" }}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#ECFDF5] text-[12px] font-bold text-[#084734]">
          {member.member.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold text-[#111110]">{member.member}</p>
          <p className="truncate text-[10.5px] text-[#615D59]">{member.team ?? "-"}</p>
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-baseline justify-between text-[11px]">
          <span className="text-[#615D59]">
            {/* 확정 매출 = 캐논 그린 — 빨강 아님(DealMixSection 웨이브3 수정과 동일 근거). */}
            <span className="cursor-help font-semibold" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}
              title={`¥${cnyExact(member.confirmed)} · 시트 원값 · 반올림 없음`}>¥{cny(member.confirmed)}</span> / <span className="cursor-help" title={`¥${cnyExact(member.goal)} · 시트 원값 · 반올림 없음`}>¥{cny(member.goal)}</span>
          </span>
          <span className="font-bold" style={{ color: memberPct >= 70 ? COLORS.green : COLORS.amber }}>{memberPct}%</span>
        </div>
        <GaugeBar value={member.confirmed} goal={member.goal} color={memberPct >= 70 ? COLORS.green : COLORS.amber} height={5} />
      </div>
      {!teamHasKpi ? (
        <div className="flex flex-wrap gap-1.5">
          {(TEAM_KPI_PLACEHOLDERS[member.team ?? ""] ?? []).map((k) => (
            <span key={k} title="KPI 목표는 현재 BD팀만 운영 — 아직 집계되지 않음"
              className="inline-flex items-baseline gap-1 rounded-full border border-dashed border-[rgba(0,0,0,0.1)] bg-[#F6F5F4] px-2 py-0.5 text-[10.5px]">
              <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
              <span className="font-bold text-[#A8741A]">?</span>
            </span>
          ))}
          {!TEAM_KPI_PLACEHOLDERS[member.team ?? ""] && (
            <span title="KPI 목표는 현재 BD팀만 운영 — 아직 집계되지 않음" className="text-[11px] font-medium text-[#A8741A]">?</span>
          )}
        </div>
      ) : viewMode === "matrix" ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, kpiKeys.length)}, 1fr)` }}>
          {kpiKeys.map((k) => {
            const v = member.kpi[k]
            const p = v?.goal ? Math.round((v.actual / v.goal) * 100) : 0
            const intensity = Math.min(1, p / 100)
            // 50-69%/미만 두 구간은 캐논 Warning 계열(rgb(168,116,26)=#A8741A,
            // rgb(122,82,15)=#7A520F)의 반투명 스케일 — 구 올리브(rgb(123,139,54)) 대체.
            const bg = p >= 100 ? COLORS.green
              : p >= 70 ? `rgba(8,71,52,${0.15 + intensity * 0.45})`
              : p >= 50 ? `rgba(168,116,26,${0.15 + intensity * 0.45})`
              : `rgba(122,82,15,${0.15 + intensity * 0.45})`
            return (
              <div key={k} title={`${KPI_LABELS[k] ?? k} ${v?.actual}/${v?.goal}`}
                className="rounded-md p-1.5 text-center"
                style={{ background: bg, color: p >= 100 ? "#fff" : "#111110" }}>
                <p className="text-[9px] font-semibold opacity-85">{KPI_LABELS[k] ?? k}</p>
                <p className="mt-0.5 text-[11.5px] font-bold">{p}%</p>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {kpiKeys.map((k) => {
            const v = member.kpi[k]
            if (!v) return null
            const p = v.goal ? Math.round((v.actual / v.goal) * 100) : 0
            return (
              <span key={k}
                className="inline-flex items-baseline gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2 py-0.5 text-[10.5px]">
                <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
                <span className="font-bold text-[#111110]">{v.actual}/{v.goal}</span>
                <span className="font-bold" style={{ color: pickKpiColor(p) }}>{p}%</span>
              </span>
            )
          })}
        </div>
      )}
    </Link>
  )
}

function TeamRow({ team, members, defaultOpen }: { team: BranchKpiTeamRow; members: BranchKpiMemberRow[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [viewMode, setViewMode] = useState<"list" | "matrix">("list")
  // 달성률(확정/목표) 정렬 토글 — 기본은 원본 순서(default), 클릭할 때마다
  // 높은순 → 낮은순 → 원본순으로 순환한다. KPI 미연동 팀(MKT/CSM)도 매출
  // 달성률 자체는 있으므로 teamHasKpi와 무관하게 항상 노출한다.
  const [memberSort, setMemberSort] = useState<"default" | "desc" | "asc">("default")
  const teamHasKpi = KPI_ACTIVE_TEAMS.has(team.team)
  const hasMembers = members.length > 0
  const pct = team.goal ? Math.round((team.status / team.goal) * 100) : 0
  const expandable = hasMembers

  // 정렬 기준은 MemberRow가 실제로 표시하는 memberPct(확정/목표 단순 비율)와
  // 동일해야 한다 — member.achievement_pct(페이싱 가중치 포함 별도 지표)를 쓰면
  // 화면에 보이는 %와 정렬 순서가 어긋나 버그처럼 보인다.
  const sortedMembers = useMemo(() => {
    if (memberSort === "default") return members
    const withPct = members.map((m) => ({ m, pct: m.goal ? (m.confirmed / m.goal) * 100 : 0 }))
    withPct.sort((a, b) => (memberSort === "desc" ? b.pct - a.pct : a.pct - b.pct))
    return withPct.map((x) => x.m)
  }, [members, memberSort])

  function cycleMemberSort() {
    setMemberSort((s) => (s === "default" ? "desc" : s === "desc" ? "asc" : "default"))
  }

  // aggregate KPIs across members for the team summary chips
  const aggKpis: Array<{ k: string; actual: number; goal: number }> = []
  if (teamHasKpi && hasMembers) {
    const keys = new Set<string>()
    members.forEach((m) => Object.keys(m.kpi).forEach((k) => keys.add(k)))
    keys.forEach((k) => {
      let actual = 0; let goal = 0
      members.forEach((m) => { actual += m.kpi[k]?.actual ?? 0; goal += m.kpi[k]?.goal ?? 0 })
      aggKpis.push({ k, actual, goal })
    })
  }

  // Status chip on the right side (replaces KPI chips when no members)
  const renderRightChip = () => {
    if (!teamHasKpi) {
      const placeholders = TEAM_KPI_PLACEHOLDERS[team.team]
      if (placeholders?.length) {
        return placeholders.map((k) => (
          <span key={k} title="KPI 목표는 현재 BD팀만 운영 — 아직 집계되지 않음"
            className="inline-flex items-baseline gap-1 rounded-full border border-dashed border-[rgba(0,0,0,0.1)] bg-[#F6F5F4] px-2 py-0.5 text-[10.5px]">
            <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
            <span className="font-bold text-[#A8741A]">?</span>
          </span>
        ))
      }
      return (
        <span title="KPI 목표는 현재 BD팀만 운영 — 아직 집계되지 않음" className="text-[11px] font-bold text-[#A8741A]">?</span>
      )
    }
    if (!hasMembers) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[rgba(0,0,0,0.12)] bg-[#F6F5F4] px-2.5 py-1 text-[10.5px] font-medium text-[#615D59]">
          <span className="text-[#A8741A]">?</span>
          <span>팀원 KPI 미연동</span>
        </span>
      )
    }
    return aggKpis.map(({ k, actual, goal }) => {
      const p = goal ? Math.round((actual / goal) * 100) : 0
      return (
        <span key={k}
          className="inline-flex items-baseline gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 py-0.5 text-[10.5px]">
          <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
          <span className="font-bold text-[#111110]">{actual}/{goal}</span>
          <span className="font-bold" style={{ color: pickKpiColor(p) }}>{p}%</span>
        </span>
      )
    })
  }

  const headerProps = expandable
    ? { onClick: () => setOpen((v) => !v), className: "grid w-full cursor-pointer items-center gap-4 px-1 py-3.5 text-left", "aria-expanded": open }
    : { className: "grid w-full items-center gap-4 px-1 py-3.5 text-left cursor-default", disabled: true as const }

  return (
    <div className="border-t border-[rgba(0,0,0,0.08)] first:border-t-0">
      <button type="button" {...headerProps}
        style={{ gridTemplateColumns: "24px 140px 1fr 1.3fr" }}>
        <ChevronRight className={`h-4 w-4 transition-transform ${
          expandable ? "text-[#615D59]" : "text-transparent"
        } ${open ? "rotate-90" : ""}`} />
        <div>
          <p className="text-[14px] font-bold text-[#111110]">{team.team}</p>
          <p className="mt-0.5 text-[11px] text-[#615D59]">
            {hasMembers ? `${members.length}명` : "팀 단위 집계"}
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex justify-between text-[11.5px]">
            <span className="text-[#615D59]">
              {/* 확정 매출 = 캐논 그린 — 빨강 아님. */}
              매출 <span className="font-bold" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}><MoneyValue value={team.status} /></span> / <MoneyValue value={team.goal} />
            </span>
            <span className="font-bold" style={{ color: pct >= 70 ? COLORS.green : COLORS.amber }}>{pct}%</span>
          </div>
          <GaugeBar value={team.status} goal={team.goal} color={pct >= 70 ? COLORS.green : COLORS.amber} height={7} />
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {renderRightChip()}
        </div>
      </button>
      {expandable && (
        <div
          className={`grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out ${
            open ? "mb-3 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0"
          }`}
          aria-hidden={!open}
        >
          <div className="overflow-hidden">
            <div className="rounded-[10px] bg-[#F6F5F4] p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={cycleMemberSort}
                  disabled={members.length <= 1}
                  className="inline-flex items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[10.5px] font-semibold text-[#615D59] transition hover:border-[#111110]/25 hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-50"
                  title="달성률 기준 정렬"
                >
                  {memberSort === "desc" ? (
                    <ArrowDownNarrowWide className="h-3 w-3" aria-hidden="true" />
                  ) : memberSort === "asc" ? (
                    <ArrowUpNarrowWide className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <ArrowDownNarrowWide className="h-3 w-3 opacity-35" aria-hidden="true" />
                  )}
                  <span>
                    달성률{memberSort === "desc" ? " 높은순" : memberSort === "asc" ? " 낮은순" : "순 정렬"}
                  </span>
                </button>
                {teamHasKpi && (
                  <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-white p-[3px]">
                    {(["list", "matrix"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setViewMode(v)}
                        className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold ${
                          viewMode === v ? "bg-[#111110] text-white" : "text-[#615D59]"
                        }`}>
                        {v === "list" ? "리스트" : "매트릭스 %"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {sortedMembers.map((m) => <MemberRow key={m.member} member={m} viewMode={viewMode} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BranchKpiAccordion({
  data, loading, error,
}: {
  data: BranchKpiResponse | null
  loading: boolean
  error: string | null
}) {
  const [query, setQuery] = useState("")

  const teamsWithMembers = useMemo(() => {
    if (!data) return []
    return data.teams.map((t) => ({
      team: t,
      members: data.members.filter((m) => m.team === t.team),
    }))
  }, [data])

  // 담당자 검색 — 팀 행 자체는 유지하되 팀 내 팀원만 이름 부분일치로 좁힌다.
  // 매치가 하나도 없는 팀은 통째로 숨긴다(빈 "팀 단위 집계" placeholder 오표시 방지).
  const filteredTeamsWithMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return teamsWithMembers
    return teamsWithMembers
      .map((t) => ({ team: t.team, members: t.members.filter((m) => m.member.toLowerCase().includes(q)) }))
      .filter((t) => t.members.length > 0)
  }, [teamsWithMembers, query])

  if (error) return (
    <div role="alert" className="rounded-2xl border border-[#F2B8B8] bg-[#FCE9E9] p-4 text-[12px] font-semibold text-[#8F2C2C]">
      {error}
    </div>
  )
  if (loading || !data) return <div className="h-64 animate-pulse rounded-xl bg-[#f0f0ec]" />
  if (teamsWithMembers.length === 0) return null

  const totalMembers = teamsWithMembers.reduce((s, t) => s + t.members.length, 0)
  const hasAnyMembers = totalMembers > 0
  const headerTitle = hasAnyMembers
    ? "팀 KPI · 클릭 시 팀원 펼치기"
    : "팀별 매출 페이싱"
  const headerSub = hasAnyMembers
    ? `${totalMembers}명`
    : "팀원 단위 데이터 미연동"
  // MKT/CSM은 아직 KPI 목표 운영 대상이 아니다 — 그 팀 행의 "?" 칩이 버그처럼
  // 보이지 않도록 헤더에 한 번 정직하게 고지한다(KPI_ACTIVE_TEAMS가 유일한 판정 기준).
  const hasInactiveKpiTeam = teamsWithMembers.some((t) => !KPI_ACTIVE_TEAMS.has(t.team.team))
  const isSearching = query.trim().length > 0
  const noSearchMatches = isSearching && filteredTeamsWithMembers.length === 0

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">{headerTitle}</h2>
            <span className="text-[11px] font-medium text-[#615D59]">{headerSub}</span>
          </div>
          {hasAnyMembers && (
            <label className="relative">
              <span className="sr-only">담당자 검색</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#615D59]" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="담당자 검색"
                className="h-7 w-36 rounded-full border border-[rgba(0,0,0,0.08)] bg-white pl-8 pr-3 text-[11px] outline-none transition focus:border-[#111110]/30"
              />
            </label>
          )}
        </div>
        <p className="text-right text-[10.5px] text-[#615D59]">
          {hasInactiveKpiTeam && <span className="block">KPI 목표는 현재 BD팀만 운영</span>}
          <span className={`font-semibold ${CONFIDENCE_TOKENS.confirmed.textClass}`}>그린 = 확정 매출</span>
        </p>
      </div>
      <div className="px-5 pb-2 pt-1">
        {noSearchMatches ? (
          <p className="py-6 text-center text-[11.5px] text-[#615D59]">&quot;{query}&quot; 검색 결과가 없습니다.</p>
        ) : (
          filteredTeamsWithMembers.map((t) => (
            <TeamRow
              key={`${t.team.team}-${isSearching ? "search" : "all"}`}
              team={t.team}
              members={t.members}
              defaultOpen={isSearching}
            />
          ))
        )}
      </div>
    </section>
  )
}

export { fmt }
