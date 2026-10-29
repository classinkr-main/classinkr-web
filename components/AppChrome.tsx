"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { Component, useEffect, useState, type ReactNode } from "react"

import { RouteTransition } from "@/components/transitions/RouteTransition"
import { useConsent } from "@/lib/consent/useConsent"
import { hidesPublicChrome, isTrackingExcludedPath } from "@/lib/tracking-paths"

const ConditionalHeader = dynamic(() =>
  import("@/components/sections/ConditionalHeader").then((mod) => mod.ConditionalHeader)
)
const ConditionalFooter = dynamic(() =>
  import("@/components/sections/ConditionalFooter").then((mod) => mod.ConditionalFooter)
)
const ConsentBanner = dynamic(
  () => import("@/components/consent/ConsentBanner").then((mod) => mod.ConsentBanner),
  { ssr: false }
)
const FloatingChatbot = dynamic(
  () => import("@/components/ui/FloatingChatbot").then((mod) => mod.FloatingChatbot),
  { ssr: false }
)
const MobileFloatingCTA = dynamic(
  () => import("@/components/ui/MobileFloatingCTA").then((mod) => mod.MobileFloatingCTA),
  { ssr: false }
)
const AnalyticsProviders = dynamic(
  () => import("@/components/AnalyticsProviders").then((mod) => mod.AnalyticsProviders),
  { ssr: false }
)
const PageViewTracker = dynamic(
  () => import("@/components/PageViewTracker").then((mod) => mod.PageViewTracker),
  { ssr: false }
)
const GoogleAdsScript = dynamic(
  () => import("@/components/GoogleAdsScript").then((mod) => mod.GoogleAdsScript),
  { ssr: false }
)
const GTMScript = dynamic(
  () => import("@/components/GTMScript").then((mod) => mod.GTMScript),
  { ssr: false }
)
const NaverAnalyticsScript = dynamic(
  () => import("@/components/NaverAnalyticsScript").then((mod) => mod.NaverAnalyticsScript),
  { ssr: false },
)

const MetaPixelScript = dynamic(
  () => import("@/components/MetaPixelScript").then((mod) => mod.MetaPixelScript),
  { ssr: false }
)
const ContactLinkTracker = dynamic(
  () => import("@/components/ContactLinkTracker").then((mod) => mod.ContactLinkTracker),
  { ssr: false }
)
const PixelConsentSync = dynamic(
  () => import("@/components/PixelConsentSync").then((mod) => mod.PixelConsentSync),
  { ssr: false }
)
const ChannelTalkLoader = dynamic(
  () => import("@/components/ui/ChannelTalkLoader").then((mod) => mod.ChannelTalkLoader),
  { ssr: false }
)

const PUBLIC_WIDGET_IDLE_TIMEOUT_MS = 2800

class PublicWidgetBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const { choice: consentChoice } = useConsent()
  // 크롬·태그 경로 판정은 lib/tracking-paths.ts 한 곳이 정본이다(경로별 표는 그 파일 주석).
  const showPublicChrome = !hidesPublicChrome(pathname)
  // 추적 제외 경계(/admin·/share·/unsubscribe·계정·인증·/receipt).
  // gtag(Google Ads·GA4)는 결제 전환 때문에 /checkout 에서도 띄우고, URL 은 정화해서 보낸다.
  const trackingExcluded = isTrackingExcludedPath(pathname)
  const showGoogleTag = !trackingExcluded
  // GTM·페이지뷰·픽셀은 /checkout 도 뺀다(showPublicChrome) — 그 위에 제외 경로를 더한다.
  // = !isAnalyticsTagExcludedPath(pathname). 컴포넌트 단독 가드가 같은 함수를 쓴다.
  const showAnalytics = showPublicChrome && !trackingExcluded
  const showMobileFloatingCta = showPublicChrome && !pathname.startsWith("/l/")

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const fallbackTimeout = window.setTimeout(() => setReadyPath(pathname), PUBLIC_WIDGET_IDLE_TIMEOUT_MS)

    if (w.requestIdleCallback) {
      const handle = w.requestIdleCallback(() => {
        window.clearTimeout(fallbackTimeout)
        setReadyPath(pathname)
      }, { timeout: PUBLIC_WIDGET_IDLE_TIMEOUT_MS })
      return () => {
        window.clearTimeout(fallbackTimeout)
        w.cancelIdleCallback?.(handle)
      }
    }

    return () => window.clearTimeout(fallbackTimeout)
  }, [pathname])

  return (
    <>
      {showPublicChrome ? <ConditionalHeader /> : null}
      <main className="min-h-screen bg-background font-sans antialiased selection:bg-primary/20 selection:text-primary">
        {showPublicChrome ? (
          <RouteTransition className="min-h-screen">{children}</RouteTransition>
        ) : (
          children
        )}
      </main>
      {showPublicChrome ? <ConditionalFooter /> : null}
      {showGoogleTag ? <GoogleAdsScript /> : null}
      {showPublicChrome ? <PixelConsentSync /> : null}
      {showAnalytics ? (
        <>
          <GTMScript />
          <PageViewTracker />
          <ContactLinkTracker />
          {consentChoice.marketing ? (
            <>
              <MetaPixelScript />
              <NaverAnalyticsScript />
              <AnalyticsProviders />
            </>
          ) : null}
        </>
      ) : null}
      {showPublicChrome ? <ConsentBanner /> : null}
      {showPublicChrome ? <ChannelTalkLoader /> : null}
      {/* 챗봇은 첫 idle 마운트 이후 계속 떠 있게 유지한다 — readyPath는 한 번
          채워지면 null로 되돌아가지 않으므로, 소프트 내비게이션 중에도 언마운트되지
          않아 대화·열림 상태가 보존된다. MobileFloatingCTA는 기존대로 페이지마다
          재평가한다. */}
      {showPublicChrome && readyPath !== null ? (
        <PublicWidgetBoundary resetKey={`chatbot:${readyPath}`}>
          <FloatingChatbot />
        </PublicWidgetBoundary>
      ) : null}
      {showMobileFloatingCta && readyPath === pathname ? (
        <PublicWidgetBoundary resetKey={`mobile-cta:${pathname}`}>
          <MobileFloatingCTA />
        </PublicWidgetBoundary>
      ) : null}
    </>
  )
}
