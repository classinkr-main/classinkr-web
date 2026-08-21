"use client"

import { MiniFunnel, type FunnelStage } from "@/components/admin/viz"
import { money, won } from "@/components/admin/campaigns/event-format"
import { AD_CHANNEL_COLOR, AD_CHANNEL_LABEL, type AdChannel } from "@/lib/types/event-metrics"
import type { MarketingPerfResponse } from "@/lib/marketing/perf"

// 퍼널 + 채널 믹스 2단 그리드.
//  좌: 광고 퍼널 5단(노출→클릭→리드→컨택→전환) — MiniFunnel waterfall(순수 CSS).
//  우: 채널별 KRW 배정 대비 수기 집행 가로바. meta 행의 라이브 USD 집행은 "$" 별도 라인 —
//     통화가 달라 한 바에 절대 합산하지 않는다. 채널 식별색은 점(dot)에만 쓴다(DESIGN.md §2).

// 퍼널 단계 색 — 구 요약 탭 집계 퍼널과 같은 시각 언어(뉴트럴→잉크→앰버→그린→테라코타).
const FUNNEL_COLORS = ["#A39E98", "#111110", "#A8741A", "#084734", "#B85C33"] as const

export function FunnelMixSection({
  funnel,
  channelMix,
  metaMeasured,
}: {
  funnel: MarketingPerfResponse["funnel"]
  channelMix: MarketingPerfResponse["channelMix"]
  /** Meta 스냅샷 축 실측 여부 — false 면 노출·클릭이 0 으로 강등된 값일 수 있음을 밝힌다. */
  metaMeasured: boolean
}) {
  const stages: FunnelStage[] = [
    { key: "impressions", label: "노출", value: funnel.impressions, color: FUNNEL_COLORS[0] },
    { key: "clicks", label: "클릭", value: funnel.clicks, color: FUNNEL_COLORS[1] },
    { key: "adLeads", label: "리드", value: funnel.adLeads, color: FUNNEL_COLORS[2] },
    { key: "contacted", label: "컨택", value: funnel.contacted, color: FUNNEL_COLORS[3] },
    { key: "converted", label: "전환", value: funnel.convertedLeads, color: FUNNEL_COLORS[4] },
  ]

  // 배정도 집행 기록도 전혀 없는 채널 행은 숨긴다 — 7행 전부 빈 트랙이면 신호가 없다.
  const mixRows = channelMix.filter(
    (row) =>
      row.budget > 0 || row.spendKrw != null || (row.channel === "meta" && row.metaSpendUsd != null)
  )

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="광고 퍼널">
        <div className="mb-4">
          <h2 className="text-[14px] font-semibold text-[#111110]">광고 퍼널</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            노출·클릭은 Meta 스냅샷, 리드 이후는 리드 테이블(광고 리드) 기준
          </p>
        </div>
        <MiniFunnel stages={stages} variant="waterfall" />
        {!metaMeasured && (
          <p className="mt-3 text-[11px] leading-relaxed text-[#A8741A]">
            Meta 스냅샷 미수집 — 노출·클릭은 0으로 강등된 값일 수 있습니다.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5" aria-label="채널 예산·집행">
        <div className="mb-4">
          <h2 className="text-[14px] font-semibold text-[#111110]">채널 예산·집행</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
            KRW 배정 대비 행사 수기 집행 — Meta 라이브(USD)는 별도 표기
          </p>
        </div>

        {channelMix.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] py-8 text-center text-[12px] text-[#A39E98]">
            채널 예산 소스 조회에 실패해 배정·집행을 표시할 수 없습니다.
          </p>
        ) : mixRows.length === 0 ? (
          <p className="rounded-xl bg-[#fafaf8] py-8 text-center text-[12px] text-[#A39E98]">
            배정·집행 기록이 아직 없습니다.
          </p>
        ) : (
          <div className="space-y-3">
            {mixRows.map((row) => {
              const label = AD_CHANNEL_LABEL[row.channel as AdChannel] ?? row.channel
              const dot = AD_CHANNEL_COLOR[row.channel as AdChannel] ?? "#84827a"
              const ratio =
                row.budget > 0 && row.spendKrw != null
                  ? Math.min(100, Math.round((row.spendKrw / row.budget) * 100))
                  : null
              return (
                <div key={row.channel}>
                  <div className="flex items-baseline justify-between gap-3 text-[12px]">
                    <span className="flex items-center gap-1.5 font-medium text-[#111110]">
                      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />
                      {label}
                    </span>
                    <span className="tabular-nums text-[#1a1a1a]/55">
                      {row.spendKrw != null ? `집행 ${won(row.spendKrw)}` : "집행 미측정"}
                      {" / "}
                      {row.budget > 0 ? `배정 ${won(row.budget)}` : "배정 없음"}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f0f0ec]">
                    {ratio != null && ratio > 0 && (
                      <div
                        className="h-full rounded-full bg-[#084734]"
                        style={{ width: `${Math.max(2, ratio)}%` }}
                      />
                    )}
                  </div>
                  {row.channel === "meta" && row.metaSpendUsd != null && (
                    <p className="mt-1 text-[11px] tabular-nums text-[#1a1a1a]/45">
                      Meta 라이브 집행 {money(row.metaSpendUsd, "USD")} — USD 별도 표기(위 KRW 바에 합산 안 함)
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className="mt-4 text-[10.5px] leading-relaxed text-[#1a1a1a]/35">
          * 채널별 ROAS 미표기(귀속 불가)
        </p>
      </section>
    </div>
  )
}
