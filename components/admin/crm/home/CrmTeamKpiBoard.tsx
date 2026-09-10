"use client"

// CRM 홈 — 지사(branch) KPI 위젯 묶음: 팀 KPI 보드 · 활동 목표 게이지 · 달성 랭킹.
// app/admin/crm/page.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { useMemo, type ReactNode } from "react"
import { BarChart3, Building2, CircleDollarSign, ReceiptText } from "lucide-react"
import { StatTile } from "@/components/admin/viz"
import { formatCNY } from "@/lib/crm/money-format"
import {
  aggregateBranchKpi,
  BRANCH_KPI_DEFS,
  formatKpiActual,
  formatNumber,
  formatOverviewDate,
  formatPercent,
  formatUSD,
  sumBranchKpi,
  ValueSkeleton,
  type AdminCrmOverview,
  type BranchKpiMemberRow,
  type BranchKpiResponse,
} from "./shared"

// KPI 타일 로컬 재구현 금지(W2-2b) — 마크업은 viz StatTile(soft 변형)에 위임하는 어댑터.
function CrmMeasurementTile({
  icon,
  label,
  value,
  hint,
  tone = "text-[#111110]",
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  hint: string
  tone?: string
}) {
  return (
    <StatTile
      icon={icon}
      iconLayout="inline"
      variant="soft"
      compact
      label={label}
      value={tone === "text-[#111110]" ? value : <span className={tone}>{value}</span>}
      hint={hint}
    />
  )
}

