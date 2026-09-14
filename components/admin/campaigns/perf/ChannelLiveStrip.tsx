"use client"

import { money, COUNT } from "@/components/admin/campaigns/event-format"
import { mergeSameCurrency } from "@/lib/marketing/ad-insights"
import type { PerfChannelLive } from "@/lib/marketing/perf"
import { AD_CHANNEL_COLOR, AD_CHANNEL_LABEL, type AdChannel } from "@/lib/types/event-metrics"

/**
 * 채널 스트립 — 라이브 연동 채널(Meta·Google·네이버)의 기간 집행을 나란히 놓는다.
 *
 * ── 이 컴포넌트가 지키는 세 가지 ──────────────────────────────
 *  1) **합계를 함부로 내지 않는다.** 통화가 섞이면(USD Meta + KRW 네이버) 합계 칸을 비운다.
 *     전 채널이 같은 통화일 때만 mergeSameCurrency 가 합을 돌려주고, 그때만 표기한다.
 *  2) **0 과 미측정을 구분한다.** spend=0 은 "집행 안 함", spend=null 은 "못 쟀다".
 *     미연동(configured=false)은 또 다른 상태라 문구를 따로 둔다.
 *  3) **채널 브랜드색은 점에만.** DESIGN.md §2 — 차트·범례·채널 점 표시 전용이고
 *     숫자·배경·테두리에 쓰면 팔레트 위반이다.
 */
export interface ChannelLiveStripProps {
  channels: readonly PerfChannelLive[]
  /** 수기 입력만 있는 채널 수 — 스트립 끝의 회색 칸에 쓴다. */
  manualChannelCount: number
}

/** 연동 채널은 채워진 점, 수기 채널은 빈 점 — 숫자의 출처가 형태로 읽혀야 한다. */
function ChannelDot({ channel, hollow = false }: { channel: AdChannel; hollow?: boolean }) {
  const color = AD_CHANNEL_COLOR[channel]
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={hollow ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { backgroundColor: color }}
    />
  )
}

function DeltaLine({ entry }: { entry: PerfChannelLive }) {
  if (!entry.configured) {
    return <p className="text-[11px] text-[#A39E98]">미연동</p>
  }
  if (entry.spend == null) {
    return <p className="text-[11px] text-[#A8741A]">수집 대기</p>
  }
  if (entry.deltaPct == null) {
    // 직전 기간이 0이거나 통화가 바뀌어 비교가 성립하지 않는다. 0% 로 지어내지 않는다.
    return <p className="text-[11px] text-[#A39E98]">전기 비교 없음</p>
  }
  const up = entry.deltaPct > 0
  const flat = entry.deltaPct === 0
  return (
    <p className={`text-[11px] tabular-nums ${flat ? "text-[#A39E98]" : up ? "text-[#084734]" : "text-[#B43E3E]"}`}>
      {flat ? "±" : up ? "↑" : "↓"} {Math.abs(entry.deltaPct)}% 전기 대비
    </p>
  )
}

export function ChannelLiveStrip({ channels, manualChannelCount }: ChannelLiveStripProps) {
  const merged = mergeSameCurrency(channels)
  const liveCount = channels.filter((entry) => entry.configured).length

  return (
    <section className="rounded-2xl border border-[#e8e8e4] bg-white">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e8e8e4] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold text-[#111110]">채널별 집행</h3>
        <p className="text-[11.5px] tabular-nums text-[#A39E98]">
          연동 {COUNT.format(liveCount)} · 수기 {COUNT.format(manualChannelCount)}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4">
        {channels.map((entry) => (
          <div
            key={entry.channel}
            className="flex flex-col gap-1 border-b border-r border-[#f0f0ec] p-4 last:border-r-0 lg:border-b-0"
          >
            <div className="mb-1 flex items-center gap-2">
              <ChannelDot channel={entry.channel} />
              <span className="text-[12.5px] font-semibold text-[#111110]">
                {AD_CHANNEL_LABEL[entry.channel]}
              </span>
            </div>
            <p
              className={`text-[19px] font-semibold tabular-nums ${
                entry.spend == null ? "font-normal text-[#A39E98]" : "text-[#111110]"
              }`}
            >
              {/* 통화를 모르면 금액을 표기하지 않는다 — 어느 통화인지 못 말하는 숫자는 안 낸다. */}
              {entry.spend != null && entry.currency ? money(entry.spend, entry.currency) : "—"}
            </p>
            <p className="text-[11.5px] tabular-nums text-[#615D59]">
              {entry.conversions != null
                ? `전환 ${COUNT.format(entry.conversions)}`
                : "전환 —"}
              {" · "}
              {entry.costPerConversion != null && entry.currency
                ? money(entry.costPerConversion, entry.currency)
                : "—"}
            </p>
            <DeltaLine entry={entry} />
          </div>
        ))}

        {/* 수기 채널 묶음 — 같은 줄에 두되 빈 점으로 출처를 가른다. */}
        <div className="flex flex-col gap-1 border-b border-[#f0f0ec] p-4 lg:border-b-0">
          <div className="mb-1 flex items-center gap-2">
            <ChannelDot channel="other" hollow />
            <span className="text-[12.5px] font-semibold text-[#111110]">그 외 채널</span>
          </div>
          <p className="text-[19px] tabular-nums text-[#A39E98]">—</p>
          <p className="text-[11.5px] text-[#615D59]">수기 입력 {manualChannelCount}종</p>
          <p className="text-[11px] text-[#A39E98]">배정·행사 광고비만</p>
        </div>
      </div>

      <footer className="border-t border-[#e8e8e4] bg-[#f0f0ec] px-4 py-2.5 text-[11.5px] text-[#615D59]">
        {merged ? (
          <span className="tabular-nums">
            합계 {money(merged.spend, merged.currency)} · 전 채널 {merged.currency} 기준
          </span>
        ) : (
          // 통화가 섞였거나 아직 잰 채널이 없다 — 합계를 만들지 않는 이유를 말한다.
          <span>통화가 달라 합계를 내지 않는다. &lsquo;—&rsquo;는 0이 아니라 미측정이다.</span>
        )}
      </footer>
    </section>
  )
}
