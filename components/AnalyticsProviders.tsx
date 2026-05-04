"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"
import { useEffect, useState } from "react"

import type {} from "@/lib/analytics"
import { KAKAO_PIXEL_ID } from "@/lib/analytics-config"
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function AnalyticsProviders() {
  const pathname = usePathname()
  const [isKakaoReady, setIsKakaoReady] = useState(false)
  const isInternal = pathname.startsWith("/admin") || isPartnerPortalPath(pathname)

  useEffect(() => {
    if (!KAKAO_PIXEL_ID || isInternal || !isKakaoReady) return
    window.kakaoPixel?.(KAKAO_PIXEL_ID)?.pageView()
  }, [isInternal, isKakaoReady, pathname])

  if (!KAKAO_PIXEL_ID || isInternal) {
    return null
  }

  return (
    <>
      {/* Kakao Pixel */}
      <Script
        src="//t1.daumcdn.net/adfit/static/kp.js"
        strategy="lazyOnload"
        onReady={() => setIsKakaoReady(true)}
      />
    </>
  )
}
