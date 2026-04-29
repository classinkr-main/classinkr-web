"use client"
import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import type { BranchKpiResponse, BranchKpiTeamRow, BranchKpiMemberRow } from "../types"

const numberFmt = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 })
const fmt = (n: number) => numberFmt.format(n)
function krw(n: number) {
  if (!Number.isFinite(n)) return "-"
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1).replace(/\.0$/, "")}억`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`
  return n.toLocaleString()
}

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
  olive: "#7B8B36",
  amber: "#A8741A",
  red: "#B43E3E",
  blue: "#1E5DA8",
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
  if (pct >= 50) return COLORS.olive
  return COLORS.amber
}

function MemberRow({ member, viewMode }: { member: BranchKpiMemberRow; viewMode: "list" | "matrix" }) {
  const teamHasKpi = member.team ? KPI_ACTIVE_TEAMS.has(member.team) : false
  const memberPct = member.goal ? Math.round((member.confirmed / member.goal) * 100) : 0
  const kpiKeys = teamHasKpi ? Object.keys(member.kpi) : []
  return (
    <div className="grid items-center gap-4 border-t border-[rgba(0,0,0,0.05)] py-2.5"
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
            <span className="font-semibold" style={{ color: COLORS.red }}>¥{krw(member.confirmed)}</span> / ¥{krw(member.goal)}
          </span>
          <span className="font-bold" style={{ color: memberPct >= 70 ? COLORS.green : COLORS.amber }}>{memberPct}%</span>
        </div>
        <GaugeBar value={member.confirmed} goal={member.goal} color={memberPct >= 70 ? COLORS.green : COLORS.olive} height={5} />
      </div>
      {!teamHasKpi ? (
        <div className="flex flex-wrap gap-1.5">
          {(TEAM_KPI_PLACEHOLDERS[member.team ?? ""] ?? []).map((k) => (
            <span key={k}
              className="inline-flex items-baseline gap-1 rounded-full border border-dashed border-[rgba(0,0,0,0.1)] bg-[#F6F5F4] px-2 py-0.5 text-[10.5px]">
              <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
              <span className="font-bold text-[#A8741A]">?</span>
            </span>
          ))}
          {!TEAM_KPI_PLACEHOLDERS[member.team ?? ""] && (
            <span className="text-[11px] font-medium text-[#A8741A]">?</span>
          )}
        </div>
      ) : viewMode === "matrix" ? (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(1, kpiKeys.length)}, 1fr)` }}>
          {kpiKeys.map((k) => {
            const v = member.kpi[k]
            const p = v?.goal ? Math.round((v.actual / v.goal) * 100) : 0
            const intensity = Math.min(1, p / 100)
            const bg = p >= 100 ? COLORS.green
              : p >= 70 ? `rgba(8,71,52,${0.15 + intensity * 0.45})`
              : p >= 50 ? `rgba(123,139,54,${0.15 + intensity * 0.45})`
              : `rgba(168,116,26,${0.15 + intensity * 0.45})`
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
    </div>
  )
}

function TeamRow({ team, members, defaultOpen }: { team: BranchKpiTeamRow; members: BranchKpiMemberRow[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen)
  const [viewMode, setViewMode] = useState<"list" | "matrix">("list")
  const teamHasKpi = KPI_ACTIVE_TEAMS.has(team.team)
  const hasMembers = members.length > 0
  const pct = team.goal ? Math.round((team.status / team.goal) * 100) : 0
  const expandable = hasMembers

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
          <span key={k}
            className="inline-flex items-baseline gap-1 rounded-full border border-dashed border-[rgba(0,0,0,0.1)] bg-[#F6F5F4] px-2 py-0.5 text-[10.5px]">
            <span className="font-semibold text-[#615D59]">{KPI_LABELS[k] ?? k}</span>
            <span className="font-bold text-[#A8741A]">?</span>
          </span>
        ))
      }
      return (
        <span className="text-[11px] font-bold text-[#A8741A]">?</span>
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
              매출 <span className="font-bold" style={{ color: COLORS.red }}>¥{krw(team.status)}</span> / ¥{krw(team.goal)}
            </span>
            <span className="font-bold" style={{ color: pct >= 70 ? COLORS.green : COLORS.amber }}>{pct}%</span>
          </div>
          <GaugeBar value={team.status} goal={team.goal} color={pct >= 70 ? COLORS.green : COLORS.olive} height={7} />
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {renderRightChip()}
        </div>
      </button>
      {open && expandable && (
        <div className="mb-3 rounded-[10px] bg-[#F6F5F4] p-3.5">
          {teamHasKpi && (
            <div className="mb-2 flex justify-end">
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
            </div>
          )}
          {members.map((m) => <MemberRow key={m.member} member={m} viewMode={viewMode} />)}
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
  const teamsWithMembers = useMemo(() => {
    if (!data) return []
    return data.teams.map((t) => ({
      team: t,
      members: data.members.filter((m) => m.team === t.team),
    }))
  }, [data])

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-[12px] text-rose-700">{error}</div>
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

  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">{headerTitle}</h2>
          <span className="text-[11px] font-medium text-[#615D59]">{headerSub}</span>
        </div>
        <p className="text-[10.5px] text-[#615D59]">
          <span className="font-semibold text-[#B43E3E]">빨강 = 확정 매출</span>
        </p>
      </div>
      <div className="px-5 pb-2 pt-1">
        {teamsWithMembers.map((t) => (
          <TeamRow key={t.team.team} team={t.team} members={t.members} defaultOpen={false} />
        ))}
      </div>
    </section>
  )
}

export { fmt }
