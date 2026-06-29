import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"
import { TONE, type Tone } from "./viz/theme"

export interface StatCardTrend {
  value: number
  label: string
  // 배지 표기 방식: "count"=절대 증감(기본), "percent"=퍼센트(value는 0.12 같은 비율).
  format?: "count" | "percent"
  // 증가가 나쁜 지표(예: 미응대, 이탈)는 invert로 색상을 뒤집는다.
  invert?: boolean
}

export interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  trend?: StatCardTrend
  // tone을 주면 4톤(neutral·brand·caution·danger)에서 accent/iconColor를 도출한다.
  // 레거시 accent/iconColor는 tone 미지정 시 폴백으로 유지(기존 호출부 무손상).
  tone?: Tone
  accent?: string
  iconColor?: string
  // KPI 카드 아래 미니 추이. <Sparkline/>을 next/dynamic으로 감싼 노드를 슬롯으로 받는다
  // (StatCard 자체는 Recharts-free 유지).
  sparkline?: React.ReactNode
  // 주면 카드 전체가 해당 경로로 이동하는 드릴다운 링크가 된다.
  href?: string
}

function trendBadgeValue(trend: StatCardTrend) {
  if (trend.format === "percent") {
    return `${trend.value > 0 ? "+" : ""}${Math.round(trend.value * 100)}%`
  }
  return String(Math.abs(trend.value))
}

// 어드민 공용 KPI 카드 — 아이콘 + 라벨 + 값 + 보조설명 + 증감 배지.
// Overview의 증감 배지 패턴을 표준화한 것으로 analytics·branch·CRM에서 재사용한다.
export function StatCard({
  icon,
  label,
  value,
  sub,
  trend,
  tone,
  accent = "bg-[#f0f0ec]",
  iconColor = "text-[#1a1a1a]/50",
  sparkline,
  href,
}: StatCardProps) {
  const positive = trend ? (trend.invert ? trend.value < 0 : trend.value > 0) : false
  const neutral = trend ? trend.value === 0 : false

  // tone 우선 → 없으면 레거시 accent/iconColor.
  const resolvedAccent = tone ? TONE[tone].surfaceClass : accent
  const resolvedIcon = tone ? TONE[tone].iconClass : iconColor

  const body = (
    <>
      <div className="mb-3 flex items-start justify-between">
        <div className={`inline-flex rounded-xl p-2 ${resolvedAccent}`}>
          <span className={resolvedIcon}>{icon}</span>
        </div>
        {trend && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
              neutral
                ? "bg-[#f0f0ec] text-[#1a1a1a]/40"
                : positive
                  ? "bg-green-50 text-green-600"
                  : "bg-[#FEF3EE] text-[#B85C33]"
            }`}
          >
            {neutral ? (
              <Minus className="h-3 w-3" />
            ) : trend.value > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trendBadgeValue(trend)}
          </span>
        )}
      </div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#1a1a1a]/40">{label}</p>
      <p className="text-[28px] font-bold leading-none tracking-[-0.03em] text-[#111110]">{value}</p>
      {sub && <p className="mt-1.5 text-[11px] text-[#1a1a1a]/40">{sub}</p>}
      {trend && <p className="mt-0.5 text-[11px] text-[#1a1a1a]/30">{trend.label}</p>}
      {sparkline && <div className="mt-3 -mb-1">{sparkline}</div>}
    </>
  )

  const cardClass =
    "block bg-white rounded-2xl border border-[#e8e8e4] p-5 shadow-[0_1px_0_rgba(17,17,16,0.02)] transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_12px_30px_rgba(17,17,16,0.04)]"

  if (href) {
    return (
      <Link href={href} className={cardClass}>
        {body}
      </Link>
    )
  }
  return <div className={cardClass}>{body}</div>
}
