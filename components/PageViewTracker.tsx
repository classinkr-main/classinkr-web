"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { setGooglePageContext, trackEvent, trackInternalEvent } from "@/lib/analytics"
import { currentChoice } from "@/lib/consent/consent"
import { useConsent } from "@/lib/consent/useConsent"
import { collectLeadAttribution } from "@/lib/marketing-attribution"
import { sanitizeTrackingPath, sanitizeTrackingUrl } from "@/lib/tracking-paths"

// 직전에 추적한 앱 내부 URL(정화본). 소프트 내비게이션에서는 document.referrer 가 첫 진입
// 리퍼러로 고정돼 있어 page_referrer 를 직접 이어 줘야 한다. 트래커가 다시 마운트돼도
// (제외 경로를 거쳐 돌아오는 경우) 이어지도록 모듈 범위에 둔다.
let previousTrackedLocation: string | null = null

export function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const { choice } = useConsent()
  const lastTrackedKeyRef = useRef<string | null>(null)
  // 분석 동의 없이 추적된 페이지뷰 — 나중에 같은 페이지에서 동의하면 내부 적재만 한 번 채운다.
  const pendingInternalRef = useRef<{
    path: string
    title: string
    referrer: string | undefined
  } | null>(null)
  // 광고 귀속 파라미터만 남긴 경로. 이걸 중복 키로 쓰므로 `?prefill=` 을 replaceState 로
  // 지우는 것 같은 쿼리 정리는 새 페이지뷰가 되지 않는다.
  const path = sanitizeTrackingPath(`${pathname}${search ? `?${search}` : ""}`)

  useEffect(() => {
    // 동의 플래그는 키에 넣지 않는다 — 넣으면 배너에서 동의하는 순간 같은 페이지의
    // GA4 page_view 가 한 번 더 나간다. 동의 변경은 아래 effect 가 내부 적재로만 다룬다.
    if (lastTrackedKeyRef.current === path) return
    lastTrackedKeyRef.current = path

    const pageLocation = sanitizeTrackingUrl(window.location.href)
    // 내부 적재의 referrer 는 예전 의미(문서 리퍼러 = 첫 진입 출처)를 유지하되 정화만 한다.
    const documentReferrer = sanitizeTrackingUrl(document.referrer) || undefined
    // GA4 page_referrer 는 직전 앱 내부 페이지 — 첫 진입이면 외부 리퍼러.
    const pageReferrer = previousTrackedLocation ?? documentReferrer
    const pageTitle = document.title

    collectLeadAttribution()
    setGooglePageContext({
      page_location: pageLocation,
      page_referrer: pageReferrer ?? "",
      page_title: pageTitle,
    })
    trackEvent("page_view", {
      path,
      title: pageTitle,
      referrer: documentReferrer,
      page_title: pageTitle,
      page_location: pageLocation || undefined,
      page_referrer: pageReferrer,
    })
    previousTrackedLocation = pageLocation || previousTrackedLocation
    // trackEvent 가 내부 적재 여부를 정하는 기준(currentChoice)과 같은 값으로 판단한다.
    pendingInternalRef.current = currentChoice().analytics
      ? null
      : { path, title: pageTitle, referrer: documentReferrer }
  }, [path])

  useEffect(() => {
    const pending = pendingInternalRef.current
    if (!choice.analytics || !pending || pending.path !== path) return
    pendingInternalRef.current = null
    trackInternalEvent("page_view", pending)
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
