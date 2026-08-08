"use client"

import { useState } from "react"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  AD_CHANNELS,
  type AdChannel,
} from "@/lib/types/event-metrics"
import { KRW, pct, won } from "@/components/admin/campaigns/event-format"

// Meta 라이브 집행은 계정 통화(대개 USD)라 KRW 포맷을 쓰지 않고 통화 코드 + 소수 2자리로 표기한다.
const NUM2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

export interface ChannelBudgetRow {
  channel: AdChannel
  label: string
  color: string
  spend: number
  leads: number
  cpl: number | null
}

// 상위(channelEfficiencyData)에서 channel이 string으로 넓게 타이핑되어 들어오므로,
// 구조적 상위 타입으로 받아 호출부 캐스팅 없이 그대로 넘길 수 있게 한다(값은 실제 AdChannel).
type ChannelBudgetInputRow = Omit<ChannelBudgetRow, "channel"> & { channel: string }

export interface ChannelBudgetTableProps {
  rows: readonly ChannelBudgetInputRow[]
  budgets: Record<AdChannel, number>
  onBudgetChange: (channel: AdChannel, amount: number) => void
  totalSpend: number
  totalRevenue: number
  overallRoi: number | null
  metaLiveSpend: number | null
  metaCurrency: string
}

const GRID = "grid grid-cols-[1.3fr_1.3fr_1fr_1fr_0.9fr_1fr] items-center gap-2"

// 배정(예산) 인라인 입력 — blur(또는 Enter)에서만 커밋한다. 표시는 원시 정수(콤마 없음)로 편집 마찰을 줄인다.
function BudgetInput({
  channel,
  value,
  onCommit,
}: {
  channel: AdChannel
  value: number
  onCommit: (channel: AdChannel, amount: number) => void
}) {
  const [draft, setDraft] = useState(value > 0 ? String(value) : "")
  // 커밋 후 상위가 새 예산을 되돌려주면(prop value 변경) 편집 초안을 canonical 값으로 재동기화한다.
  // useEffect 대신 "prop 변경 시 렌더 중 state 조정" 패턴(react.dev) — 캐스케이딩 렌더를 피한다.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value > 0 ? String(value) : "")
  }

  const commit = () => {
    const trimmed = draft.trim()
    const parsed = trimmed === "" ? 0 : Math.floor(Number(trimmed))
    const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    setDraft(safe > 0 ? String(safe) : "")
    if (safe !== value) onCommit(channel, safe)
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-[#e8e8e4] bg-[#fafaf8] px-2 py-1 focus-within:border-[#084734] focus-within:bg-white">
      <span aria-hidden className="text-[11px] text-[#1a1a1a]/35">
        ₩
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        placeholder="0"
        aria-label={`${AD_CHANNEL_LABEL[channel]} 배정 예산`}
        className="w-full min-w-0 bg-transparent text-right text-[12px] tabular-nums text-[#111110] outline-none placeholder:text-[#A39E98]"
      />
    </span>
  )
}

