"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { trackEvent } from "@/lib/analytics"
import { useConsent } from "@/lib/consent/useConsent"
import { collectLeadAttribution } from "@/lib/marketing-attribution"

export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const { choice } = useConsent()
  const lastTrackedKeyRef = useRef<string | null>(null)
  const path = `${pathname}${search ? `?${search}` : ""}`

  useEffect(() => {
    const key = `${path}::analytics=${choice.analytics ? "1" : "0"}`
    if (lastTrackedKeyRef.current === key) return

    lastTrackedKeyRef.current = key
    collectLeadAttribution()
    trackEvent("page_view", {
      path,
      title: document.title,
      referrer: document.referrer || undefined,
    })
  }, [choice.analytics, path])

  useEffect(() => {
    if (!choice.analytics) return

    const startedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now()
    let flushed = false

    const elapsedMs = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now()
      return Math.max(0, Math.min(30 * 60 * 1000, Math.round(now - startedAt)))
    }

    const flushExit = (exitType: "route_change" | "pagehide") => {
      if (flushed) return
      flushed = true
      trackEvent("page_exit", {
        path,
        title: document.title,
        duration_ms: elapsedMs(),
        exit_type: exitType,
      })
    }

    const handlePageHide = () => flushExit("pagehide")
    window.addEventListener("pagehide", handlePageHide)

    return () => {
      window.removeEventListener("pagehide", handlePageHide)
      flushExit("route_change")
    }
  }, [choice.analytics, path])

  return null
}
