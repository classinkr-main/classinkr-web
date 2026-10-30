"use client"

import { useEffect, useRef, type ReactNode } from "react"

/**
 * 좁은 화면에서 가로로 넘기는 주제 탭이 지금 주제를 화면 밖에 두지 않게, 처음 그릴 때 한 번만
 * 현재 탭(aria-current="page")을 가운데 쪽으로 옮긴다. 넘칠 때만 움직이고 애니메이션은 없다.
 */
export function DocsCategoryNavScroller({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = ref.current
    if (!container || container.scrollWidth <= container.clientWidth) return

    const active = container.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return

    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const offset = activeRect.left - containerRect.left + container.scrollLeft
    container.scrollLeft = Math.max(0, offset - (container.clientWidth - activeRect.width) / 2)
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
