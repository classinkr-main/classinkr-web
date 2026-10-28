"use client"

import { GoogleTagManager } from "@next/third-parties/google"
import { usePathname } from "next/navigation"
import { GTM_ID } from "@/lib/analytics-config"
import { isTrackingExcludedPath } from "@/lib/tracking-paths"

export function GTMScript() {
  const pathname = usePathname()
  // /admin 은 isTrackingExcludedPath 안에 있다. /checkout 은 AppChrome(showPublicChrome)이 이미
  // 막지만 컴포넌트 단독 사용에도 새지 않도록 여기서도 막는다.
  const isInternal = isTrackingExcludedPath(pathname) || pathname.startsWith("/checkout")

  if (isInternal || !GTM_ID) return null

  return (
    <>
      <GoogleTagManager gtmId={GTM_ID} />
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
    </>
  )
}
