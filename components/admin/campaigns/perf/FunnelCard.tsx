"use client"

import { ArrowDown } from "lucide-react"
import { COUNT } from "@/components/admin/campaigns/event-format"
import type { MarketingPerfResponse } from "@/lib/marketing/perf"

// 광고 퍼널 카드 — 콕핏 우측 레일(384px) 전용 컴팩트 버전. 기존 FunnelMixSection의 퍼널 절반만
// 이식했다(5단). 채널 예산·집행 절반은 요약 탭에서 제거됐다 — 정본은 광고 탭
// ChannelBudgetTable 하나(채널 믹스를 요약 탭에서 다시 그리지 않는다).
//
// 왜 viz/MiniFunnel variant="waterfall" 을 쓰지 않고 여기서 직접 그리는가:
//   1) 공용 FunnelStage 계약에는 "단계 사이"를 강조할 축이 없다. color/tone 은 막대 색이지
//      구간(gap) 속성이 아니라, 컨택 0 구간만 danger 로 세우는 표현이 불가능하다.
//   2) waterfall 은 라벨·수치를 각각 w-16(64px) 고정 컬럼에 가두는 3열 가로 배치다.
//      384px 레일에서 막대가 ~190px 로 눌리고, 8자리 노출 수는 수치 컬럼을 넘친다.
//      여기서는 라벨·수치를 한 줄로 올리고 막대에 폭을 전부 준다.
//   3) 이탈 문구를 "−N 이탈"로 명시하고 컨택 0 사실을 그 자리에 접어 넣어야 한다.
// 공용 컴포넌트를 우리 쪽 사정으로 넓히는 대신 소비처에서 그리는 선택이다.

// 퍼널 단계 색 — 구 요약 탭 집계 퍼널과 같은 시각 언어(뉴트럴→잉크→앰버→그린→테라코타).
const FUNNEL_COLORS = ["#A39E98", "#111110", "#A8741A", "#084734", "#B85C33"] as const

interface FunnelStep {
  key: string
  label: string
  value: number
  color: string
}

