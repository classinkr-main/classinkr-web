"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  MoreHorizontal,
  Search,
  SquareChevronLeft,
  SquareChevronRight,
  Users,
  X,
} from "lucide-react"
import { adminFetchJsonCached, clearAdminSessionStorage, warmAdminRequestCache } from "@/lib/admin-client"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import AdminNotificationsBell from "./AdminNotificationsBell"
import {
  ADMIN_NAV,
  ADMIN_NAV_SECTIONS,
  ADMIN_NAV_SECTION_META,
  CRM_CHILD_NAV,
  type AdminNavItem,
  type AdminRole,
} from "./admin-nav"

// NAV(섹션·항목·롤·뱃지)·SECTION_META·CRM 하위 nav는 admin-nav.ts(SSOT)로 추출됨 —
// 커맨드 팔레트(AdminCommandPalette)와 공유한다. 이 파일은 렌더링·warm-up 등 동작만 담당.

// hover warm-up은 페이지가 실제 호출하는 URL과 캐시 키(쿼리스트링 포함)가 완전히 같아야 적중한다.
// 날짜 파라미터가 붙는 URL은 hover 시점에 페이지와 같은 계산식으로 만들어야 하므로 함수 항목을 허용한다.

// /admin/overview 대시보드와 동일한 계산식 — 현재 월 + (7일 뒤가 다른 달에 걸치면) 그 달.
function overviewCalendarUrls() {
  const now = new Date()
  const weekLater = new Date(now)
  weekLater.setDate(now.getDate() + 7)
  const months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
  if (weekLater.getMonth() !== now.getMonth() || weekLater.getFullYear() !== now.getFullYear()) {
    months.push({ year: weekLater.getFullYear(), month: weekLater.getMonth() + 1 })
  }
  return months.map(({ year, month }) => `/api/admin/calendar?year=${year}&month=${month}`)
}

const NAV_WARMUP_REQUESTS: Record<string, string[] | (() => string[])> = {
  "/admin/overview": () => [
    // overview 페이지가 실제 호출하는 URL과 캐시 키를 맞춰야 hover-warm이 적중한다.
    "/api/admin/leads?scope=dashboard",
    "/api/admin/subscribers?count=1",
    "/api/admin/blog",
    "/api/admin/email",
    ...overviewCalendarUrls(),
    // overview는 GET /api/admin/settings 대신 env+DB 합성 health를 읽는다 (페이지 주석 참조).
    "/api/admin/settings/integrations/status",
    "/api/admin/bugs",
    "/api/admin/patch-notes",
  ],
  "/admin/crm": [
    "/api/admin/crm/action-kpis",
    "/api/admin/crm/overview",
    "/api/admin/crm/neo?granularity=month&offset=0",
  ],
  "/admin/channel-talk": ["/api/admin/channel-talk", "/api/admin/channel-talk/mine"],
  "/admin/calendar": () => {
    // 캘린더 페이지 초기 로드는 항상 현재 연/월 쿼리를 붙인다.
    const now = new Date()
    return [`/api/admin/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`]
  },
  // /admin/quotes 기본 탭은 portalFetch(/api/portal/documents?type=quote)라 admin 캐시를 읽지 않는다 — warm 대상 아님.
  "/admin/campaigns": [
    "/api/admin/email",
    "/api/admin/subscribers",
    "/api/admin/events",
    "/api/admin/event-metrics",
    "/api/admin/meta/campaigns?datePreset=last_30d&limit=50",
  ],
  "/admin/lead-magnets": [
    "/api/admin/lead-magnets",
    "/api/admin/lead-magnets/metrics?days=30",
  ],
  "/admin/blog": ["/api/admin/blog", "/api/admin/blog?trash=1"],
  "/admin/events": ["/api/admin/events"],
  "/admin/docs": [
    "/api/admin/docs",
    "/api/admin/docs/analytics?days=30",
    // 보강 큐 탭(문서 센터로 병합됨)을 호버 시 미리 데워둔다.
    "/api/admin/docs/gaps",
    "/api/admin/docs/alpha-readiness",
  ],
  // 문서 보강 큐 nav 항목은 탭 딥링크(/admin/docs?tab=gaps)를 직접 가리킨다 — warm 키도 href와 동일해야 적중.
  // 챗봇 운영 대시보드 흡수 후 DocsGapsPanel이 /api/admin/chatbot/stats(질문 패턴)도 읽으므로 함께 데운다.
  "/admin/docs?tab=gaps": [
    "/api/admin/docs/alpha-readiness",
    "/api/admin/docs/gaps",
    "/api/admin/chatbot/stats",
  ],
  "/admin/branch": [
    "/api/admin/branch/summary?team=ALL&period=Q",
    "/api/admin/branch/kpi?team=ALL&period=Q",
  ],
  "/admin/branch/ledger": [
    "/api/admin/branch/summary?team=ALL&period=Q",
    "/api/admin/branch/kpi?team=ALL&period=Q",
    "/api/admin/branch/pipeline?team=ALL&period=Q",
  ],
  "/admin/hardware": ["/api/admin/hardware"],
  "/admin/traffic": [
    "/api/admin/visitor-stats?range=30",
    "/api/admin/homepage-flow?range=30",
    "/api/admin/event-counts?range=30",
    "/api/admin/marketing/conversions/status",
  ],
  "/admin/analytics": [
    "/api/admin/leads",
    "/api/admin/subscribers",
    "/api/admin/email",
    "/api/admin/blog",
    "/api/admin/events",
    "/api/admin/event-metrics",
    "/api/admin/event-counts?range=30",
  ],
  "/admin/ops": [
    "/api/admin/settings/integrations/status",
    "/api/admin/automation/rules",
    "/api/admin/automation/logs",
  ],
  "/admin/settings": ["/api/admin/settings"],
  "/admin/users": ["/api/admin/users"],
  "/admin/dev": ["/api/admin/roadmap", "/api/admin/bugs", "/api/admin/patch-notes"],
}

