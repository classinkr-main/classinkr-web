"use client"

import { GoogleTagManager } from "@next/third-parties/google"
import { usePathname } from "next/navigation"
import { GTM_ID } from "@/lib/analytics-config"
import { isAnalyticsTagExcludedPath } from "@/lib/tracking-paths"

export function GTMScript() {
  const pathname = usePathname()
  // /admin 은 추적 제외 경로(isTrackingExcludedPath)에, /checkout 은 크롬 없는 터널에 든다 —
  // 둘 다 isAnalyticsTagExcludedPath 가 막는다. AppChrome 이 이미 막지만 컴포넌트 단독 사용에도
  // 새지 않도록 여기서도 막는다.
  const isInternal = isAnalyticsTagExcludedPath(pathname)

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
