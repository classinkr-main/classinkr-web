"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"

import { ConsentBanner } from "@/components/consent/ConsentBanner"
import { RouteTransition } from "@/components/transitions/RouteTransition"
import { useConsent } from "@/lib/consent/useConsent"

const ConditionalHeader = dynamic(() =>
  import("@/components/sections/ConditionalHeader").then((mod) => mod.ConditionalHeader)
)
const ConditionalFooter = dynamic(() =>
  import("@/components/sections/ConditionalFooter").then((mod) => mod.ConditionalFooter)
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
function isInternalPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/receipt")
  )
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [readyPath, setReadyPath] = useState<string | null>(null)
  const { choice: consentChoice } = useConsent()
  const showPublicChrome = !isInternalPath(pathname)
  const showAnalytics = showPublicChrome

  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }

    if (w.requestIdleCallback) {
      const handle = w.requestIdleCallback(() => setReadyPath(pathname), { timeout: 1800 })
      return () => w.cancelIdleCallback?.(handle)
    }

    const timeout = window.setTimeout(() => setReadyPath(pathname), 1200)
    return () => window.clearTimeout(timeout)
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
      {showPublicChrome ? <ConsentBanner /> : null}
      {showPublicChrome && readyPath === pathname ? (
        <>
          <FloatingChatbot />
          <MobileFloatingCTA />
        </>
      ) : null}
    </>
  )
}
