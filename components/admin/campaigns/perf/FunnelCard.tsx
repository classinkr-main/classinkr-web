"use client"

import { MiniFunnel, type FunnelStage } from "@/components/admin/viz"
import type { MarketingPerfResponse } from "@/lib/marketing/perf"

// 광고 퍼널 카드 — 콕핏 우측 레일(384px) 전용 컴팩트 버전. 기존 FunnelMixSection의 퍼널 절반만
// 이식했다(5단 waterfall). 채널 예산·집행 절반은 요약 탭에서 제거됐다 — 정본은 광고 탭
// ChannelBudgetTable 하나(채널 믹스를 요약 탭에서 다시 그리지 않는다).

// 퍼널 단계 색 — 구 요약 탭 집계 퍼널과 같은 시각 언어(뉴트럴→잉크→앰버→그린→테라코타).
const FUNNEL_COLORS = ["#A39E98", "#111110", "#A8741A", "#084734", "#B85C33"] as const

export function FunnelCard({
  funnel,
  metaMeasured,
}: {
  funnel: MarketingPerfResponse["funnel"]
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

  // 컨택 0인데 광고 리드는 있으면 후속 손길이 전혀 없다는 뜻 — 실측(둘 다 0이 아닌 실제 값)일 때만
  // 표시한다(날조 금지). adLeads도 0이면 애초에 컨택할 대상이 없으므로 이 경고 대상이 아니다.
  const noContactYet = funnel.contacted === 0 && funnel.adLeads > 0

  return (
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
      {noContactYet && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#D97706]">
          컨택 0 — 광고 리드 {funnel.adLeads}건에 아직 후속 손길이 없습니다
        </p>
      )}
    </section>
  )
}
