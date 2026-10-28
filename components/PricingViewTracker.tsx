"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

import { trackEvent } from "@/lib/analytics"

/**
 * 경로 → 가격 화면 슬러그. `/pricing` → pricing, `/pricing/simulator` → pricing_simulator,
 * `/pricing/simulator/krw` → pricing_simulator_krw. 값은 경로 조각에서만 만든다(쿼리 없음).
 */
export function getPricingSurface(pathname: string | null | undefined): string {
  const segments = (pathname ?? "")
    .split("/")
    .map((segment) => segment.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean)
  return segments.length > 0 ? segments.join("_").slice(0, 60) : "pricing"
}

/**
 * pricing_view — `app/pricing/layout.tsx` 가 감싸는 모든 가격 화면에서 화면별 1회.
 * 레이아웃은 하위 경로 이동 중에도 유지되므로 pathname 이 바뀔 때마다 새 화면으로 센다.
 */
export function PricingViewTracker() {
  const pathname = usePathname()
  const lastTrackedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname || lastTrackedRef.current === pathname) return
    lastTrackedRef.current = pathname
    trackEvent("pricing_view", {
      pricing_surface: getPricingSurface(pathname),
      page_path: pathname,
    })
  }, [pathname])

  return null
}
