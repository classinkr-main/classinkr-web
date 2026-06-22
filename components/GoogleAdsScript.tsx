"use client"

import { usePathname } from "next/navigation"
import Script from "next/script"

import { GOOGLE_ADS_ID } from "@/lib/analytics-config"

export function GoogleAdsScript() {
  const pathname = usePathname()

  if (pathname.startsWith("/admin")) return null

  return (
    <>
      <Script
        id="gtag-ads-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="gtag-ads-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GOOGLE_ADS_ID}');`}
      </Script>
    </>
  )
}
