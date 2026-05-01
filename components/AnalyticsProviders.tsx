"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

import { KAKAO_PIXEL_ID } from "@/lib/analytics-config"
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function AnalyticsProviders() {
  const pathname = usePathname()
  const isInternal = pathname.startsWith("/admin") || isPartnerPortalPath(pathname)

  if (!KAKAO_PIXEL_ID || isInternal) {
    return null
  }

  return (
    <>
      {/* Kakao Pixel */}
      <Script src="//t1.daumcdn.net/adfit/static/kp.js" strategy="lazyOnload" />
      <Script id="kakao-pixel" strategy="lazyOnload">
        {`
          if(typeof kakaoPixel !== 'undefined') {
            kakaoPixel('${KAKAO_PIXEL_ID}').pageView();
          }
        `}
      </Script>
    </>
  )
}