// 총/팀별/개인별 공용 매트릭스 — 행(팀 또는 개인)별로 5개 지표 actual·기준·달성률을 표로.
function BranchKpiMatrix({
  rows,
  emptyLabel,
}: {
  rows: Array<{ key: string; label: string; sub?: string; members: BranchKpiMemberRow[] }>
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl bg-[#fafaf8] px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">{emptyLabel}</p>
    )
  }
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1a1a1a]/35">
            <th className="px-2 pb-2 font-semibold">이름</th>
            {BRANCH_KPI_DEFS.map((d) => (
              <th key={d.key} className="px-2 pb-2 text-right font-semibold">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-[#f0f0ec]">
              <td className="px-2 py-2 align-top">
                <p className="text-[13px] font-semibold text-[#111110]">{row.label}</p>
                {row.sub ? <p className="text-[11px] text-[#1a1a1a]/40">{row.sub}</p> : null}
              </td>
              {BRANCH_KPI_DEFS.map((d) => {
                const totals = sumBranchKpi(row.members, d.key)
                const rate = totals.goal > 0 ? totals.actual / totals.goal : null
                return (
                  <td key={d.key} className="px-2 py-2 text-right align-top tabular-nums">
                    <p
                      className={`text-[13px] font-bold ${
                        rate == null || rate >= 0.7 ? "text-[#111110]" : "text-[#B85C33]"
                      }`}
                    >
                      {formatKpiActual(totals.actual)}
                    </p>
                    <p className="text-[10px] text-[#1a1a1a]/35">
                      /{formatKpiActual(totals.goal)} · {formatPercent(rate)}
                    </p>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 하단 성과 KPI 보드 — 총·팀별·개인별을 한곳에 정리한다.
export default function CrmTeamKpiBoard({
  overview,
  branchKpis,
  loading,
  branchError,
  month,
}: {
  overview: AdminCrmOverview | null
  branchKpis: BranchKpiResponse | null
  loading: boolean
  branchError: string | null
  month: string
}) {
  // 콜드 로드 — '...' 텍스트 대신 타일 값 크기 스켈레톤(CRM-5).
  const loadingValue = loading && !overview ? <ValueSkeleton className="h-5 w-16" /> : null
  const neoCrm = overview?.neoCrm ?? null
  const neoKpis = neoCrm?.kpis
  const members = useMemo(() => branchKpis?.members ?? [], [branchKpis])

  const teamRows = useMemo(() => {
    const map = new Map<string, BranchKpiMemberRow[]>()
    for (const member of members) {
      const key = member.team?.trim() || "미지정"
      const list = map.get(key)
      if (list) list.push(member)
      else map.set(key, [member])
    }
    return Array.from(map.entries()).map(([team, rows]) => ({
      key: team,
      label: team,
      sub: `${rows.length}명`,
      members: rows,
    }))
  }, [members])

  const memberRows = useMemo(
    () =>
      members.map((member, index) => ({
        key: `${member.member}-${index}`,
        label: member.member,
        sub: member.team ?? undefined,
        members: [member],
      })),
    [members]
  )

  const sectionLabel = "text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]/40"
  const branchEmpty = branchError ?? "이번 달 KPI 레코드가 없습니다."

  return (
    <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Performance KPI</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">KPI · 총 · 팀별 · 개인별</h2>
          <p className="mt-1 text-[12px] text-[#1a1a1a]/40">
            {month} · 외부 CRM 동기화 완료량 기준
          </p>
        </div>
        <span className="inline-flex h-8 items-center rounded-full bg-[#ECFDF5] px-3 text-[12px] font-semibold text-[#084734]">
          Sync {formatOverviewDate(neoCrm?.latestSyncedAt)}
        </span>
      </div>

      <div>
        <p className={sectionLabel}>총 · 한국팀 전체</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CrmMeasurementTile
            icon={<CircleDollarSign className="h-4 w-4" />}
            label="동기화 매출"
            value={loadingValue ?? formatCNY(neoKpis?.salesAmountMonth)}
            hint={`완료 ${formatNumber(neoKpis?.salesCountMonth)}건 · 본사 CRM 원천`}
            tone="text-[#084734]"
          />
          <CrmMeasurementTile
            icon={<BarChart3 className="h-4 w-4" />}
            label="확정 임박"
            value={loadingValue ?? formatUSD(neoKpis?.opportunityAmount)}
            hint={`상기 완료량 ${formatNumber(neoKpis?.opportunityCountMonth)}건 · USD 원천`}
            tone="text-[#084734]"
          />
          <CrmMeasurementTile
            icon={<Building2 className="h-4 w-4" />}
            label="동기화 고객"
            value={loadingValue ?? formatNumber(neoKpis?.activeAccountCountMonth)}
            hint={`고객 완료량 · 전체 ${formatNumber(neoKpis?.accountCount)}개`}
            tone="text-[#111110]"
          />
          <CrmMeasurementTile
            icon={<ReceiptText className="h-4 w-4" />}
            label="동기화 수금"
            value={loadingValue ?? formatCNY(neoKpis?.collectionAmountMonth)}
            hint={`수금 완료량 ${formatNumber(neoKpis?.collectionCountMonth)}건 · 30일 ${formatCNY(
              neoKpis?.collectionAmount30d
            )}`}
            tone="text-[#111110]"
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {BRANCH_KPI_DEFS.map((item) => {
            const totals = aggregateBranchKpi(branchKpis, item.key)
            const rate = totals.goal > 0 ? totals.actual / totals.goal : null
            return (
              <CrmMeasurementTile
                key={item.key}
                icon={item.icon}
                label={item.label}
                value={branchError ? "-" : loading && !branchKpis ? <ValueSkeleton className="h-5 w-12" /> : formatKpiActual(totals.actual)}
                hint={
                  branchError ??
                  `${item.hintLabel} · 기준 ${formatKpiActual(totals.goal)} · 달성률 ${formatPercent(rate)}`
                }
                tone={rate == null || rate >= 0.7 ? "text-[#084734]" : "text-[#B85C33]"}
              />
            )
          })}
        </div>
      </div>

      <div className="mt-5 border-t border-[#f0f0ec] pt-4">
        <p className={sectionLabel}>팀별</p>
        <div className="mt-2">
          <BranchKpiMatrix rows={teamRows} emptyLabel={branchEmpty} />
        </div>
      </div>

      <div className="mt-5 border-t border-[#f0f0ec] pt-4">
        <p className={sectionLabel}>개인별</p>
        <div className="mt-2">
          <BranchKpiMatrix rows={memberRows} emptyLabel={branchEmpty} />
        </div>
      </div>
    </section>
  )
}

// 활동 목표 달성률 게이지 — branch KPI(LD/ACC/OPP/SOL/VST) actual/goal 합산. 매출 아닌 "활동" 목표임을 명시.
export function ActivityGoalGauge({ branchKpis }: { branchKpis: BranchKpiResponse | null }) {
  const totals = BRANCH_KPI_DEFS.reduce(
    (acc, def) => {
      const t = aggregateBranchKpi(branchKpis, def.key)
      acc.actual += t.actual
      acc.goal += t.goal
      return acc
    },
    { actual: 0, goal: 0 }
  )
  if (totals.goal <= 0) return null
  const ratio = totals.actual / totals.goal
  const pct = Math.round(ratio * 100)
  const radius = 16
  const circumference = 2 * Math.PI * radius
  const dash = circumference * Math.min(1, Math.max(0, ratio))
  const tone = ratio >= 0.7 ? "#084734" : "#B85C33"
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-12 w-12 shrink-0">
        <svg viewBox="0 0 40 40" className="h-12 w-12 -rotate-90">
          <circle cx="20" cy="20" r={radius} fill="none" stroke="#f0f0ec" strokeWidth="5" />
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#111110]">
          {pct}%
        </span>
      </div>
      <div className="leading-tight">
        <p className="text-[11px] font-semibold text-[#111110]">활동 목표 달성률</p>
        <p className="text-[10px] text-[#1a1a1a]/40">리드·고객·방문 등 5지표 합산 · 매출 아님</p>
      </div>
    </div>
  )
}

// 활동 목표 달성 랭킹 — branch KPI(5지표) actual/goal 합산 달성률로 개인 정렬. 더미 아님(실 KPI 레코드).
export function CrmRankingBoard({ branchKpis }: { branchKpis: BranchKpiResponse | null }) {
  const ranked = useMemo(() => {
    const members = branchKpis?.members ?? []
    return members
      .map((member) => {
        const totals = BRANCH_KPI_DEFS.reduce(
          (acc, def) => {
            const value = member.kpi?.[def.key]
            acc.actual += Number(value?.actual ?? 0)
            acc.goal += Number(value?.goal ?? 0)
            return acc
          },
          { actual: 0, goal: 0 }
        )
        const ratio = totals.goal > 0 ? totals.actual / totals.goal : 0
        return { member: member.member, team: member.team, ratio }
      })
      .filter((row) => row.ratio > 0)
      .sort((a, b) => b.ratio - a.ratio)
  }, [branchKpis])

  if (ranked.length === 0) return null
  const max = ranked[0].ratio || 1

  return (
    <section className="mt-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1a1a]/40">Performance Ranking</p>
        <h3 className="mt-0.5 text-[15px] font-bold text-[#111110]">활동 목표 달성 랭킹</h3>
        <p className="text-[11px] text-[#1a1a1a]/35">5지표 합산 달성률 · 규칙 기반</p>
      </div>
      <div className="divide-y divide-[#f0f0ec]">
        {ranked.slice(0, 10).map((row, index) => (
          <div key={`${row.member}-${index}`} className="flex items-center gap-3 py-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ${
                index === 0
                  ? "bg-[#084734] text-white"
                  : index <= 2
                    ? "bg-[#ECFDF5] text-[#084734]"
                    : "bg-[#fafaf8] text-[#1a1a1a]/50"
              }`}
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[#111110]">
                {row.member}
                {row.team ? <span className="ml-1.5 text-[11px] font-medium text-[#1a1a1a]/40">{row.team}</span> : null}
              </p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(4, Math.round((row.ratio / max) * 100))}%`,
                    backgroundColor: row.ratio >= 0.7 ? "#084734" : "#B85C33",
                  }}
                />
              </div>
            </div>
            <span
              className={`shrink-0 text-[13px] font-bold tabular-nums ${row.ratio >= 0.7 ? "text-[#111110]" : "text-[#B85C33]"}`}
            >
              {Math.round(row.ratio * 100)}%
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
