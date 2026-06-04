"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"
import type { ReactNode } from "react"

type RouteTransitionTone = "public" | "admin"

const transitionByTone = {
  public: {
    duration: 0.36,
    ease: [0.22, 1, 0.36, 1],
  },
  admin: {
    duration: 0.24,
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
  const hasMounted = useRef(false)

  useEffect(() => {
    hasMounted.current = true
  }, [])

  if (shouldReduceMotion) {
    return <div className={className}>{children}</div>
  }

  const isAdmin = tone === "admin"
  const transition = transitionByTone[tone]

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={pathname}
        className={className}
        initial={
          hasMounted.current
            ? {
                opacity: 0,
                y: isAdmin ? 8 : 12,
                filter: isAdmin ? "blur(3px)" : "blur(5px)",
              }
            : false
        }
        animate={{
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
        }}
        exit={{
          opacity: 0,
          y: isAdmin ? -4 : -8,
          filter: isAdmin ? "blur(2px)" : "blur(4px)",
        }}
        transition={transition}
        style={{
          minWidth: 0,
          transformOrigin: "50% 0%",
          willChange: "opacity, transform, filter",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
