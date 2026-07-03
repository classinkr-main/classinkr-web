import { StatTile } from "./viz/primitives"
import type { Tone } from "./viz/theme"

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

// 어드민 공용 KPI 카드 — 아이콘 + 라벨 + 값 + 보조설명 + 증감 배지.
// 실 구현은 viz/primitives.StatTile로 통합됨. 이 컴포넌트는 기존 호출부(overview·channel-talk 등)의
// props 시그니처를 그대로 유지하기 위한 얇은 델리게이트다.
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
  return (
    <StatTile
      icon={icon}
      label={label}
      value={value}
      hint={sub}
      trend={trend}
      tone={tone}
      accent={accent}
      iconColor={iconColor}
      sparkline={sparkline}
      href={href}
      lift
    />
  )
}
