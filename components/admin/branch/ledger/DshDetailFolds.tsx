"use client"

// 장부 DSH 렌즈 상세 표 묶음(시안 "매출시트 DSH 1a", 2026-10) — 검수용 수치 표 4개(목표·실적
// 상세, 월별 페이스, 팀·멤버 수치, 주간 스냅샷 비교)를 한 카드 안의 접이식 행으로 둔다.
// 기본은 모두 접힘이다 — 펼칠 때 내용을 마운트하므로 표의 지연 로드 청크도 그때 받는다.
// 접힌 주간 스냅샷 행은 워크벤치가 이미 불러온 최근 두 스냅샷 비교를 한 줄로 요약한다.

import { CalendarDays, ChevronDown, ChevronUp, History, Table2, Users } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"
import { dshMonthLabel } from "./dsh-derive"
import {
  WEEKLY_CLOSE_BUCKET_META,
  formatSignedMoney,
  type WeeklyCloseDiffView,
  type WeeklyCloseRunView,
} from "./shared"

export interface WeeklySnapshotSummaryInput {
  runs: WeeklyCloseRunView[]
  base: string
  head: string
  diff: WeeklyCloseDiffView | null
  loading: boolean
  error: string | null
}

// 주간 스냅샷 접힌 행 요약 — "기준 → 현재 · 선택 월 합계 증감 · 버킷 건수"(0건 버킷 생략).
export function weeklySnapshotSummary({ runs, base, head, diff, loading, error }: WeeklySnapshotSummaryInput): string {
  if (error) return "스냅샷 비교를 불러오지 못했습니다 — 펼쳐서 확인하세요"
  if (!diff) {
    if (loading) return "스냅샷 비교를 불러오는 중"
    return runs.length < 2
      ? "비교하려면 스냅샷이 두 개 이상 필요합니다 — 펼쳐서 지금 스냅샷을 기록하세요"
      : "스냅샷 두 개를 골라 신규·증액·감액·소멸을 비교합니다"
  }
  const day = (id: string) => {
    const run = runs.find((candidate) => candidate.id === id)
    const date = run ? new Date(run.startedAt) : null
    return date && !Number.isNaN(date.getTime()) ? `${date.getMonth() + 1}/${date.getDate()}` : "?"
  }
  const buckets = WEEKLY_CLOSE_BUCKET_META.filter((meta) => meta.id !== "unchanged")
    .map((meta) => ({ label: meta.label, count: diff.buckets[meta.id]?.count ?? 0 }))
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => `${bucket.label} ${bucket.count}`)
  return [
    `${day(base)} → ${day(head)}`,
    `${dshMonthLabel(diff.month)} 합계 ${formatSignedMoney(diff.delta)}`,
    ...(buckets.length > 0 ? buckets : ["변동 없음"]),
  ].join(" · ")
}

interface DshDetailFoldsProps {
  numericGrid: ReactNode
  monthlyPace: ReactNode
  teamGrid: ReactNode
  weeklySnapshot: ReactNode
  // 접힌 행 요약용 — 워크벤치의 주간 스냅샷 상태를 그대로 받는다(요약 함수는 이 모듈에 둬서
  // 워크벤치가 정적 import로 이 지연 로드 청크를 끌어오지 않게 한다).
  weeklyState: WeeklySnapshotSummaryInput
}

export function DshDetailFolds({ numericGrid, monthlyPace, teamGrid, weeklySnapshot, weeklyState }: DshDetailFoldsProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const weeklySummary = weeklySnapshotSummary(weeklyState)
  const items = [
    {
      id: "numeric",
      Icon: Table2,
      title: "목표 · 실적 상세 표",
      description: "Goal · Status · Gap · Rate · 단위 천 · 원값 전환",
      content: numericGrid,
    },
    {
      id: "pace",
      Icon: CalendarDays,
      title: "월별 페이스 표",
      description: "월별 목표·실적·Gap·달성률 + 누적",
      content: monthlyPace,
    },
    { id: "team", Icon: Users, title: "팀 · 멤버 수치 표", description: "연간 · 분기 · 월별", content: teamGrid },
    { id: "weekly", Icon: History, title: "주간 스냅샷 비교", description: weeklySummary, content: weeklySnapshot },
  ]

  return (
    <section className="overflow-hidden rounded-[10px] border border-[rgba(0,0,0,0.08)] bg-white">
      {items.map(({ id, Icon, title, description, content }, index) => {
        const isOpen = Boolean(open[id])
        return (
          <div key={id} className={index > 0 ? "border-t border-[rgba(0,0,0,0.08)]" : ""}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`dsh-fold-${id}`}
              onClick={() => setOpen((current) => ({ ...current, [id]: !current[id] }))}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-3.5 text-left leading-tight transition hover:bg-[#FAFAF8] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734]/30 sm:px-[22px]"
            >
              <Icon className="h-4 w-4 shrink-0 text-[#084734]" aria-hidden />
              <span className="shrink-0 text-[13.5px] font-bold text-[#111110]">{title}</span>
              <span className="hidden min-w-0 truncate text-[12px] text-[#615D59] sm:block">{description}</span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-[#615D59]">
                {isOpen ? "접기" : "펼치기"}
                {isOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                )}
              </span>
            </button>
            {isOpen && (
              <div id={`dsh-fold-${id}`} className="px-2 pb-4 sm:px-4">
                {content}
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
