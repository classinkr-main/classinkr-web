"use client"

import { ArrowDown } from "lucide-react"

const KRW = new Intl.NumberFormat("ko-KR")

const count = (n: number | null | undefined) => (n == null ? "—" : KRW.format(Math.round(n)))

function conversionPct(current: number, previous: number) {
  if (previous <= 0) return null
  return (current / previous) * 100
}

function formatPct(value: number | null) {
  if (value == null) return "—"
  return `${value.toFixed(value >= 100 || value === 0 ? 0 : 1)}%`
}

export interface FunnelStage {
  key: string
  label: string
  value: number
  color: string
}

export interface FunnelWaterfallProps {
  stages: FunnelStage[]
}

export function FunnelWaterfall({ stages }: FunnelWaterfallProps) {
  const baseline = stages.find((stage) => stage.value > 0)?.value ?? 0
  const hasData = baseline > 0

  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[#111110]">전환 퍼널</h2>
          <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
            단계별 전환율과 이탈을 추적합니다
          </p>
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-xl bg-[#fafaf8] py-10 text-center">
          <p className="text-[12px] text-[#1a1a1a]/40">표시할 데이터가 없습니다.</p>
        </div>
      ) : (
        <div>
          {stages.map((stage, index) => {
            const isEmpty = stage.value <= 0
            const widthPct = isEmpty ? 0 : Math.max(2, (stage.value / baseline) * 100)

            const previous = index > 0 ? stages[index - 1] : null
            const stepPct = previous ? conversionPct(stage.value, previous.value) : null
            const drop =
              previous && previous.value > 0 ? Math.max(0, previous.value - stage.value) : null
            const healthy = stepPct != null && stepPct >= 50

            return (
              <div key={stage.key}>
                {previous && (
                  <div className="flex items-center gap-2 py-1.5 pl-1">
                    <span className="flex h-4 w-4 items-center justify-center">
                      <ArrowDown className="h-3 w-3 text-[#1a1a1a]/25" />
                    </span>
                    <span
                      className={`text-[11px] font-semibold tabular-nums ${
                        healthy ? "text-[#084734]" : "text-[#1a1a1a]/45"
                      }`}
                    >
                      전환 {formatPct(stepPct)}
                    </span>
                    <span className="text-[11px] tabular-nums text-[#1a1a1a]/35">
                      {drop == null ? "—" : `−${count(drop)}`}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-16 shrink-0 text-[12px] font-medium text-[#1a1a1a]/55">
                    {stage.label}
                  </div>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-[#f0f0ec]">
                    <div
                      className="h-full rounded-lg transition-[width]"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: isEmpty ? "#84827a" : stage.color,
                        opacity: isEmpty ? 0.25 : 1,
                      }}
                    />
                  </div>
                  <div
                    className={`w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums ${
                      isEmpty ? "text-[#1a1a1a]/30" : "text-[#111110]"
                    }`}
                  >
                    {count(stage.value)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