// 사이드바 nav 전용 초미니멀 스크롤바: 4px 폭 + 투명 트랙 + hover 시에만 또렷한 thumb.
const MINIMAL_SCROLLBAR =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/10 hover:[&::-webkit-scrollbar-thumb]:bg-black/20"

// 저장된 세그먼트 — 고객 하위 퀵필터(?view=). 카운트는 통합 API summary.viewCounts.
const CRM_SEGMENTS: Array<{ view: string; label: string }> = [
  { view: "expiring", label: "만료 임박" },
  { view: "dormant", label: "30일+ 미접촉" },
  { view: "hot_lead", label: "고전환 리드" },
  { view: "upsell", label: "업셀 후보" },
]

const MOBILE_PRIMARY_HREFS = [
  "/admin/overview",
  "/admin/crm",
  "/admin/quotes",
  "/admin/docs?tab=gaps",
] as const

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "최고 관리자",
  ADMIN: "관리자",
  EDITOR: "에디터",
  VIEWER: "뷰어",
  BRANCH: "지사장",
  PARTNER: "파트너",
}

interface Props {
  role: string
  name: string
  email: string
}

function normalizeRole(role: string): AdminRole {
  const normalized = role.trim()

  if (normalized === "admin" || normalized === "ADMIN") return "ADMIN"
  if (normalized === "branch" || normalized === "BRANCH") return "BRANCH"
  if (normalized === "partner" || normalized === "PARTNER") return "PARTNER"
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (normalized === "EDITOR") return "EDITOR"
  if (normalized === "VIEWER") return "VIEWER"

  return "ADMIN"
}

// nav href의 쿼리 딥링크(예: /admin/docs?tab=gaps)를 path와 query로 분리한다.
function splitNavHref(href: string): { path: string; query: string | null } {
  const queryIndex = href.indexOf("?")
  return queryIndex === -1
    ? { path: href, query: null }
    : { path: href.slice(0, queryIndex), query: href.slice(queryIndex + 1) }
}

export default function AdminSidebar(props: Props) {
  // useSearchParams(쿼리 인지형 active 매칭)는 프리렌더 시 Suspense 경계를 요구한다.
  // 사이드바는 클라이언트 컴포넌트지만 정적 프리렌더 대상이 될 수 있어 자체 경계로 감싼다.
  // admin layout이 세션 확인 전에는 스켈레톤을 그리므로 fallback null로 충분하다.
  return (
    <Suspense fallback={null}>
      <AdminSidebarContent {...props} />
    </Suspense>
  )
}

