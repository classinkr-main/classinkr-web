"use client"

import { GoogleTagManager } from "@next/third-parties/google"
import { usePathname } from "next/navigation"
import { GTM_ID } from "@/lib/analytics-config"

export function GTMScript() {
  const pathname = usePathname()
  const isInternal = pathname.startsWith("/admin")

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
