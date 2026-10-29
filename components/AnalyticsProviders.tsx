"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"
import { useEffect, useRef, useState } from "react"

import type {} from "@/lib/analytics"
import { KAKAO_PIXEL_ID } from "@/lib/analytics-config"
import { KAKAO_PIXEL_READY_EVENT } from "@/lib/pixels/teardown"
import { isAnalyticsTagExcludedPath } from "@/lib/tracking-paths"

export function AnalyticsProviders() {
  const pathname = usePathname()
  const [isKakaoReady, setIsKakaoReady] = useState(false)
  const [readyRevision, setReadyRevision] = useState(0)
  const lastPageViewPath = useRef<string | null>(null)
  const isInternal = isAnalyticsTagExcludedPath(pathname)

  useEffect(() => {
    const onReady = () => setReadyRevision((revision) => revision + 1)
    window.addEventListener(KAKAO_PIXEL_READY_EVENT, onReady)
    return () => window.removeEventListener(KAKAO_PIXEL_READY_EVENT, onReady)
  }, [])

  useEffect(() => {
    if (!KAKAO_PIXEL_ID || isInternal || (!isKakaoReady && readyRevision === 0)) return
    if (!window.kakaoPixel || lastPageViewPath.current === pathname) return
    window.kakaoPixel(KAKAO_PIXEL_ID)?.pageView()
    lastPageViewPath.current = pathname
  }, [isInternal, isKakaoReady, pathname, readyRevision])

  if (!KAKAO_PIXEL_ID || isInternal) {
    return null
  }

  return (
    <>
      {/* Kakao Pixel */}
      <Script
        src="https://t1.daumcdn.net/adfit/static/kp.js"
        strategy="afterInteractive"
        onReady={() => setIsKakaoReady(true)}
      />
    </>
  )
}
