import type { SVGProps } from "react"
import { cn } from "@/lib/utils"

interface ClassInAIIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  variant?: "brand" | "white" | "duotone"
  className?: string
}

/**
 * ClassIn AI 어시스턴트 아이콘 — 둥근 사각 말풍선 안에 점 세 개("말 걸어도 돼요").
 * 반짝이(스파클)는 흔한 "AI 생성물" 표식이라 뺐다(2026-10-27). 한 가지 색으로만 그린다.
 */
export function ClassInAIIcon({
  size = 24,
  variant = "brand",
  className,
  ...props
}: ClassInAIIconProps) {
  const color = variant === "white" ? "#FFFFFF" : "#084734"

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
      <path
        d="M6.5 4.5h11a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H11l-4.2 3.1a.5.5 0 0 1-.8-.4V17.5h.5a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z"
        stroke={color}
        strokeWidth="1.75"
        strokeLinejoin="round"
        fill={variant === "duotone" ? "rgba(236,253,245,0.4)" : "none"}
      />
      <circle cx="8.6" cy="11" r="1.25" fill={color} />
      <circle cx="12" cy="11" r="1.25" fill={color} />
      <circle cx="15.4" cy="11" r="1.25" fill={color} />
    </svg>
  )
}
