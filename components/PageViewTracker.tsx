"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { trackEvent } from "@/lib/analytics"

export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const lastTrackedPathRef = useRef<string | null>(null)

  useEffect(() => {
    const path = `${pathname}${search ? `?${search}` : ""}`
    if (lastTrackedPathRef.current === path) return

    lastTrackedPathRef.current = path
    trackEvent("page_view", {
      path,
      title: document.title,
      referrer: document.referrer || undefined,
    })
  }, [pathname, search])

  return null
}
