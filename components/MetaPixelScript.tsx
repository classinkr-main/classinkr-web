"use client"

import { usePathname, useSearchParams } from "next/navigation"
import Script from "next/script"
import { useEffect } from "react"
import { META_PIXEL_ID } from "@/lib/analytics-config"

let lastMetaPageViewPath: string | null = null

export function MetaPixelScript() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const isInternal =
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")

  useEffect(() => {
    if (isInternal || !META_PIXEL_ID) return

    const path = `${pathname}${search ? `?${search}` : ""}`
    if (lastMetaPageViewPath === path) return

    let timeout: ReturnType<typeof setTimeout> | null = null
    let attempts = 0

    const trackPageView = () => {
      if (window.fbq) {
        window.fbq("track", "PageView", { path })
        lastMetaPageViewPath = path
        return
      }

      attempts += 1
      if (attempts <= 20) {
        timeout = setTimeout(trackPageView, 250)
      }
    }

    trackPageView()

    return () => {
      if (timeout) clearTimeout(timeout)
    }
  }, [isInternal, pathname, search])

  if (isInternal || !META_PIXEL_ID) return null

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');`,
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
