"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

import { GA4_MEASUREMENT_ID, GOOGLE_ADS_ID } from "@/lib/analytics-config"

export function GoogleAdsScript() {
  const pathname = usePathname()
  const ga4Config = GA4_MEASUREMENT_ID
    ? `gtag('config',${JSON.stringify(GA4_MEASUREMENT_ID)},{send_page_view:false});`
    : ""

  if (pathname.startsWith("/admin")) return null

  return (
    <>
      <Script
        id="gtag-ads-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-ads-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(GOOGLE_ADS_ID)});${ga4Config}`}
      </Script>
    </>
  )
}
