// 어드민 공용 시각화 토큰 — 순수 상수/함수만 둔다(서버 컴포넌트도 import 가능, "use client" 금지).
// DESIGN.md 원칙: Classin Green(#084734)이 유일한 포화색, 파랑/보라 금지.
// 4톤(neutral·brand·caution·danger) 외 색은 쓰지 않는다.

export type Tone = "neutral" | "brand" | "caution" | "danger"

export interface ToneStyle {
  /** 차트 stroke·스파크라인용 raw hex */
  fg: string
  /** 아이콘 칩 배경 (Tailwind class) */
  surfaceClass: string
  /** 아이콘 텍스트 색 (Tailwind class) */
  iconClass: string
  /** 필 배지 (bg + text + border) */
  badge: string
}

export const TONE: Record<Tone, ToneStyle> = {
  neutral: {
    fg: "#111110",
    surfaceClass: "bg-[#f0f0ec]",
    iconClass: "text-[#1a1a1a]/55",
    badge: "bg-[#f0f0ec] text-[#1a1a1a]/55 border-[#e8e8e4]",
  },
  brand: {
    fg: "#084734",
    surfaceClass: "bg-[#ECFDF5]",
    iconClass: "text-[#084734]",
    badge: "bg-[#ECFDF5] text-[#084734] border-[#D1FAE5]",
  },
  caution: {
    fg: "#D97706",
    surfaceClass: "bg-amber-50",
    iconClass: "text-amber-700",
    badge: "bg-amber-50 text-amber-700 border-amber-100",
  },
  danger: {
    fg: "#B85C33",
    surfaceClass: "bg-[#FEF3EE]",
    iconClass: "text-[#B85C33]",
    badge: "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]",
  },
}

// Recharts에 직접 넘기는 raw hex 모음.
export const CHART = {
  brand: "#084734",
  brandHover: "#065c41",
  brandSoft: "#6EE7B7",
  brandSurface: "#D1FAE5",
  neutral: "#111110",
  warmGray: "#84827a",
  caution: "#D97706",
  danger: "#B85C33",
  grid: "#f0f0ec",
  axis: "#1a1a1a",
  cursor: "#e8e8e4",
  tooltipBg: "#111110",
} as const

// 멀티시리즈 차트용 순서 팔레트 — 파랑 0%. (EventCompare/Meta/Campaign 교체용)
export const SERIES_PALETTE = ["#084734", "#111110", "#B85C33", "#84827a", "#6EE7B7", "#D97706"]

// 도넛/분포 차트용 — overview DONUT_COLORS, analytics CHART_COLORS 대체.
export const SOURCE_PALETTE = ["#111110", "#084734", "#6EE7B7", "#B85C33", "#84827a"]

// 에어리어 차트 그라데이션 <defs> id.
export const GRADIENT = {
  greenArea: "viz-green-area",
  greenAreaSoft: "viz-green-area-soft",
} as const

// Recharts 공통 prop 상수.
export const gridProps = { strokeDasharray: "3 3", stroke: CHART.grid, vertical: false } as const
export const axisTick = { fontSize: 11, fill: CHART.axis, opacity: 0.4 } as const
export const cursorLine = { stroke: CHART.cursor, strokeWidth: 1 } as const

// 기존 산재 톤 리터럴(info/success/warning/danger/neutral)을 4톤으로 흡수.
// 마이그레이션 중 전역 rename 없이 컴파일을 유지하기 위한 어댑터.
export function legacyTone(t?: string): Tone {
  switch (t) {
    case "warning":
      return "caution"
    case "danger":
      return "danger"
    case "info":
    case "success":
    case "brand":
      return "brand"
    default:
      return "neutral"
  }
}
