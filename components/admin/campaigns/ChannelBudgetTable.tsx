"use client"

import { useEffect, useRef, useState } from "react"
import { AlertCircle } from "lucide-react"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  AD_CHANNELS,
  type AdChannel,
} from "@/lib/types/event-metrics"
import { AdminMoneyInput } from "@/components/admin/AdminMoneyInput"
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
  /**
   * 저장 위임. Promise 를 돌려주면 그 이행/거절로 행 단위 진행·성공·실패 표시를 만든다
   * (void 를 돌려주는 호출부와도 호환 — 그 경우 표시는 즉시 "성공"으로 접힌다).
   */
  onBudgetChange: (channel: AdChannel, amount: number) => void | Promise<void>
  totalSpend: number
  totalRevenue: number
  overallRoi: number | null
  metaLiveSpend: number | null
  metaCurrency: string
}

const GRID = "grid grid-cols-[1.3fr_1.3fr_1fr_1fr_0.9fr_1fr] items-center gap-2"

// 배정 저장의 행 단위 상태. 단일 슬롯이면 두 채널을 연속 저장할 때 먼저 끝난 응답이
// 다른 행의 스피너를 풀고, 실패도 마지막 하나만 남아 "어느 채널이 실패했나"가 사라진다.
type CommitPhase =
  | { phase: "pending" }
  | { phase: "saved" }
  | { phase: "error"; message: string }

const SAVED_MS = 1500

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
  const [commitPhase, setCommitPhase] = useState<Partial<Record<AdChannel, CommitPhase>>>({})
  // 채널별 순번 — 같은 채널을 빠르게 두 번 고치면 늦게 온 앞선 응답이 뒤늦게 스피너를 풀거나
  // 이미 지난 실패를 다시 띄운다. usePerf(SummaryTab)의 seqRef 와 같은 규약.
  const seqRef = useRef<Partial<Record<AdChannel, number>>>({})
  const savedTimersRef = useRef<Partial<Record<AdChannel, ReturnType<typeof setTimeout>>>>({})

  useEffect(() => {
    const timers = savedTimersRef.current
    return () => {
      for (const timer of Object.values(timers)) if (timer) clearTimeout(timer)
    }
  }, [])

  async function handleCommit(channel: AdChannel, amount: number | null) {
    // allowNull={false} 라 null 은 오지 않지만, 계약상 "빈 값 = 미배정 = 0" 을 여기서도 못 박는다.
    const next = amount ?? 0
    const seq = (seqRef.current[channel] ?? 0) + 1
    seqRef.current[channel] = seq
    const savedTimer = savedTimersRef.current[channel]
    if (savedTimer) clearTimeout(savedTimer)
    setCommitPhase((prev) => ({ ...prev, [channel]: { phase: "pending" } }))
    try {
      // void 를 돌려주는 호출부도 그대로 받는다(그 경우 즉시 이행 → "저장됨" 표시).
      await Promise.resolve(onBudgetChange(channel, next))
      if (seqRef.current[channel] !== seq) return
      setCommitPhase((prev) => ({ ...prev, [channel]: { phase: "saved" } }))
      savedTimersRef.current[channel] = setTimeout(() => {
        if (seqRef.current[channel] !== seq) return
        setCommitPhase((prev) => {
          const rest = { ...prev }
          delete rest[channel]
          return rest
        })
      }, SAVED_MS)
    } catch (e) {
      if (seqRef.current[channel] !== seq) return
      // 실패는 상단 배너만으로는 "어느 채널인지"가 사라진다 — 만진 행에 그대로 붙인다.
      // 호출부가 서버 정본을 다시 받아 입력칸을 되돌리므로, 되돌렸다는 사실도 함께 밝힌다.
      const message = e instanceof Error ? e.message : "채널 예산 저장 실패"
      setCommitPhase((prev) => ({
        ...prev,
        [channel]: { phase: "error", message: `${message} — 입력값은 저장 전 상태로 되돌렸습니다.` },
      }))
    }
  }

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
            {merged.map((row) => {
              const phase = commitPhase[row.channel]
              const errorId = `channel-budget-error-${row.channel}`
              return (
                <div key={row.channel}>
                  <div className={`${GRID} px-3 py-2.5`}>
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
                      <AdminMoneyInput
                        value={row.allocated}
                        onCommit={(next) => void handleCommit(row.channel, next)}
                        // 이 필드는 "미배정 = 0" 이 도메인 정의다(총계 잔여 계산이 그 전제 위에 있다).
                        allowNull={false}
                        prefix="₩"
                        placeholder="0"
                        ariaLabel={`${AD_CHANNEL_LABEL[row.channel]} 배정 예산`}
                        ariaDescribedBy={phase?.phase === "error" ? errorId : undefined}
                        pending={phase?.phase === "pending"}
                        saved={phase?.phase === "saved"}
                        invalid={phase?.phase === "error"}
                      />
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
                  {phase?.phase === "error" && (
                    <p
                      id={errorId}
                      role="alert"
                      className="flex items-center justify-end gap-1.5 px-3 pb-2 text-[11.5px] text-[#B43E3E]"
                    >
                      <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      {phase.message}
                    </p>
                  )}
                </div>
              )
            })}
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
