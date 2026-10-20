"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { Check } from "lucide-react"
import { CONFIDENCE_TOKENS } from "@/lib/branch/confidence-tokens"
import { formatMoney } from "@/lib/branch/ledger-format"
import {
  buildMonthlyGoalChart, type MonthlyGoalChartSource, type MonthlyGoalPlan,
} from "@/lib/branch/monthly-goal-chart"

const SERIES = [
  { key: "confirmed" as const, token: CONFIDENCE_TOKENS.confirmed },
  { key: "highConfidence" as const, token: CONFIDENCE_TOKENS["high-confidence"] },
  { key: "expected" as const, token: CONFIDENCE_TOKENS.expected },
]
const WIDTH = 960
const HEIGHT = 300
const LEFT = 58
const TOP = 36
const BOTTOM = 264

interface Props {
  rows: MonthlyGoalChartSource[]
  plans: MonthlyGoalPlan[]
  selectedMonth: string
  todayMonth: string
  onSelectMonth?: (month: string) => void
  goalNote?: string
}

/** 3b: 공통 금액 축의 넓은 목표 그릇 + 좁은 확도 스택. 수치는 캐논에서, 좌표만 SVG에서 계산한다. */
export function MonthlyGoalBowlChart({ rows, plans, selectedMonth, todayMonth, onSelectMonth, goalNote }: Props) {
  const points = useMemo(() => buildMonthlyGoalChart(rows, plans, todayMonth), [rows, plans, todayMonth])
  const [inspectedMonth, setInspectedMonth] = useState<string | null>(null)
  const [detailMonth, setDetailMonth] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hatchId = `monthly-goal-hatch-${useId().replace(/:/g, "")}`
  const monthsKey = plans.map((plan) => plan.month).join(",")
  useEffect(() => {
    const scroller = scrollRef.current
    const months = monthsKey.split(",")
    const index = months.indexOf(selectedMonth)
    if (!scroller || index < 0) return
    const centerMonth = () => {
      scroller.scrollLeft = (index + 0.5) / months.length * scroller.scrollWidth - scroller.clientWidth / 2
    }
    centerMonth()
    const observer = new ResizeObserver(centerMonth)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [selectedMonth, monthsKey])

  if (!points.length) return <p className="py-8 text-center text-xs text-[#615D59]">월별 목표 데이터를 확인하지 못했습니다.</p>
  const positiveMax = Math.max(1, ...points.map((point) => Math.max(point.goal ?? 0, point.positive)))
  const negativeMin = Math.min(0, ...points.map((point) => point.negative))
  const upper = positiveMax * 1.18
  const lower = negativeMin * 1.12
  const scaleY = (amount: number) => BOTTOM - (amount - lower) / (upper - lower) * (BOTTOM - TOP)
  const baseline = scaleY(0)
  const band = (WIDTH - LEFT - 16) / points.length
  const chosenMonth = onSelectMonth ? selectedMonth : detailMonth ?? selectedMonth
  const active = points.find((point) => point.month === (inspectedMonth ?? chosenMonth)) ?? points.find((point) => point.current) ?? points[0]
  const fy = Number(points[0].month.slice(0, 4)) - (Number(points[0].month.slice(5)) < 4 ? 1 : 0)

  return (
    <figure aria-label="월별 목표 달성 차트" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-bold text-[#111110]">월별 목표 달성 · FY{fy}</h3>
        <p className="text-[11px] text-[#615D59]">회색 그릇 = 월 목표 · 단위 CNY</p>
      </div>
      <p className="mb-2 text-[11px] text-[#615D59] md:hidden">좌우로 넘겨 4월~3월을 확인하고 월을 눌러 수치를 보세요.</p>
      <div ref={scrollRef} className="overflow-x-auto overscroll-x-contain">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="block min-w-[840px] w-full" role="group" aria-label="회계월별 목표와 확도별 매출">
          <defs>
            <linearGradient id={`${hatchId}-active`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EBF6F1" />
              <stop offset="100%" stopColor="#DCF0E5" />
            </linearGradient>
            <linearGradient id={`${hatchId}-default`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F8F7F5" />
              <stop offset="100%" stopColor="#ECEAE6" />
            </linearGradient>
            <pattern id={hatchId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill={CONFIDENCE_TOKENS.expected.tintBg} />
              <line x1="0" y1="0" x2="0" y2="8" stroke={CONFIDENCE_TOKENS.expected.tintBorder} strokeWidth="2.5" />
            </pattern>
          </defs>
          {[0, positiveMax / 3, positiveMax * 2 / 3, positiveMax, ...(negativeMin < 0 ? [negativeMin] : [])].map((tick) => (
            <text key={tick} x={LEFT - 12} y={scaleY(tick) + 4} textAnchor="end" fontSize="11" fill="#A39E98">{formatMoney(tick)}</text>
          ))}
          <line x1={LEFT} x2={WIDTH - 10} y1={baseline} y2={baseline} stroke="rgba(0,0,0,0.08)" />
          {points.map((point, index) => {
            const x = LEFT + band * index + band / 2
            const goalTop = scaleY(point.goal ?? 0)
            const labelY = scaleY(Math.max(point.goal ?? 0, point.positive)) - 12
            let positive = 0
            let negative = 0
            const segments = SERIES.map(({ key, token }) => {
              const value = point[key]
              const start = value >= 0 ? positive : negative
              if (value >= 0) positive += value
              else negative += value
              return { key, token, value, y: Math.min(scaleY(start), scaleY(start + value)), height: Math.abs(scaleY(start) - scaleY(start + value)) }
            }).filter((segment) => segment.value !== 0)
            const rate = point.rate == null ? "—" : `${point.future ? "~" : ""}${point.rate.toFixed(1)}%`
            const accessible = `${point.month}, 목표 ${point.goal == null ? "비교 불가" : formatMoney(point.goal)}, 확정 ${formatMoney(point.confirmed)}, 고확도 ${formatMoney(point.highConfidence)}, 예정 ${formatMoney(point.expected)}, ${point.rateBasis} ${rate}${point.achieved ? ", 확정 목표 달성" : ""}`
            return (
              <g key={point.month} role="button" tabIndex={0} aria-label={accessible} aria-pressed={point.month === chosenMonth}
                className="group cursor-pointer outline-none transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 [&:focus-visible_.month-focus]:stroke-[#084734]"
                onClick={() => { setDetailMonth(point.month); onSelectMonth?.(point.month) }}
                onPointerEnter={() => setInspectedMonth(point.month)} onPointerLeave={() => setInspectedMonth(null)}
                onFocus={() => setInspectedMonth(point.month)} onBlur={() => setInspectedMonth(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailMonth(point.month); onSelectMonth?.(point.month) }
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault()
                    const next = (index + (event.key === "ArrowRight" ? 1 : -1) + points.length) % points.length
                    const buttons = event.currentTarget.parentElement?.querySelectorAll<SVGGElement>('g[role="button"]')
                    buttons?.[next]?.focus()
                  }
                }}>
                <title>{accessible}</title>
                <rect className="month-focus" x={x - band * 0.48} y={TOP - 26} width={band * 0.96} height={HEIGHT - TOP + 20} fill={point.month === (inspectedMonth ?? chosenMonth) ? "rgba(8,71,52,0.035)" : "transparent"} stroke="transparent" strokeWidth="2" rx="8" style={{ transition: "fill 0.2s ease" }} />
                {point.goal != null && (
                  <rect
                    x={x - band * 0.41}
                    y={goalTop}
                    width={band * 0.82}
                    height={baseline - goalTop}
                    rx="12"
                    fill={point.current || point.month === selectedMonth ? `url(#${hatchId}-active)` : `url(#${hatchId}-default)`}
                    stroke={point.achieved ? CONFIDENCE_TOKENS.confirmed.color : "rgba(0,0,0,0.06)"}
                    strokeWidth={point.achieved ? "1.5" : "1"}
                    style={{ transition: "fill 0.3s ease, stroke 0.3s ease" }}
                  />
                )}
                <clipPath id={`${hatchId}-${index}`}>
                  <rect x={x - band * 0.22} y={scaleY(point.positive)} width={band * 0.44} height={baseline - scaleY(point.positive)} rx="9" />
                  <rect x={x - band * 0.22} y={baseline} width={band * 0.44} height={scaleY(point.negative) - baseline} rx="9" />
                </clipPath>
                <g opacity={point.future ? 0.65 : 1} clipPath={`url(#${hatchId}-${index})`} className="transition-opacity duration-300 group-hover:opacity-95">
                  {segments.map((segment) => <rect key={segment.key} data-confidence={segment.key} x={x - band * 0.22} y={segment.y} width={band * 0.44} height={segment.height} fill={segment.key === "expected" ? `url(#${hatchId})` : segment.token.color} />)}
                </g>
                {point.achieved && (
                  <g>
                    <circle cx={x - 22} cy={labelY - 4} r="7" fill="#E8F6EF" stroke={CONFIDENCE_TOKENS.confirmed.color} strokeWidth="1.5" />
                    <Check x={x - 25.5} y={labelY - 7.5} width={7} height={7} color={CONFIDENCE_TOKENS.confirmed.color} strokeWidth={3} />
                  </g>
                )}
                <text x={point.achieved ? x + 5 : x} y={labelY} textAnchor="middle" fontSize="12" fontWeight="700" fill={point.future || point.rate == null ? "#A39E98" : point.achieved ? CONFIDENCE_TOKENS.confirmed.color : "#B43E3E"}>{rate}</text>
                <text x={x} y={HEIGHT - 8} textAnchor="middle" fontSize="12" fontWeight={point.current || point.month === selectedMonth ? 700 : 500} fill={point.current || point.month === selectedMonth ? "#084734" : "#615D59"}>{Number(point.month.slice(5))}월</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-3.5 py-2 text-[11px] shadow-[0_1px_2px_rgba(0,0,0,0.02)]" aria-live="polite">
        <strong className="text-[12px] font-bold text-[#111110]">{active.month}</strong>
        <span className="text-[#615D59]">목표 <strong className="text-[#111110]">{active.goal == null ? "비교 생략" : formatMoney(active.goal)}</strong></span>
        {SERIES.map(({ key, token }) => (
          <span key={key} className="inline-flex items-center gap-1 font-medium" style={{ color: token.strongColor }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: token.color }} />
            {token.label} {formatMoney(active[key])}
          </span>
        ))}
        <span className="font-semibold text-[#111110]">합계 {formatMoney(active.total)} CNY</span>
      </div>
      <figcaption className="mt-2 text-[10.5px] leading-relaxed text-[#615D59]">
        상단 %: 지난달은 확정 · 당월은 확정+고확도 커버 · 미래 월 ~는 예정 포함 예상치. 빗금은 예정, 체크는 확정액만으로 목표 달성. 음수·상계는 0선 아래에 표시합니다.
        {goalNote ? ` ${goalNote}` : " 목표는 승인 DSH · 금액은 현재 REV 모집단 기준입니다."}
      </figcaption>
    </figure>
  )
}
