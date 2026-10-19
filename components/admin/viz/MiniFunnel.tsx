"use client"

import Link from "next/link"
import { ArrowDown } from "lucide-react"
import { CHART, TONE, type Tone } from "./theme"

// 세일즈 퍼널 시각화. 순수 CSS(Recharts 미사용).
// variant "bar"(기본) = 비례 막대 + 이전 단계 대비 전환율 한 줄.
// variant "waterfall" = 단계 사이 화살표에 전환율·이탈 수치를 명시적으로 표기(구 campaigns/FunnelWaterfall).

export interface FunnelStage {
  label: string
  value: number
  tone?: Tone
  href?: string
  /** waterfall 전용 — 지정 시 tone 대신 이 raw hex를 막대 색으로 사용(단계별 세분화 팔레트). */
  color?: string
  /** waterfall 전용 리스트 렌더링 key. 미지정 시 label로 대체. */
  key?: string
}

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

/** bar 변형의 단계별 불투명도 하한 — 이보다 옅으면 막대가 배경(#f0f0ec)에 묻혀 값이 안 읽힌다. */
export const MINI_FUNNEL_MIN_OPACITY = 0.35
const MINI_FUNNEL_OPACITY_STEP = 0.14

/**
 * bar 변형 i번째 단계의 막대 불투명도. 단계가 깊을수록 옅어지되 하한에서 멈춘다(F9).
 * 예전 `1 - i * 0.14`는 8단계째(i=7)에 0.02, 9단계째(i=8)에 음수가 돼 막대가 사라졌다.
 */
export function miniFunnelBarOpacity(index: number): number {
  const raw = 1 - Math.max(0, index) * MINI_FUNNEL_OPACITY_STEP
  return Math.max(MINI_FUNNEL_MIN_OPACITY, Math.round(raw * 100) / 100)
}

export function MiniFunnel({
  stages,
  variant = "bar",
}: {
  stages: FunnelStage[]
  variant?: "bar" | "waterfall"
}) {
  if (variant === "waterfall") {
    return <FunnelWaterfallBody stages={stages} />
  }
  return <FunnelBarsBody stages={stages} />
}

// ── bar variant (기존 MiniFunnel 그대로) ────────────────────────────────
function FunnelBarsBody({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value))
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const width = Math.max(6, Math.round((stage.value / max) * 100))
        const prev = i > 0 ? stages[i - 1].value : null
        const conv = prev && prev > 0 ? Math.round((stage.value / prev) * 100) : null
        const tone: Tone = stage.tone ?? "brand"
        const inner = (
          <>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#111110]">{stage.label}</span>
              <span className="text-[14px] font-bold tabular-nums tracking-[-0.02em] text-[#111110]">
                {stage.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#f0f0ec]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${width}%`, background: TONE[tone].fg, opacity: miniFunnelBarOpacity(i) }}
              />
            </div>
            {conv != null && <p className="mt-1 text-[10px] text-[#1a1a1a]/40">이전 단계 대비 {conv}% 전환</p>}
          </>
        )
        return stage.href ? (
          <Link
            key={stage.label}
            href={stage.href}
            className="block rounded-lg transition-opacity hover:opacity-90"
          >
            {inner}
          </Link>
        ) : (
          <div key={stage.label}>{inner}</div>
        )
      })}
    </div>
  )
}

// ── waterfall variant (구 campaigns/FunnelWaterfall 흡수) ──────────────
function FunnelWaterfallBody({ stages }: { stages: FunnelStage[] }) {
  const baseline = stages.find((stage) => stage.value > 0)?.value ?? 0
  const hasData = baseline > 0

  if (!hasData) {
    return (
      <div className="rounded-xl bg-[#fafaf8] py-10 text-center">
        <p className="text-[12px] text-[#1a1a1a]/40">표시할 데이터가 없습니다.</p>
      </div>
    )
  }

  return (
    <div>
      {stages.map((stage, index) => {
        const isEmpty = stage.value <= 0
        const widthPct = isEmpty ? 0 : Math.max(2, (stage.value / baseline) * 100)
        const barColor = stage.color ?? TONE[stage.tone ?? "neutral"].fg

        const previous = index > 0 ? stages[index - 1] : null
        const stepPct = previous ? conversionPct(stage.value, previous.value) : null
        const drop = previous && previous.value > 0 ? Math.max(0, previous.value - stage.value) : null
        const healthy = stepPct != null && stepPct >= 50

        return (
          <div key={stage.key ?? stage.label}>
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
              <div className="w-16 shrink-0 text-[12px] font-medium text-[#1a1a1a]/55">{stage.label}</div>
              <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-[#f0f0ec]">
                <div
                  className="h-full rounded-lg transition-[width]"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: isEmpty ? CHART.warmGray : barColor,
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
  )
}
