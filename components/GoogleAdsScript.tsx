"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID } from "@/lib/analytics-config"
import { isTrackingExcludedPath, sanitizeTrackingUrl } from "@/lib/tracking-paths"

/** 인라인 스크립트에 JSON 을 넣을 때 `</script>` 조기 종료를 막는다. */
function toInlineJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c")
}

/**
 * 초기 페이지 문맥. config 보다 먼저 `gtag('set')` 으로 고정해 AW·G 두 config 의 첫 hit 가
 * 정화된 주소를 쓰게 한다. config 파라미터로 넣지 않는 이유: config 범위 값은 set 보다
 * 우선해서, 소프트 내비게이션마다 PageViewTracker 가 set 으로 바꾸는 page_location 을
 * 랜딩 주소로 덮어 버린다(향상된 측정 자동 이벤트·user_engagement 가 첫 페이지로 묶인다).
 */
function initialPageContext() {
  if (typeof window === "undefined") return {}
  const pageLocation = sanitizeTrackingUrl(window.location.href)
  return {
    ...(pageLocation ? { page_location: pageLocation } : {}),
    page_referrer: sanitizeTrackingUrl(document.referrer),
  }
}

export function GoogleAdsScript() {
  const pathname = usePathname()

  // 경계는 lib/tracking-paths.ts — /admin 포함. /checkout 은 결제 전환 때문에 남긴다.
  if (isTrackingExcludedPath(pathname)) return null

  const ga4Config = GA4_MEASUREMENT_ID
    ? `gtag('config',${JSON.stringify(GA4_MEASUREMENT_ID)},{send_page_view:false});`
    : ""
  const pageContext = `gtag('set',${toInlineJson(initialPageContext())});`

  return (
    <>
      <Script
        id="gtag-ads-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-ads-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());${pageContext}gtag('config',${JSON.stringify(GOOGLE_ADS_ID)});${ga4Config}`}
      </Script>
    </>
  )
}
