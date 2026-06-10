"use client"

import { useEffect, useRef } from "react"

/** 글 상단 고정 읽기 진행률 바 — 긴 글에서 남은 분량을 체감하게 한다 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let rafId = 0

    const update = () => {
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${progress})`
      }
    }

    const schedule = () => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", schedule, { passive: true })
    window.addEventListener("resize", schedule, { passive: true })
    return () => {
      window.removeEventListener("scroll", schedule)
      window.removeEventListener("resize", schedule)
      cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px]" aria-hidden="true">
      <div
        ref={barRef}
        className="h-full origin-left bg-[#084734]"
        style={{ transform: "scaleX(0)" }}
      />
    </div>
  )
}