export function ChannelBudgetTable({
  rows,
  budgets,
  onBudgetChange,
  totalSpend,
  totalRevenue,
  overallRoi,
  metaLiveSpend,
  metaCurrency,
}: ChannelBudgetTableProps) {
  const rowByChannel = new Map<string, ChannelBudgetInputRow>()
  for (const r of rows) rowByChannel.set(r.channel, r)

  const merged = AD_CHANNELS.map((channel) => {
    const eff = rowByChannel.get(channel)
    const allocated = budgets[channel] ?? 0
    const spend = eff?.spend ?? 0
    const leads = eff?.leads ?? 0
    const cpl = eff?.cpl ?? null
    const remaining = allocated > 0 ? allocated - spend : null
    return { channel, allocated, spend, leads, cpl, remaining }
  })

  const sumAllocated = merged.reduce((s, r) => s + r.allocated, 0)
  const sumSpend = merged.reduce((s, r) => s + r.spend, 0)
  const sumLeads = merged.reduce((s, r) => s + r.leads, 0)
  // 총계 잔여 = 열에 보이는 per-row 잔여의 합. 미배정(allocated=0) 채널은 잔여 "—"로
  // 열에 기여하지 않으므로 총계에서도 그 집행을 빼지 않는다(0 기여). 열과 총계가 항상 일치.
  const sumRemaining = sumAllocated > 0 ? merged.reduce((s, r) => s + (r.remaining ?? 0), 0) : null

  const metaManualSpend = merged.find((r) => r.channel === "meta")?.spend ?? 0

  return (
    <div className="space-y-4">
      {/* 채널별 예산·집행 표 — 좁은 화면에서 열이 잘려 사라지지 않게 가로 스크롤 허용 */}
      <div className="overflow-x-auto rounded-2xl border border-[#e8e8e4] bg-white">
        <div className="min-w-[640px]">
          {/* header */}
          <div
            className={`${GRID} border-b border-[#f0f0ec] bg-[#fafaf8] px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] text-[#1a1a1a]/40`}
          >
            <span>채널</span>
            <span className="text-right">배정</span>
            <span className="text-right">집행</span>
            <span className="text-right">잔여</span>
            <span className="flex items-center justify-end gap-1">
              전환
              <span className="rounded-full bg-[#f0f0ec] px-1.5 py-0.5 text-[8px] font-semibold tracking-normal text-[#1a1a1a]/45">
                추정
              </span>
            </span>
            <span className="text-right">CPL</span>
          </div>

          {/* rows */}
          <div className="divide-y divide-[#f0f0ec]">
            {merged.map((row) => (
              <div key={row.channel} className={`${GRID} px-3 py-2.5`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: AD_CHANNEL_COLOR[row.channel] }}
                  />
                  <span className="truncate text-[12px] font-medium text-[#111110]">
                    {AD_CHANNEL_LABEL[row.channel]}
                  </span>
                </span>
                <span className="flex justify-end">
                  <BudgetInput channel={row.channel} value={row.allocated} onCommit={onBudgetChange} />
                </span>
                <span className="text-right text-[12px] tabular-nums text-[#1a1a1a]/60">
                  {won(row.spend)}
                </span>
                <span
                  className={`text-right text-[12px] font-semibold tabular-nums ${
                    row.remaining == null
                      ? "text-[#A39E98]"
                      : row.remaining < 0
                        ? "text-[#B85C33]"
                        : "text-[#084734]"
                  }`}
                >
                  {row.remaining == null ? "—" : won(row.remaining)}
                </span>
                <span className="text-right text-[12px] tabular-nums text-[#1a1a1a]/60">
                  {KRW.format(Math.round(row.leads))}
                </span>
                <span className="text-right text-[12px] tabular-nums text-[#111110]">
                  {won(row.cpl)}
                </span>
              </div>
            ))}
          </div>

          {/* totals */}
          <div className={`${GRID} border-t border-[#e8e8e4] bg-[#F6F5F4] px-3 py-2.5`}>
            <span className="text-[12px] font-semibold text-[#111110]">합계</span>
            <span className="text-right text-[12px] font-semibold tabular-nums text-[#111110]">
              {won(sumAllocated)}
            </span>
            <span className="text-right text-[12px] font-semibold tabular-nums text-[#111110]">
              {won(sumSpend)}
            </span>
            <span
              className={`text-right text-[12px] font-semibold tabular-nums ${
                sumRemaining == null
                  ? "text-[#A39E98]"
                  : sumRemaining < 0
                    ? "text-[#B85C33]"
                    : "text-[#084734]"
              }`}
            >
              {sumRemaining == null ? "—" : won(sumRemaining)}
            </span>
            <span className="text-right text-[12px] font-semibold tabular-nums text-[#111110]">
              {KRW.format(Math.round(sumLeads))}
            </span>
            <span className="text-right text-[12px] text-[#A39E98]">—</span>
          </div>
        </div>
      </div>

      {/* 표 하단 정직성 주석 */}
      <p className="px-1 text-[11px] leading-relaxed text-[#1a1a1a]/45">
        전환은 광고비 비중으로 안분한 추정치이며 채널별 ROI는 매출의 채널 귀속이 불가해 표기하지 않습니다.
      </p>

      {/* 종합 스트립 — 채널별 표와 분리 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#1a1a1a]/45">종합 집행</span>
          <span className="text-[13px] font-semibold tabular-nums text-[#111110]">{won(totalSpend)}</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#1a1a1a]/45">종합 매출</span>
          <span className="text-[13px] font-semibold tabular-nums text-[#111110]">{won(totalRevenue)}</span>
          <span className="text-[10px] text-[#1a1a1a]/35">(입력 기준 · 장부 확정매출 아님)</span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] text-[#1a1a1a]/45">종합 ROI</span>
          <span
            className={`text-[13px] font-semibold tabular-nums ${
              overallRoi != null && overallRoi >= 0 ? "text-[#084734]" : "text-[#111110]"
            }`}
          >
            {overallRoi == null ? "—" : pct(overallRoi)}
          </span>
        </span>
      </div>

      {/* Meta 대조 콜아웃 — 라이브 집행(계정 통화) vs 수기 입력(KRW). 통화가 달라 드리프트 %는 계산하지 않는다. */}
      {metaLiveSpend != null && (
        <div className="rounded-xl border border-[#e8e8e4] bg-white px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: AD_CHANNEL_COLOR.meta }}
            />
            <span className="text-[12px] font-semibold text-[#111110]">Meta 집행 대조</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/40">Meta 라이브 집행</p>
              <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110]">
                {metaCurrency} {NUM2.format(metaLiveSpend)}
              </p>
            </div>
            <div className="rounded-lg bg-[#fafaf8] px-3 py-2">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[#1a1a1a]/40">수기 입력 (광고 채널)</p>
              <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-[#111110]">{won(metaManualSpend)}</p>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-[#1a1a1a]/45">통화 상이 · 수기 입력 대조용</p>
        </div>
      )}
    </div>
  )
}
