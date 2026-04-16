"use client"

import { usePathname } from "next/navigation"
import { META_PIXEL_ID } from "@/lib/analytics-config"
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function MetaPixelScript() {
  const pathname = usePathname()
  const isInternal = pathname.startsWith("/admin") || isPartnerPortalPath(pathname)

  if (isInternal || !META_PIXEL_ID) return null

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
        }}
      />
      <noscript>
        {/* Meta Pixel noscript fallback uses a raw image beacon by design. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}
