"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useState } from "react"

type RouteTransitionTone = "public" | "admin"

export function RouteTransition({
  children,
  tone = "public",
  className = "",
}: {
  children: ReactNode
  tone?: RouteTransitionTone
  className?: string
}) {
  const pathname = usePathname()
  // 첫 로드는 SSR HTML이 그대로 보여야 하므로(opacity:0 금지) 애니메이션 없이 렌더하고,
  // 최초 진입 경로와 다른 경로로 이동했을 때만 enter 애니메이션을 적용한다.
  const [initialPathname] = useState(pathname)
  const animateIn = pathname !== initialPathname
  const transitionClassName = animateIn ? `route-transition route-transition-${tone}` : ""

  return (
    <div
      key={pathname}
      className={[className, transitionClassName].filter(Boolean).join(" ")}
      style={{ minWidth: 0, transformOrigin: "50% 0%" }}
    >
      {children}
    </div>
  )
}
