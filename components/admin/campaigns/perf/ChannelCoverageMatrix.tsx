"use client"

import { useMemo, useState } from "react"
import { ChevronDown } from "lucide-react"
import {
  GA4_MEASUREMENT_ID,
  GOOGLE_ADS_DEMO_CONVERSION_LABEL,
  KAKAO_PIXEL_ID,
  META_PIXEL_ID,
  NAVER_LEAD_CONVERSION_TYPE,
  NAVER_WCS_ID,
} from "@/lib/analytics-config"
import {
  buildChannelCoverage,
  coverageScore,
  type CoverageCell,
  type CoverageState,
} from "@/lib/marketing/channel-coverage"
import type { PerfChannelLive } from "@/lib/marketing/perf"
import { AD_CHANNEL_COLOR, AD_CHANNEL_LABEL } from "@/lib/types/event-metrics"

/**
 * 채널 커버리지 매트릭스 — 채널 × (집행 데이터 · 리드 귀속 · 전환 추적).
 *
 * "어디가 비었나"를 한 장으로 보여주는 표다. 판정은 문서가 아니라 **이 배포의 실제 설정값**에서
 * 나온다(lib/marketing/channel-coverage.ts). 그래서 env 를 채우면 이 표가 바로 바뀐다.
 *
 * 상태색은 DESIGN.md §2 **운영 상태 스케일**을 쓴다 — 채널 브랜드색(AD_CHANNEL_COLOR)은
 * 행 왼쪽 점에만. 두 체계를 섞으면 "네이버 초록"이 "정상 초록"처럼 읽힌다.
 */
export interface ChannelCoverageMatrixProps {
  channels: readonly PerfChannelLive[]
  /** 기본 접힘 여부 — 요약탭에서는 접어 두고 필요할 때 편다. */
  defaultOpen?: boolean
}

const STATE_STYLE: Record<CoverageState, { label: string; className: string }> = {
  live: { label: "연동", className: "bg-[#ECFDF5] text-[#084734] border-[#BDEFD8]" },
  partial: { label: "반쪽", className: "bg-[#FBF1E0] text-[#A8741A] border-[#ECD29C]" },
  none: { label: "없음", className: "bg-[#FCE9E9] text-[#B43E3E] border-[#F2B8B8]" },
  manual: { label: "수기", className: "bg-[#f0f0ec] text-[#1a1a1a]/55 border-[#e8e8e4]" },
  // 고칠 수 있는 빈칸이 아니다 — 뉴트럴로 물러나 danger 와 섞이지 않게 한다.
  na: { label: "해당 없음", className: "bg-transparent text-[#A39E98] border-[#e8e8e4]" },
}

function Cell({ cell, label }: { cell: CoverageCell; label: string }) {
  const style = STATE_STYLE[cell.state]
  return (
    <div className="flex flex-col gap-1.5 px-3 py-3">
      <span className="text-[10.5px] uppercase tracking-[0.1em] text-[#A39E98] lg:hidden">
        {label}
      </span>
      <span
        className={`inline-flex w-fit items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${style.className}`}
      >
        {style.label}
      </span>
      <span className="text-[11.5px] leading-snug text-[#615D59]">{cell.note}</span>
    </div>
  )
}

export function ChannelCoverageMatrix({ channels, defaultOpen = false }: ChannelCoverageMatrixProps) {
  const [open, setOpen] = useState(defaultOpen)

  const rows = useMemo(
    () =>
      buildChannelCoverage({
        live: channels.map((entry) => ({
          channel: entry.channel,
          configured: entry.configured,
          spend: entry.spend,
          dataThrough: entry.dataThrough,
        })),
        googleConversionLabelSet: Boolean(GOOGLE_ADS_DEMO_CONVERSION_LABEL),
        naverWcsSet: Boolean(NAVER_WCS_ID),
        naverConversionTypeSet: Boolean(NAVER_LEAD_CONVERSION_TYPE),
        // GA4 는 gtag 위에 얹히므로 픽셀 판정과 별개다 — Meta 판정에는 쓰지 않는다.
        metaPixelSet: Boolean(META_PIXEL_ID),
        kakaoPixelSet: Boolean(KAKAO_PIXEL_ID),
      }),
    [channels]
  )

  // 요약 배지: 전 채널 합쳐 몇 축이 완전 연동인지. 수기 전용 축은 분모에서 빠진다.
  const total = rows.reduce(
    (acc, row) => {
      const score = coverageScore(row)
      return { live: acc.live + score.live, total: acc.total + score.total }
    },
    { live: 0, total: 0 }
  )
  const gaps = total.total - total.live

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#FAFAF8] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#084734]"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[13.5px] font-semibold text-[#111110]">채널 커버리지</span>
          <span className="text-[11.5px] tabular-nums text-[#A39E98]">
            집행 데이터 · 리드 귀속 · 전환 추적 {total.live}/{total.total}
          </span>
          {gaps > 0 && (
            <span className="rounded border border-[#ECD29C] bg-[#FBF1E0] px-1.5 py-px text-[11px] font-semibold text-[#A8741A]">
              빈칸 {gaps}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[#A39E98] transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="border-t border-[#e8e8e4]">
          {/* 데스크톱 헤더 — 모바일에서는 각 셀이 자기 라벨을 들고 있다(Cell 의 lg:hidden). */}
          <div className="hidden grid-cols-[168px_repeat(3,minmax(0,1fr))] border-b border-[#e8e8e4] bg-[#F6F5F4] lg:grid">
            {["채널", "집행 데이터", "리드 귀속", "전환 추적"].map((label) => (
              <div
                key={label}
                className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A39E98]"
              >
                {label}
              </div>
            ))}
          </div>

          {rows.map((row) => (
            <div
              key={row.channel}
              className="grid grid-cols-1 border-b border-[#f0f0ec] last:border-b-0 lg:grid-cols-[168px_repeat(3,minmax(0,1fr))]"
            >
              <div className="flex items-center gap-2 bg-[#F6F5F4] px-3 py-2.5 lg:bg-transparent">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: AD_CHANNEL_COLOR[row.channel] }}
                />
                <span className="text-[12.5px] font-semibold text-[#111110]">
                  {AD_CHANNEL_LABEL[row.channel]}
                </span>
              </div>
              <Cell cell={row.spendData} label="집행 데이터" />
              <Cell cell={row.leadAttribution} label="리드 귀속" />
              <Cell cell={row.conversionTracking} label="전환 추적" />
            </div>
          ))}

          <p className="border-t border-[#e8e8e4] bg-[#f0f0ec] px-4 py-2.5 text-[11.5px] leading-relaxed text-[#615D59]">
            판정은 이 배포의 실제 설정값에서 나온다 — 환경변수를 채우면 이 표가 바로 바뀐다.
            {!GA4_MEASUREMENT_ID && " GA4 측정 ID 가 비어 있어 사이트 행동 지표는 수집되지 않는다."}
          </p>
        </div>
      )}
    </section>
  )
}
