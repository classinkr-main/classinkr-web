"use client"

import { motion, useReducedMotion } from "framer-motion"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useState } from "react"

type RouteTransitionTone = "public" | "admin"

const transitionByTone = {
  public: {
    duration: 0.28,
    ease: [0.22, 1, 0.36, 1],
  },
  admin: {
    duration: 0.18,
    ease: [0.22, 1, 0.36, 1],
  },
} as const

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
  const shouldReduceMotion = useReducedMotion()
  // 첫 로드는 SSR HTML이 그대로 보여야 하므로(opacity:0 금지) 애니메이션 없이 렌더하고,
  // 최초 진입 경로와 다른 경로로 이동했을 때만 enter 애니메이션을 적용한다.
  const [initialPathname] = useState(pathname)
  const animateIn = pathname !== initialPathname

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  // exit 대기(AnimatePresence mode="wait")는 페이지 이동마다 0.2~0.4초의
  // 인위적 지연을 만들므로 enter 애니메이션만 사용한다.
  // 전체 페이지 blur 필터는 repaint 비용이 커서 제외한다.
  return (
    <motion.div
      key={pathname}
      className={className}
      initial={animateIn ? { opacity: 0, y: tone === "admin" ? 8 : 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={transitionByTone[tone]}
      style={{ minWidth: 0, transformOrigin: "50% 0%" }}
    >
      {children}
    </motion.div>
  )
}
