"use client"

import { GoogleTagManager } from "@next/third-parties/google"
import { usePathname } from "next/navigation"
import { GTM_ID } from "@/lib/analytics-config"
import { isPartnerPortalPath } from "@/lib/partner-portal/pathname"

export function GTMScript() {
  const pathname = usePathname()
  const isInternal = pathname.startsWith("/admin") || isPartnerPortalPath(pathname)

  if (isInternal || !GTM_ID) return null

  return <GoogleTagManager gtmId={GTM_ID} />
}
