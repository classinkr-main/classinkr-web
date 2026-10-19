import type { SVGProps } from "react"
import { cn } from "@/lib/utils"

export interface ClassInInternalAIIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  variant?: "brand" | "white" | "dark" | "duotone"
  className?: string
}

/**
 * ClassIn 내부 CS 코파일럿 전용 시그니처 아이콘
 *
 * 사내 지식 SSOT, 장애/기술지원 선례, 본사 소통 기준을 상징하는
 * 신뢰도 높은 테크니컬 쉴드(Shield) 프레임과 정교한 4-point AI 코파일럿 스파클 코어가
 * 융합된 사내 전용 프리미엄 벡터 아이콘입니다.
 */
export function ClassInInternalAIIcon({
  size = 24,
  variant = "brand",
  className,
  ...props
}: ClassInInternalAIIconProps) {
  // 색상 팔레트: DESIGN.md 공식 가이드라인 준수
  // brand: ClassIn Green(#084734) + Emerald(#10B981) + Amber Gold(#D97706) 액센트
  // dark: Warm Dark(#31302E) + Emerald(#10B981)
  // white: Pure White(#FFFFFF) + Emerald Mint(#6EE7B7)
  // duotone: Green Surface 50(#ECFDF5) 틴트 + ClassIn Green + Emerald
  const isWhite = variant === "white"
  const isDark = variant === "dark"
  const isDuotone = variant === "duotone"

  const shieldColor = isWhite ? "#FFFFFF" : isDark ? "#31302E" : "#084734"
  const coreColor = isWhite ? "#6EE7B7" : isDark ? "#10B981" : isDuotone ? "#10B981" : "#084734"
  const accentColor = isWhite ? "#FDE68A" : "#D97706"
  const subNodeColor = isWhite ? "#A7F3D0" : "#059669"
  const fillColor = isDuotone ? "rgba(236,253,245,0.75)" : isWhite ? "rgba(255,255,255,0.12)" : "none"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 transition-transform", className)}
      aria-hidden="true"
      {...props}
    >
      {/* 1. 사내 안전·지식 보호 쉴드(Shield) 프레임 */}
      <path
        d="M12 2.5L4.5 5.8V11.2C4.5 16.1 7.7 20.3 12 21.8C16.3 20.3 19.5 16.1 19.5 11.2V5.8L12 2.5Z"
        stroke={shieldColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fillColor}
      />

      {/* 2. 내부 AI 코파일럿 4-point 정밀 스타 */}
      <path
        d="M12 7.2C12 9.5 10.3 11.3 8 11.8C10.3 12.3 12 14.1 12 16.4C12 14.1 13.7 12.3 16 11.8C13.7 11.3 12 9.5 12 7.2Z"
        fill={coreColor}
      />

      {/* 3. 상단 우측 코파일럿 어시스트 골드 스파클 */}
      <path
        d="M16.5 6C16.5 6.8 15.9 7.4 15.1 7.7C15.9 8 16.5 8.6 16.5 9.4C16.5 8.6 17.1 8 17.9 7.7C17.1 7.4 16.5 6.8 16.5 6Z"
        fill={accentColor}
      />

      {/* 4. 하단 코파일럿 기술지원 연결 노드 닷 */}
      <circle cx="12" cy="18.8" r="1.1" fill={subNodeColor} />
    </svg>
  )
}

export default ClassInInternalAIIcon
