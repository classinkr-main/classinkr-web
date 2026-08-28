"use client"

import Link from "next/link"
import { ArrowUpRight, RefreshCw } from "lucide-react"

import type { CalendarHealthPayload, SourceHealthStatus } from "@/lib/admin-calendar/health"
import type { EventSource } from "@/lib/calendar-data"
import { getTeamMemberColor } from "@/lib/team-member-colors"

import { SOURCE_OPTIONS, getSourceColor, getSourceOption } from "./event-style"

/**
 * CalendarRail.tsx — 우측 264px 레일 카드 (3차 개편 P4, 월 뷰 기본 패널).
 *
 * 데이터 수집 상태 · {monthLabel} 소스별 통계 · 담당자 부하 · 퀵링크 3줄을 한 카드에 모은다.
 * 색·라벨·순서는 이 파일에서 새로 정의하지 않는다 — event-style.ts(SOURCE_OPTIONS 8종)와
 * lib/team-member-colors.ts(getTeamMemberColor)가 SSOT다. 연결 상태(ok/stale/dead) 판정도
 * lib/admin-calendar/health.ts가 SSOT — 이 파일은 그 값을 문구·색으로 옮기기만 한다.
 */

export interface CalendarRailProps {
  health: CalendarHealthPayload | null
  healthLoading?: boolean
  onRefreshHealth?: () => void
  sourceStats: { source: EventSource; count: number }[]
  assigneeLoad: { name: string; count: number }[]
  monthLabel: string
  totalCount: number
  leadKpis: { unrespondedCount: number; unresponded24hCount: number } | null
  publicEventCount: number
  notionCount: number
}

/** health.sources[].status(ok/stale/dead, lib/admin-calendar/health.ts SSOT) → 문구·색 */
const HEALTH_STATUS_META: Record<SourceHealthStatus, { label: string; color: string }> = {
  ok: { label: "정상", color: "#084734" },
  stale: { label: "지연", color: "#A8741A" },
  dead: { label: "끊김", color: "#B43E3E" },
}

/** health가 아직 없거나 그 소스 항목이 없을 때 — "끊겼다"고 단정하지 않고 "모른다"고 말한다 */
const HEALTH_UNKNOWN = { label: "—", color: "rgba(26,26,26,0.35)" }

function formatCount(count: number): string {
  return `${count}건`
}

/** 소스별·담당자별 공용 미니 바 — 라벨 줄(도트+라벨+count) + 5px 트랙 바. 트랙은 두 섹션 동일. */
function RailBarRow({
  label,
  count,
  maxCount,
  color,
}: {
  label: string
  count: number
  maxCount: number
  color: string
}) {
  const width = maxCount > 0 ? Math.min(100, (count / maxCount) * 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate font-medium text-[#3a3733]">{label}</span>
        </span>
        <span className="shrink-0 text-[#1a1a1a]/40">{formatCount(count)}</span>
      </div>
      <div className="h-[5px] w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function QuickLinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg p-2 text-[11px] text-[#3a3733] transition-colors hover:bg-[#f0f0ec]"
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ArrowUpRight className="h-[11px] w-[11px] shrink-0 text-[#1a1a1a]/35" />
    </Link>
  )
}

/** 3개 스켈레톤 줄 — health===null && healthLoading일 때만(그 외엔 8종 목록을 "—"로 그대로 보여준다) */
function HealthSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-3 w-full animate-pulse rounded-full bg-[#F0F0EC]" />
      ))}
    </div>
  )
}

export function CalendarRail({
  health,
  healthLoading = false,
  onRefreshHealth,
  sourceStats,
  assigneeLoad,
  monthLabel,
  totalCount,
  leadKpis,
  publicEventCount,
  notionCount,
}: CalendarRailProps) {
  const healthBySource = new Map((health?.sources ?? []).map((item) => [item.source, item]))
  const showHealthSkeleton = health === null && healthLoading
  const maxSourceCount = Math.max(1, ...sourceStats.map((item) => item.count))
  const maxAssigneeCount = Math.max(1, ...assigneeLoad.map((item) => item.count))

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[#e8e8e4] bg-[#FCFCFA]">
      {/* 1) 데이터 수집 */}
      <section className="border-b border-[#e8e8e4] px-4 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-[#111110]">데이터 수집</h3>
          <button
            type="button"
            onClick={onRefreshHealth}
            disabled={!onRefreshHealth || healthLoading}
            aria-label="연결 상태 새로고침"
            className="rounded-md p-1 text-[#1a1a1a]/35 transition-colors hover:bg-[#f0f0ec] hover:text-[#111110] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${healthLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {showHealthSkeleton ? (
          <HealthSkeleton />
        ) : (
          <ul className="space-y-1.5">
            {SOURCE_OPTIONS.map((option) => {
              const record = healthBySource.get(option.value)
              const meta = record ? HEALTH_STATUS_META[record.status] : HEALTH_UNKNOWN
              return (
                <li key={option.value} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: option.dot }}
                    />
                    <span className="truncate font-medium text-[#3a3733]">{option.label}</span>
                  </span>
                  <span className="shrink-0 font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 2) {monthLabel} 통계 */}
      <section className="border-b border-[#e8e8e4] px-4 py-3">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-[#111110]">{monthLabel} 통계</h3>
          <span className="shrink-0 text-[10px] text-[#1a1a1a]/40">{formatCount(totalCount)}</span>
        </div>

        {sourceStats.length === 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/35">이 기간 일정 없음</p>
        ) : (
          <div className="space-y-2">
            {sourceStats.map((item) => (
              <RailBarRow
                key={item.source}
                label={getSourceOption(item.source)?.label ?? item.source}
                count={item.count}
                maxCount={maxSourceCount}
                color={getSourceColor(item.source)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 3) 담당자 부하 */}
      <section className="border-b border-[#e8e8e4] px-4 py-3">
        <h3 className="mb-2.5 text-[12px] font-semibold text-[#111110]">담당자 부하 · {monthLabel}</h3>

        {assigneeLoad.length === 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/35">배정된 담당자 없음</p>
        ) : (
          <div className="space-y-2">
            {assigneeLoad.map((item) => (
              <RailBarRow
                key={item.name}
                label={item.name}
                count={item.count}
                maxCount={maxAssigneeCount}
                color={getTeamMemberColor(item.name)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4) 퀵링크 — CRM은 미응답 리드가 있을 때만(0건이면 숨김), 나머지는 0건도 정직하게 보여준다 */}
      <section className="p-2">
        {leadKpis && leadKpis.unrespondedCount > 0 && (
          <QuickLinkRow href="/admin/crm">
            CRM — 미응답 리드{" "}
            <strong className="font-semibold text-[#B85C33]">
              {formatCount(leadKpis.unrespondedCount)}
            </strong>
            {leadKpis.unresponded24hCount > 0 && (
              <span className="font-semibold text-[#B43E3E]">
                {" "}
                · 24h+ {formatCount(leadKpis.unresponded24hCount)}
              </span>
            )}
          </QuickLinkRow>
        )}
        <QuickLinkRow href="/admin/events">행사 관리 — 공개 행사 {formatCount(publicEventCount)}</QuickLinkRow>
        <QuickLinkRow href="/admin/campaigns">캠페인 — 노션 일정 {formatCount(notionCount)}</QuickLinkRow>
      </section>
    </div>
  )
}
