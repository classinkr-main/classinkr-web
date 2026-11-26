"use client"
// KR Team 개요 맨 위 왼쪽 카드(2026-11-25 시안 '개요 A · 다듬기').
// 확정 매출 · 달성률 · 목표/남은 목표 · 로드맵 막대(확정 뒤에 남은 기간 고확도를 이어 그림) · 총 고객수 · 칠판 판매 대수.
// 숫자는 모두 기존 원천 그대로다: 확정·목표는 summary(REV 장부·1. DSH), 고확도 잔량은 월별 목표 차트와 같은 REV 캐논,
// 고객수·칠판은 GET /api/admin/branch/sales-counts. 서로 더하지 않는다.
import Link from "next/link"
import { useMemo } from "react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { branchTeamLabel } from "@/lib/branch/current-organization"
import { cnyExact } from "@/lib/branch/money-format"
import { heroRoadmapSegments, remainingHighConfidence } from "@/lib/branch/overview-hero"
import { branchManagerLabel } from "@/lib/branch/personal-scope"
import type { BranchSalesCounts } from "@/lib/branch/sales-counts-contract"
import type { BranchJsonState } from "../client-api"
import MoneyValue from "../MoneyValue"
import type { BranchSummaryResponse, Period } from "../types"
import type { RevenueFlow } from "./RevenueFlowSection"

const MILESTONES = [25, 50, 75]

