"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { Component, useEffect, useState, type ReactNode } from "react"

import { RouteTransition } from "@/components/transitions/RouteTransition"
import { useConsent } from "@/lib/consent/useConsent"

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
const GTMScript = dynamic(
  () => import("@/components/GTMScript").then((mod) => mod.GTMScript),
  { ssr: false }
)
const MetaPixelScript = dynamic(
  () => import("@/components/MetaPixelScript").then((mod) => mod.MetaPixelScript),
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

function isInternalPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")
  )
}

/**
 * 동의 UI(배너 + "쿠키 설정" 재오픈 경로)를 띄울 경로.
 *
 * `/checkout`·`/receipt`는 헤더/푸터를 감추는 집중 화면이지만 **고객이 보는
 * 페이지이고 gtag.js가 로드된다**(`/checkout/success`에서 purchase 전환까지 발화).
 * 여기에 배너가 없으면 동의를 물어본 적도, 철회할 수단도 없이 태그만 도는
 * 상태가 된다. 이미 결정한 사용자에게는 배너가 뜨지 않으므로 결제 흐름을
 * 방해하지 않는다. `/admin`은 내부 직원용이고 GoogleAdsScript도 자체 bail 한다.
 */
function showsConsentUi(pathname: string) {
  return !pathname.startsWith("/admin")
}

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
  const showPublicChrome = !isInternalPath(pathname)
  const showConsentUi = showsConsentUi(pathname)
  const showAnalytics = showPublicChrome
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
      {/* gtag.js(Google Ads + GA4) 부트스트랩은 app/layout.tsx 한 곳에만 있다. */}
      {showAnalytics ? (
        <>
          <GTMScript />
          <PageViewTracker />
          {consentChoice.marketing ? (
            <>
              <MetaPixelScript />
              <AnalyticsProviders />
            </>
          ) : null}
        </>
      ) : null}
      {showConsentUi ? <ConsentBanner /> : null}
      {showConsentUi ? <PixelConsentSync /> : null}
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