/** 이전 단계 대비 전환율 문자열. 분모가 0이면 "0%"가 아니라 "—" — 없는 걸 0으로 읽히게 두지 않는다. */
function formatStepRate(current: number, previous: number): string {
  if (previous <= 0) return "—"
  const pct = (current / previous) * 100
  // 0.1% 미만은 반올림하면 "0.0%"가 되어 실제 0과 구분이 사라진다.
  if (pct > 0 && pct < 0.1) return "<0.1%"
  // 소수 자리는 정보가 있을 때만 — 40%를 "40.0%"로 쓰면 없는 정밀도를 흉내내는 셈이다.
  const rounded = Math.round(pct * 10) / 10
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`
}

export function FunnelCard({
  funnel,
  metaMeasured,
}: {
  funnel: MarketingPerfResponse["funnel"]
  /** Meta 스냅샷 축 실측 여부 — false 면 노출·클릭이 0 으로 강등된 값일 수 있음을 밝힌다. */
  metaMeasured: boolean
}) {
  const steps: FunnelStep[] = [
    { key: "impressions", label: "노출", value: funnel.impressions, color: FUNNEL_COLORS[0] },
    { key: "clicks", label: "클릭", value: funnel.clicks, color: FUNNEL_COLORS[1] },
    { key: "adLeads", label: "리드", value: funnel.adLeads, color: FUNNEL_COLORS[2] },
    { key: "contacted", label: "컨택", value: funnel.contacted, color: FUNNEL_COLORS[3] },
    { key: "converted", label: "전환", value: funnel.convertedLeads, color: FUNNEL_COLORS[4] },
  ]

  // 막대 기준선 — 최댓값. Meta 미실측이면 노출·클릭이 0이라 리드가 기준선이 되는데,
  // 그게 맞다(있는 값 중 가장 큰 것을 100%로 놓는다).
  const baseline = Math.max(1, ...steps.map((step) => step.value))
  // 전 단계가 0이면 0 다섯 줄에 "—" 네 개만 남는다 — 구 waterfall 과 같이 한 줄로 접는다.
  const hasAnyValue = steps.some((step) => step.value > 0)

  // 컨택 0인데 광고 리드는 있으면 후속 손길이 전혀 없다는 뜻 — 실측(둘 다 0이 아닌 실제 값)일 때만
  // 표시한다(날조 금지). adLeads도 0이면 애초에 컨택할 대상이 없으므로 이 경고 대상이 아니다.
  // 예전에는 이 사실을 퍼널 아래 별도 캡션으로 한 번 더 적었는데, 같은 말이 두 곳에서 나면
  // 노이즈다 — 리드→컨택 구간 안으로 접어 넣고 캡션은 없앴다.
  const noContactYet = funnel.contacted === 0 && funnel.adLeads > 0

  return (
    // 참조용 카드라 배경을 판단 카드(브리핑·스코어보드)보다 한 단 물린다.
    <section className="rounded-2xl border border-[#f0f0ec] bg-[#fdfdfc] p-4 sm:p-5" aria-label="광고 퍼널">
      <div className="mb-4">
        <h2 className="text-[14px] font-semibold text-[#111110]">광고 퍼널</h2>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/40">
          노출·클릭은 Meta 스냅샷, 리드 이후는 리드 테이블(광고 리드) 기준
        </p>
      </div>

      {!hasAnyValue ? (
        <p className="rounded-xl bg-[#fafaf8] py-8 text-center text-[12px] text-[#A39E98]">
          표시할 데이터가 없습니다.
        </p>
      ) : (
        <div>
          {steps.map((step, index) => {
            const previous = index > 0 ? steps[index - 1] : null
            // 이탈 수 — 분모가 없으면 이탈도 셀 수 없다. 역증가(비단조) 데이터면 0이라 표기를 생략한다.
            const drop = previous && previous.value > 0 ? Math.max(0, previous.value - step.value) : 0
            // 리드→컨택 구간만 danger — 이 대시보드가 처음 잡아낸 신호라 가장 세게 말한다.
            const danger = noContactYet && previous?.key === "adLeads" && step.key === "contacted"
            const width = step.value > 0 ? Math.max(2, (step.value / baseline) * 100) : 0

            return (
              <div key={step.key}>
                {previous && (
                  <div
                    className={
                      danger
                        ? "my-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-[#F6D5C5] bg-[#FEF3EE] px-2 py-1"
                        : "flex flex-wrap items-center gap-x-1.5 gap-y-0.5 py-1.5 pl-0.5"
                    }
                  >
                    <ArrowDown
                      aria-hidden="true"
                      className={`h-3 w-3 shrink-0 ${danger ? "text-[#B85C33]" : "text-[#A39E98]"}`}
                    />
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        danger ? "text-[#B85C33]" : "text-[#615D59]"
                      }`}
                    >
                      <span className="sr-only">이전 단계 대비 전환 </span>
                      {formatStepRate(step.value, previous.value)}
                    </span>
                    {drop > 0 && (
                      <span className={`text-[11px] tabular-nums ${danger ? "text-[#B85C33]" : "text-[#A39E98]"}`}>
                        −{COUNT.format(drop)} 이탈
                      </span>
                    )}
                    {danger && (
                      <span className="text-[11px] font-semibold text-[#B85C33]">· 전원 미컨택</span>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12px] font-medium text-[#615D59]">{step.label}</span>
                    <span
                      className={`text-[13px] font-semibold tabular-nums tracking-[-0.01em] ${
                        step.value > 0 ? "text-[#111110]" : "text-[#A39E98]"
                      }`}
                    >
                      {COUNT.format(step.value)}
                    </span>
                  </div>
                  {/* 0인 단계는 트랙만 남긴다 — 최소폭 막대를 그리면 "조금은 있다"로 읽힌다. */}
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#f0f0ec]">
                    {step.value > 0 && (
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${width}%`, backgroundColor: step.color }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!metaMeasured && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#A8741A]">
          Meta 스냅샷 미수집 — 노출·클릭은 0으로 강등된 값일 수 있습니다.
        </p>
      )}
    </section>
  )
}
