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
  const lastTrackedPathRef = useRef<string | null>(null)
  const path = `${pathname}${search ? `?${search}` : ""}`

  // 마케팅 동의 상태가 바뀌면 어트리뷰션 저장/정리를 다시 평가한다.
  // (동의 시 적재 시작, 철회 시 저장된 광고 식별자 삭제 — lib/marketing-attribution)
  useEffect(() => {
    collectLeadAttribution()
  }, [choice.marketing, path])

  // page_view는 **경로당 정확히 한 번**만 발화한다.
  // 이전에는 dedup 키에 동의 상태가 섞여 있어, 배너에서 동의하는 순간 같은 경로에
  // 두 번째 page_view가 나가 GA4가 이중 계측했다.
  useEffect(() => {
    if (lastTrackedPathRef.current === path) return

    lastTrackedPathRef.current = path
    trackEvent("page_view", {
      path,
      title: document.title,
      referrer: document.referrer || undefined,
    })
  }, [path])

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
