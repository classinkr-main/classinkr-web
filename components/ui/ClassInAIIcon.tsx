import type { SVGProps } from "react"
import { cn } from "@/lib/utils"

interface ClassInAIIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  variant?: "brand" | "white" | "duotone"
  className?: string
}

/**
 * ClassIn AI 어시스턴트 전용 시그니처 아이콘
 *
 * 친근한 라운디드 대화 버블과 스마트한 4-point AI 스파클(별)이 융합된
 * 프리미엄 벡터 아이콘입니다.
 */
export function ClassInAIIcon({
  size = 24,
  variant = "brand",
  className,
  ...props
}: ClassInAIIconProps) {
  const isWhite = variant === "white"
  const isDuotone = variant === "duotone"

  const bubbleColor = isWhite ? "#FFFFFF" : "#084734"
  const sparkleColor = isWhite ? "#6EE7B7" : isDuotone ? "#10B981" : "#084734"
  const minorSparkleColor = isWhite ? "#A7F3D0" : "#34D399"

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
      {/* 부드러운 라운디드 대화 버블 바디 */}
      <path
        d="M12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12C21 14.3869 20.0689 16.5559 18.5528 18.1568L19.2 21.2L16.1 20.45C14.8617 20.8038 13.4682 21 12 21Z"
        stroke={bubbleColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={isDuotone ? "rgba(236,253,245,0.4)" : "none"}
      />

      {/* 중앙 메인 4-point AI 스타/스파클 */}
      <path
        d="M12 7C12 9.5 10 11.5 7.5 11.5C10 11.5 12 13.5 12 16C12 13.5 14 11.5 16.5 11.5C14 11.5 12 9.5 12 7Z"
        fill={sparkleColor}
      />

      {/* 우측 상단 보조 마이크로 스파클 */}
      <path
        d="M16.5 6.5C16.5 7.6 15.6 8.5 14.5 8.5C15.6 8.5 16.5 9.4 16.5 10.5C16.5 9.4 17.4 8.5 18.5 8.5C17.4 8.5 16.5 7.6 16.5 6.5Z"
        fill={minorSparkleColor}
      />
    </svg>
  )
}
