"use client"

import { useEffect, useRef } from "react"
import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

/**
 * 스스로 스크롤되는 고정 열(데스크톱 사이드바).
 * 문서를 열 때마다 지금 문서 링크가 열 안에 보이도록 열의 스크롤만 옮긴다(페이지는 움직이지 않는다).
 */
export function DocsStickyColumn({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    const column = ref.current
    if (!column || column.scrollHeight <= column.clientHeight) return
    const active = column.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return

    const columnRect = column.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    if (activeRect.top >= columnRect.top && activeRect.bottom <= columnRect.bottom - 24) return

    column.scrollTop += activeRect.top - columnRect.top - column.clientHeight / 3
  }, [pathname])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
