"use client"

import { useMemo } from "react"

import ShowMore, { useVisibleCount } from "@/components/admin/ui/ShowMore"
import { getLeadMagnetLabel } from "@/components/admin/crm/leads/shared"
import {
  TRACKING_DIMENSIONS,
  getLeadTrackingKey,
  type TrackingDimension,
} from "@/lib/crm/lead-attribution"
import { buildTrackingRollup } from "@/lib/crm/lead-ranking"
import type { LeadRecord } from "@/lib/repositories/leads"

// 마케팅 렌즈 전용 트래킹 롤업 — "무엇이 이 리드들을 만들었나"를 축 하나씩 접어 보여준다.
// 전체 렌즈의 단계별 현황·담당자 카드 자리를 대체한다(패널을 더하지 않고 바꿔 끼운다).

const TRACKING_ROW_STEP = 8

function formatKeyLabel(dimension: TrackingDimension, key: string) {
  if (dimension === "magnet") return getLeadMagnetLabel(key) || key
  return key
}

export default function LeadTrackingPanel({
  leads,
  dimension,
  onDimensionChange,
  activeKey,
  onSelectKey,
}: {
  leads: LeadRecord[]
  dimension: TrackingDimension
  onDimensionChange: (dimension: TrackingDimension) => void
  activeKey: string | null
  onSelectKey: (key: string | null) => void
}) {
  const rollup = useMemo(
    () => buildTrackingRollup(leads, (lead) => getLeadTrackingKey(lead, dimension)),
    [leads, dimension]
  )
  const {
    visible,
    showMore,
    collapse,
    canMore,
    canCollapse,
  } = useVisibleCount(rollup.rows.length, TRACKING_ROW_STEP)

  const maxTotal = rollup.rows[0]?.total ?? 0
  const trackedCount = rollup.total - rollup.untrackedCount
  const dimensionHint = TRACKING_DIMENSIONS.find((item) => item.key === dimension)?.hint ?? ""

  return (
    <div className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1a1a1a]/30">Tracking</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#111110]">유입 트래킹</h2>
          <p className="mt-0.5 text-[12px] text-[#1a1a1a]/45">{dimensionHint}</p>
        </div>
        <span className="shrink-0 rounded-full bg-[#f0f0ec] px-3 py-1 text-[12px] font-medium text-[#1a1a1a]/55">
          귀속 {trackedCount.toLocaleString("ko-KR")} / {rollup.total.toLocaleString("ko-KR")}건
        </span>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {TRACKING_DIMENSIONS.map((item) => {
          const active = dimension === item.key
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onDimensionChange(item.key)}
              className={`inline-flex h-[30px] items-center rounded-full px-3 text-[12px] font-medium transition-colors ${
                active
                  ? "bg-[#111110] text-white"
                  : "border border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
              }`}
            >
              {item.label}
            </button>
          )
        })}
        {activeKey ? (
          <button
            type="button"
            onClick={() => onSelectKey(null)}
            className="ml-auto text-[12px] font-medium text-[#084734] hover:text-[#065c41]"
          >
            트래킹 필터 해제
          </button>
        ) : null}
      </div>

      {rollup.rows.length === 0 ? (
        <p className="rounded-xl bg-[#fafaf8] px-3 py-8 text-center text-[13px] text-[#1a1a1a]/30">
          이 축으로 기록된 리드가 없습니다.
        </p>
      ) : (
        <div className="divide-y divide-[#f0f0ec]">
          {rollup.rows.slice(0, visible).map((row) => {
            const active = activeKey === row.key
            const share = maxTotal > 0 ? Math.round((row.total / maxTotal) * 100) : 0
            return (
              <button
                key={row.key}
                type="button"
                onClick={() => onSelectKey(active ? null : row.key)}
                className={`relative flex w-full items-center justify-between gap-3 overflow-hidden px-2 py-2.5 text-left transition-colors ${
                  active ? "bg-[#ECFDF5]" : "hover:bg-[#fafaf8]"
                }`}
              >
                {/* 건수 비율 막대 — 행 배경으로만 깔아 텍스트 위계를 건드리지 않는다. */}
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 ${active ? "bg-[#D7EBDD]/60" : "bg-[#f0f0ec]/70"}`}
                  style={{ width: `${share}%` }}
                />
                <span className="relative min-w-0 flex-1 truncate text-[13px] font-medium text-[#111110]">
                  {formatKeyLabel(dimension, row.label)}
                </span>
                <span className="relative flex shrink-0 items-center gap-3 text-[11px] text-[#1a1a1a]/45">
                  {row.unresponded > 0 ? (
                    <span className="font-medium text-[#B85C33]">미응답 {row.unresponded}</span>
                  ) : null}
                  <span>신규 {row.newCount}</span>
                  <span>연락중 {row.contacted}</span>
                  <span className={row.converted > 0 ? "font-medium text-[#084734]" : ""}>
                    전환 {row.converted}
                  </span>
                  <span className="w-[3.2rem] text-right tabular-nums">
                    {row.total > 0 ? `${Math.round(row.convRate * 100)}%` : "—"}
                  </span>
                  <span className="min-w-[2.5rem] text-right text-[14px] font-bold tabular-nums text-[#111110]">
                    {row.total}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-col items-center gap-2">
        {rollup.untrackedCount > 0 ? (
          <p className="text-[11px] text-[#1a1a1a]/40">
            이 축에 값이 없는 리드 {rollup.untrackedCount.toLocaleString("ko-KR")}건은 집계에서 빠집니다.
          </p>
        ) : null}
        {canMore || canCollapse ? (
          <ShowMore
            visible={visible}
            total={rollup.rows.length}
            step={TRACKING_ROW_STEP}
            onMore={showMore}
            onCollapse={canCollapse ? collapse : undefined}
          />
        ) : null}
      </div>
    </div>
  )
}