function AdminSidebarContent({ role, name, email }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const prefetchedHrefs = useRef(new Set<string>())
  const warmedHrefs = useRef(new Set<string>())
  const warmupTimerRef = useRef<number | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_collapsed") === "true"
  })
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(media.matches)

    update()
    media.addEventListener("change", update)

    return () => media.removeEventListener("change", update)
  }, [])

  const effectiveCollapsed = isDesktop === true && collapsed
  const inCrm = pathname?.startsWith("/admin/crm") ?? false
  const [crmSegCounts, setCrmSegCounts] = useState<Record<string, number> | null>(null)
  // CRM 하위탭 접기 — admin layout이 유지 마운트라 네비게이션 동안 상태 보존(하드 리로드만 리셋).
  // CRM 드릴인 nav — 진입 시 기본 글로벌 탭이 접히고 CRM 하위 패널이 열린다. '← 전체 메뉴'로 복귀.
  const [navView, setNavView] = useState<"auto" | "global">("auto")
  const crmDrill = inCrm && navView !== "global" && !effectiveCollapsed

  // CRM 진입 시에만 세그먼트 카운트 1회 lazy 로드(캐시, 논블로킹). 미로드 시 라벨만 표시.
  useEffect(() => {
    if (!inCrm || crmSegCounts) return
    let alive = true
    adminFetchJsonCached<{ summary?: { viewCounts?: Record<string, number> } }>(
      "/api/admin/crm/customers/unified?limit=1",
      undefined,
      { cacheKey: "sidebar:crm-seg-counts", ttlMs: 120_000, staleWhileRevalidateMs: 300_000 }
    )
      .then((d) => {
        if (alive) setCrmSegCounts(d?.summary?.viewCounts ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [inCrm, crmSegCounts])

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("admin_sidebar_collapsed", String(!prev))
      return !prev
    })
  }

  const handleLogout = async () => {
    clearAdminSessionStorage()

    if (hasSupabaseBrowserEnv()) {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    }

    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => null)

    router.replace("/admin/login")
    router.refresh()
  }

  const normalizedRole = normalizeRole(role)
  const visibleNav = useMemo(
    () => ADMIN_NAV.filter((item) => item.roles.includes(normalizedRole)),
    [normalizedRole]
  )
  // 현재 URL 쿼리가 nav href의 쿼리(예: tab=gaps)를 전부 포함하는지 판별.
  const queryMatches = (query: string) => {
    const wanted = new URLSearchParams(query)
    for (const [key, value] of wanted.entries()) {
      if (searchParams.get(key) !== value) return false
    }
    return true
  }
  // 쿼리 인지형 active 매칭 — 쿼리 딥링크 항목은 path+query가 모두 맞아야 active,
  // 쿼리 없는 항목은 같은 경로의 쿼리 딥링크 형제가 매칭되면 하이라이트를 양보한다
  // (가이드 문서 /admin/docs vs 문서 보강 큐 /admin/docs?tab=gaps).
  const isNavActive = (href: string) => {
    const { path, query } = splitNavHref(href)
    const onPath = pathname === path || pathname.startsWith(`${path}/`)
    if (!onPath) return false
    if (query) return queryMatches(query)
    return !visibleNav.some((item) => {
      const sibling = splitNavHref(item.href)
      // 쿼리 딥링크 형제(같은 경로, 예: /admin/docs vs /admin/docs?tab=gaps)에 양보.
      if (sibling.path === path && sibling.query !== null && queryMatches(sibling.query)) return true
      // 더 깊은 경로 형제(예: /admin/branch vs /admin/branch/ledger)가 현재 경로에 맞으면 상위는 양보 —
      // KR Team과 매출 장부가 동시에 하이라이트되지 않게 한다.
      if (sibling.path.startsWith(`${path}/`) && (pathname === sibling.path || pathname.startsWith(`${sibling.path}/`))) return true
      return false
    })
  }
  const currentNavItem = visibleNav.find((item) => isNavActive(item.href)) ?? visibleNav[0]
  const mobilePrimaryNav = MOBILE_PRIMARY_HREFS
    .map((href) => visibleNav.find((item) => item.href === href))
    .filter((item): item is AdminNavItem => Boolean(item))
  const mobileBottomColumns = Math.min(mobilePrimaryNav.length + 1, 5)
  const groupedNav = ADMIN_NAV_SECTIONS.map((section) => ({
    section,
    items: visibleNav.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0)

  const prefetchAdminRoute = useCallback((href: string) => {
    if (prefetchedHrefs.current.has(href)) return
    prefetchedHrefs.current.add(href)

    try {
      router.prefetch(href)
    } catch {
      // Prefetch is an optimization only.
    }
  }, [router])

  const warmAdminTab = useCallback((href: string) => {
    prefetchAdminRoute(href)

    if (warmedHrefs.current.has(href)) return
    warmedHrefs.current.add(href)

    const warmupEntry = NAV_WARMUP_REQUESTS[href]
    const warmupUrls = typeof warmupEntry === "function" ? warmupEntry() : warmupEntry ?? []
    for (const url of warmupUrls) {
      void warmAdminRequestCache(url, { ttlMs: 60_000 })
    }
  }, [prefetchAdminRoute])

  const scheduleWarmAdminTab = useCallback((href: string) => {
    prefetchAdminRoute(href)

    if (warmupTimerRef.current !== null) {
      window.clearTimeout(warmupTimerRef.current)
    }

    warmupTimerRef.current = window.setTimeout(() => {
      warmAdminTab(href)
      warmupTimerRef.current = null
    }, 180)
  }, [prefetchAdminRoute, warmAdminTab])

  const cancelWarmAdminTab = useCallback(() => {
    if (warmupTimerRef.current === null) return
    window.clearTimeout(warmupTimerRef.current)
    warmupTimerRef.current = null
  }, [])

  useEffect(() => () => cancelWarmAdminTab(), [cancelWarmAdminTab])

  useEffect(() => {
    const run = () => {
      visibleNav.slice(0, 6).forEach((item) => prefetchAdminRoute(item.href))
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idleId = idleWindow.requestIdleCallback?.(run, { timeout: 1_800 })

    if (idleId !== undefined) {
      return () => idleWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = window.setTimeout(run, 650)
    return () => window.clearTimeout(timeoutId)
  }, [prefetchAdminRoute, visibleNav])

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b border-[#e8e8e4] bg-white/95 px-3 pr-16 shadow-sm backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#e8e8e4] bg-white text-[#111110] shadow-sm"
        aria-label="Open admin menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
          Classin Admin
        </p>
        <h1 className="truncate text-[15px] font-semibold text-[#111110]">
          {currentNavItem?.label ?? "Admin"}
        </h1>
      </div>
      {isDesktop === false ? <AdminNotificationsBell placement="inline" /> : null}
    </header>

    {mobileMenuOpen ? (
      <div className="fixed inset-0 z-[60] lg:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-[#111110]/35"
          aria-label="Close admin menu"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-[#e8e8e4] bg-white shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[#e8e8e4] px-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
              <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#e8e8e4] text-[#1a1a1a]/55"
              aria-label="Close admin menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-[#e8e8e4] px-4 py-3">
            <p className="truncate text-[13px] font-medium text-[#111110]">{name}</p>
            <p className="truncate text-[11px] text-[#1a1a1a]/40">
              {ROLE_LABEL[normalizedRole]}{email ? ` - ${email}` : ""}
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {crmDrill ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setNavView("global")}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  전체 메뉴
                </button>
                <div className="flex items-center gap-2 px-3 pb-1">
                  <Users className="h-4 w-4 text-[#1a1a1a]/45" />
                  <p className="text-[13px] font-bold text-[#111110]">CRM</p>
                </div>
                {CRM_CHILD_NAV.map((child) => {
                  const childActive = child.match(pathname ?? "")
                  return (
                    <div key={`mobile-${child.href}`}>
                      <Link
                        href={child.href}
                        onClick={() => {
                          warmAdminTab(child.href)
                          setMobileMenuOpen(false)
                        }}
                        className={`flex min-h-11 items-center rounded-md px-3 text-[14px] font-medium transition-colors ${
                          childActive
                            ? "bg-[#111110] text-white"
                            : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                        }`}
                      >
                        {child.label}
                      </Link>
                      {child.href === "/admin/crm/customers/unified" ? (
                        <div className="ml-3 mt-0.5 space-y-px border-l border-[#e8e8e4] pl-3">
                          {CRM_SEGMENTS.map((seg) => {
                            const count = crmSegCounts?.[seg.view]
                            return (
                              <Link
                                key={`mobile-${seg.view}`}
                                href={`/admin/crm/customers/unified?view=${seg.view}`}
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex min-h-9 items-center gap-2 rounded px-3 text-[12px] text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                              >
                                <span className="flex-1 truncate">{seg.label}</span>
                                {count != null ? (
                                  <span className="rounded-full bg-[#f0f0ec] px-1.5 text-[10px] font-semibold tabular-nums text-[#1a1a1a]/55">
                                    {count}
                                  </span>
                                ) : null}
                              </Link>
                            )
                          })}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              groupedNav.map(({ section, items }, groupIndex) => (
              <div key={`mobile-${section}`} className={groupIndex === 0 ? "" : "mt-5 border-t border-[#f0f0ec] pt-4"}>
                {/* home(Overview 단독)은 헤더 없이 최상위에 렌더. */}
                {section !== "home" && (
                  <div className="px-3 pb-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                      {ADMIN_NAV_SECTION_META[section].label}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  {items.map((item) => {
                    const isActive = isNavActive(item.href)

                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        onFocus={() => warmAdminTab(item.href)}
                        onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                        onMouseLeave={cancelWarmAdminTab}
                        onPointerDown={() => warmAdminTab(item.href)}
                        onTouchStart={() => warmAdminTab(item.href)}
                        onClick={() => {
                          warmAdminTab(item.href)
                          if (item.href === "/admin/crm") setNavView("auto")
                          setMobileMenuOpen(false)
                        }}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors ${
                          isActive
                            ? "bg-[#111110] text-white"
                            : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                        }`}
                      >
                        <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                          <item.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                            isActive ? "bg-white/15 text-white/80" : "bg-[#e8e8e4] text-[#1a1a1a]/50"
                          }`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>
              </div>
              ))
            )}
          </nav>

          <div className="border-t border-[#e8e8e4] p-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                void handleLogout()
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-[14px] text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    ) : null}

    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e8e4] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${mobileBottomColumns}, minmax(0, 1fr))` }}>
        {mobilePrimaryNav.map((item) => {
          const isActive = isNavActive(item.href)

          return (
            <Link
              key={`bottom-${item.href}`}
              href={item.href}
              onFocus={() => warmAdminTab(item.href)}
              onMouseEnter={() => scheduleWarmAdminTab(item.href)}
              onMouseLeave={cancelWarmAdminTab}
              onPointerDown={() => warmAdminTab(item.href)}
              onTouchStart={() => warmAdminTab(item.href)}
              onClick={() => warmAdminTab(item.href)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none transition-colors ${
                isActive
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
              }`}
            >
              <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
        >
          <MoreHorizontal className="h-4 w-4 text-[#1a1a1a]/40" />
          <span>More</span>
        </button>
      </div>
    </nav>

    <aside
      className={`relative hidden shrink-0 flex-col border-r border-[#e8e8e4] bg-white lg:flex lg:h-[100dvh] lg:min-h-0 ${
        effectiveCollapsed ? "lg:w-16" : "lg:w-60"
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-[#e8e8e4] py-4 lg:pt-6 lg:pb-4 ${
          effectiveCollapsed ? "flex-col gap-2 px-2" : "gap-1 px-4 sm:px-5"
        }`}
      >
        {!effectiveCollapsed && (
          <div className="flex-1">
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
            <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
          </div>
        )}
        {isDesktop === true ? <AdminNotificationsBell placement="inline" /> : null}
        <button
          onClick={toggle}
          className="rounded-md p-1 text-[#1a1a1a]/30 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
          title={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          {effectiveCollapsed ? <SquareChevronRight className="h-4 w-4" /> : <SquareChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!effectiveCollapsed && (
        <div className="shrink-0 border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-medium text-[#111110]">{name}</p>
          <p className="text-[11px] text-[#1a1a1a]/40">
            {ROLE_LABEL[normalizedRole]}{email ? ` - ${email}` : ""}
          </p>
        </div>
      )}

      <div className={`shrink-0 border-b border-[#e8e8e4] py-3 ${effectiveCollapsed ? "px-2" : "px-4 sm:px-5"}`}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("admin:open-command-palette"))}
          className={`flex items-center rounded-lg border border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/45 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] ${
            effectiveCollapsed ? "mx-auto h-9 w-9 justify-center" : "w-full gap-2 px-2.5 py-2"
          }`}
          title="빠른 이동·검색 (⌘K)"
          aria-label="빠른 이동·검색"
        >
          <Search className="h-4 w-4 shrink-0" />
          {!effectiveCollapsed && (
            <>
              <span className="flex-1 text-left text-[12px]">빠른 이동·검색</span>
              <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/35 shadow-sm">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 ${MINIMAL_SCROLLBAR} ${effectiveCollapsed ? "lg:px-2" : ""}`}>
        {crmDrill ? (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setNavView("global")}
              className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              전체 메뉴
            </button>
            <div className="mb-1 flex items-center gap-2 px-3">
              <Users className="h-4 w-4 text-[#1a1a1a]/45" />
              <p className="text-[13px] font-bold text-[#111110]">CRM</p>
            </div>
            {CRM_CHILD_NAV.map((child) => {
              const childActive = child.match(pathname ?? "")
              return (
                <div key={child.href}>
                  <Link
                    href={child.href}
                    onMouseEnter={() => scheduleWarmAdminTab(child.href)}
                    onClick={() => warmAdminTab(child.href)}
                    className={`flex items-center rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      childActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    {child.label}
                  </Link>
                  {child.href === "/admin/crm/customers/unified" ? (
                    <div className="mb-1 ml-3 mt-0.5 space-y-px border-l border-[#e8e8e4] pl-2.5">
                      {CRM_SEGMENTS.map((seg) => {
                        const count = crmSegCounts?.[seg.view]
                        return (
                          <Link
                            key={seg.view}
                            href={`/admin/crm/customers/unified?view=${seg.view}`}
                            className="flex items-center gap-2 rounded px-2.5 py-1 text-[11px] text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                          >
                            <span className="flex-1 truncate">{seg.label}</span>
                            {count != null ? (
                              <span className="rounded-full bg-[#f0f0ec] px-1.5 text-[10px] font-semibold tabular-nums text-[#1a1a1a]/55">
                                {count}
                              </span>
                            ) : null}
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          groupedNav.map(({ section, items }, groupIndex) => (
          <div key={section} className={groupIndex === 0 ? "" : "mt-5 border-t border-[#f0f0ec] pt-4"}>
            {/* home(Overview 단독)은 헤더 없이 최상위에 렌더. 나머지 섹션은 라벨만(부제 미표시). */}
            {!effectiveCollapsed && section !== "home" && (
              <div className="px-3 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                  {ADMIN_NAV_SECTION_META[section].label}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = isNavActive(item.href)

                const linkEl = (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={effectiveCollapsed ? item.label : undefined}
                    onFocus={() => warmAdminTab(item.href)}
                    onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                    onMouseLeave={cancelWarmAdminTab}
                    onPointerDown={() => warmAdminTab(item.href)}
                    onTouchStart={() => warmAdminTab(item.href)}
                    onClick={() => {
                      warmAdminTab(item.href)
                      if (item.href === "/admin/crm") setNavView("auto")
                    }}
                    className={`group flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
                    } ${
                      isActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/40 group-hover:text-[#111110]"}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    {!effectiveCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                            isActive ? "bg-white/15 text-white/80" : "bg-[#e8e8e4] text-[#1a1a1a]/50"
                          }`}>
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                      </>
                    )}
                  </Link>
                )

                return linkEl
              })}
            </div>
          </div>
          ))
        )}
      </nav>

      <div className={`relative shrink-0 pt-3 pb-5 ${effectiveCollapsed ? "px-2 lg:px-2" : "px-3"}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-white to-transparent"
        />
        <button
          onClick={handleLogout}
          title={effectiveCollapsed ? "로그아웃" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg text-[13px] text-[#1a1a1a]/40 transition-colors hover:bg-[#FEF3EE] hover:text-[#B85C33] ${
            effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!effectiveCollapsed && "로그아웃"}
        </button>
      </div>

      {/* 오른쪽 경계선 클릭 토글 — 헤더 아이콘과 별개로 사이드바 가장자리를 눌러도 접힘/펼침.
          nav 스크롤바(우측 4px)를 가로채지 않도록 경계선 바로 바깥 6px 스트립만 클릭 대상으로 둔다. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        title={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        className="group absolute inset-y-0 left-full z-30 flex w-1.5 cursor-pointer items-center justify-center focus:outline-none"
      >
        {/* 경계선 하이라이트 — hover/focus 시 또렷해진다 */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-[#111110]/20 group-focus-visible:bg-[#111110]/30"
        />
        {/* 중앙 손잡이 — hover/focus 시 노출 */}
        <span
          aria-hidden
          className="flex h-9 w-[18px] -translate-x-1/2 items-center justify-center rounded-full border border-[#e8e8e4] bg-white text-[#1a1a1a]/50 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {effectiveCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </span>
      </button>
    </aside>
    </>
  )
}