function RoadmapBar({ actual, goal, remainingHigh, highReady, highError }: {
  actual: number
  goal: number
  remainingHigh: number
  /** REV 행(pipeline)이 도착했는가 — 아니면 고확도 막대는 그리지 않고 상태만 알린다. */
  highReady: boolean
  highError: boolean
}) {
  const seg = heroRoadmapSegments(actual, goal, remainingHigh)
  const confirmed = CONFIDENCE_TOKENS.confirmed
  const high = CONFIDENCE_TOKENS["high-confidence"]
  return (
    <div>
      <div
        role="img"
        aria-label={`매출 로드맵 — 확정 ${cnyExact(actual)} CNY, 목표 ${cnyExact(goal)} CNY${highReady ? `, 남은 기간 고확도 ${cnyExact(remainingHigh)} CNY` : ""}`}
        className="relative h-3.5 overflow-hidden rounded-[7px] bg-[#F0F0EC]"
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${seg.confirmedPct}%`, background: confirmed.color }} />
        {highReady && seg.highPct > 0 ? (
          <div className="absolute bottom-[3px] top-[3px]" style={{ left: `${seg.confirmedPct}%`, width: `${seg.highPct}%`, background: high.color }} />
        ) : null}
      </div>
      <div className="relative mt-1 h-5 text-[11.5px] font-medium text-[#615D59]" aria-hidden="true">
        {MILESTONES.map((pct) => (
          <span key={pct} className="absolute -translate-x-1/2" style={{ left: `${pct}%` }}>{pct}%</span>
        ))}
        <span className="absolute right-0">목표 100%</span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#615D59]">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-[9px] w-[9px]" style={{ background: confirmed.color }} />
          확정 <MoneyValue value={actual} /> (로드맵 진행)
        </span>
        {highReady ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-[9px] w-[9px]" style={{ background: high.color }} />
            남은 기간 고확도 <MoneyValue value={remainingHigh} />
            {seg.projectedPct != null ? <> — 들어오면 <b className="tabular-nums text-[#111110]">{seg.projectedPct.toFixed(0)}%</b></> : null}
          </span>
        ) : highError ? (
          <span role="status">남은 기간 고확도를 불러오지 못했습니다 · 0이 아닙니다.</span>
        ) : (
          <span role="status">남은 기간 고확도를 불러오는 중입니다.</span>
        )}
      </div>
    </div>
  )
}

function CountTile({ label, fyLabel, children, sub, badge }: {
  label: string
  fyLabel: string | null
  children: React.ReactNode
  sub: React.ReactNode
  badge?: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[rgba(0,0,0,0.08)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] font-medium text-[#615D59]">
        <span>{label}</span>
        {fyLabel ? <span className="rounded border border-[rgba(0,0,0,0.08)] px-1 text-[10.5px] tabular-nums">{fyLabel} 누계</span> : null}
        {badge}
      </div>
      <div className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[#111110]">{children}</div>
      <p className="mt-1 text-[11.5px] leading-snug tabular-nums text-[#615D59]">{sub}</p>
    </div>
  )
}

/** 총 고객수 · 칠판 판매 대수 두 칸. 큰 숫자 = 회계연도 누계, 작게 전체 누적을 병기. 정적 렌더 테스트 대상. */
export function SalesCountTiles({ counts }: { counts: Pick<BranchJsonState<BranchSalesCounts>, "data" | "loading" | "error" | "stale"> }) {
  const { data, loading, error, stale } = counts
  if (!data) {
    if (error) {
      return (
        <p role="alert" className="rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3.5 py-3 text-[12px] font-semibold text-[#8F2C2C]">
          총 고객수·칠판 판매 대수를 불러오지 못했습니다 · {error}
        </p>
      )
    }
    return (
      <div role="status" aria-label="총 고객수와 칠판 판매 대수를 불러오는 중" aria-busy={loading} className="grid gap-3 sm:grid-cols-2">
        <div className="h-[92px] animate-pulse rounded-lg bg-[#F0F0EC]" />
        <div className="h-[92px] animate-pulse rounded-lg bg-[#F0F0EC]" />
      </div>
    )
  }

  const { customers, boards, fyLabel } = data
  const sameAsFy = customers.allTime === customers.fy
  return (
    <div className="space-y-2">
      {stale ? <p role="status" className="text-[11.5px] text-[#7A520F]">갱신 실패 — 저장된 값을 표시합니다.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <CountTile
          label="총 고객"
          fyLabel={fyLabel}
          sub={<>확정 {customers.fyConfirmed} · 이번 달 {customers.month} · 전체 {customers.allTime}{sameAsFy ? " (장부 기록 범위)" : " 누적"}</>}
        >
          {customers.fy.toLocaleString("ko-KR")}<span className="ml-0.5 text-[14px] font-semibold">곳</span>
        </CountTile>
        {boards.state === "ready" ? (
          <CountTile
            label="칠판 판매"
            fyLabel={fyLabel}
            badge={<span title="하드웨어 원장에는 팀·담당 구분이 없어 팀·개인 범위에서도 전사 수치입니다. KR 매출·고객수와 합산하지 않습니다." className="cursor-help rounded bg-[#F6F5F4] px-1 text-[10.5px] text-[#615D59]">전사</span>}
            sub={<>이번 달 {boards.month} · 예정 {boards.fyPlanned} · 프로모션 {boards.fyPromotion} · 전체 누적 {boards.allTime}</>}
          >
            {boards.fy.toLocaleString("ko-KR")}<span className="ml-0.5 text-[14px] font-semibold">대</span>
          </CountTile>
        ) : (
          <div role="alert" className="min-w-0 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-3.5 py-3 text-[12px] font-semibold text-[#7A520F]">
            칠판 판매 대수를 불러오지 못했습니다
            <p className="mt-1 font-normal">하드웨어 판매 원장을 읽지 못해 대수를 비워 둡니다 · 0대가 아닙니다.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OverviewHeroCard({ summary, flow, counts, periodLabel, period, selectedMonth }: {
  summary: BranchSummaryResponse
  flow: RevenueFlow
  counts: BranchJsonState<BranchSalesCounts>
  periodLabel: string
  period: Period
  selectedMonth: string
}) {
  const { confirmed: actual, goal, pacing_pct: pacing } = summary.revenue
  const scope = summary.scope?.manager ? branchManagerLabel(summary.scope.manager) : branchTeamLabel(summary.team)
  const highReady = !!flow.pipeline.data
  const remainingHigh = useMemo(
    () => (flow.pipeline.data
      ? remainingHighConfidence(flow.ledgerRows, flow.monthlyGoals, { scope: period, selectedMonth, todayMonth: flow.todayMonth })
      : 0),
    [flow.pipeline.data, flow.ledgerRows, flow.monthlyGoals, period, selectedMonth, flow.todayMonth],
  )

  return (
    <section aria-label="확정 매출" className="flex min-w-0 flex-col gap-4 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-bold text-[#111110]">확정 매출</h2>
        <span className="text-[12px] text-[#615D59]">{scope} · {periodLabel} · CNY</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <strong className="text-[36px] font-bold leading-none tracking-[-0.03em] tabular-nums md:text-[44px]" style={{ color: CONFIDENCE_TOKENS.confirmed.color }}><MoneyValue value={actual} /></strong>
        <span className="text-[22px] font-bold tabular-nums text-[#084734]">{goal > 0 ? `${pacing.toFixed(1)}%` : "목표 기준 없음"}</span>
        <span className="text-[12px] text-[#615D59]">
          목표 <MoneyValue value={goal} />
          {goal > 0 ? <> · {actual >= goal ? "목표 초과 " : "목표까지 "}<MoneyValue value={Math.abs(goal - actual)} /></> : null}
        </span>
      </div>
      {goal > 0 ? (
        <RoadmapBar actual={actual} goal={goal} remainingHigh={remainingHigh} highReady={highReady} highError={!!flow.pipeline.error && !highReady} />
      ) : (
        <p className="text-[12px] text-[#615D59]">승인 목표가 없어 달성률과 로드맵을 계산하지 않습니다.</p>
      )}
      <SalesCountTiles counts={counts} />
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] pt-3 text-[11.5px] text-[#615D59]">
        <p>확정액: REV 장부 · 목표: 1. DSH · 미승인 조정안(0. DSH_NEW_TEMP) 제외</p>
        <Link href="/admin/branch/ledger?lens=rev" className="inline-flex min-h-11 items-center font-semibold text-[#084734] underline underline-offset-2 md:min-h-0">장부에서 열기 ↗</Link>
      </div>
    </section>
  )
}
