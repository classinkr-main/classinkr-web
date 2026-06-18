"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BarChart2,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  Code2,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  Magnet,
  Menu,
  Megaphone,
  MessageSquare,
  MoreHorizontal,
  Search,
  Settings,
  SquareChevronLeft,
  SquareChevronRight,
  UserCog,
  Users,
  X,
} from "lucide-react"
import { clearAdminSessionStorage, warmAdminRequestCache } from "@/lib/admin-client"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import AdminNotificationsBell from "./AdminNotificationsBell"

type SidebarRole = "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER" | "BRANCH" | "PARTNER"
type SidebarSection = "workspace" | "growth" | "performance" | "system"

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  roles: SidebarRole[]
  section: SidebarSection
  badge?: string
}

const ALL_STAFF: SidebarRole[]    = ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER"]
const STAFF_ADMIN: SidebarRole[]  = ["SUPER_ADMIN", "ADMIN"]
const STAFF_EDITOR: SidebarRole[] = ["SUPER_ADMIN", "ADMIN", "EDITOR"]

const NAV: NavItem[] = [
  { href: "/admin/overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
  { href: "/admin/crm", label: "CRM", icon: <Users className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
  { href: "/admin/channel-talk", label: "채널톡 상담", icon: <MessageSquare className="h-4 w-4" />, roles: STAFF_ADMIN, section: "workspace", badge: "New" },
  { href: "/admin/calendar", label: "캘린더", icon: <CalendarDays className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
  { href: "/admin/quotes", label: "견적·문서", icon: <FileText className="h-4 w-4" />, roles: STAFF_ADMIN, section: "workspace" },
  { href: "/admin/campaigns", label: "캠페인", icon: <Megaphone className="h-4 w-4" />, roles: STAFF_ADMIN, section: "growth" },
  { href: "/admin/blog", label: "콘텐츠", icon: <FileText className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth" },
  { href: "/admin/lead-magnets", label: "리드마그넷", icon: <Magnet className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth", badge: "Preview" },
  { href: "/admin/events", label: "공개 행사", icon: <Globe className="h-4 w-4" />, roles: STAFF_ADMIN, section: "growth" },
  { href: "/admin/docs", label: "가이드 문서", icon: <BookOpen className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth" },
  { href: "/admin/docs/gaps", label: "문서 보강 큐", icon: <Search className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth", badge: "Alpha" },
  { href: "/admin/branch", label: "KR Team", icon: <Building2 className="h-4 w-4" />, roles: [...STAFF_ADMIN, "BRANCH"], section: "performance" },
  { href: "/admin/analytics", label: "Analytics", icon: <BarChart2 className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "performance" },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system" },
  { href: "/admin/users", label: "회원 관리", icon: <UserCog className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system" },
  { href: "/admin/dev", label: "Dev Mode", icon: <Code2 className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system", badge: "Beta" },
]

const NAV_WARMUP_REQUESTS: Record<string, string[]> = {
  "/admin/overview": [
    // overview 페이지가 실제 호출하는 URL과 캐시 키를 맞춰야 hover-warm이 적중한다.
    "/api/admin/leads?scope=dashboard",
    "/api/admin/subscribers?count=1",
    "/api/admin/blog",
    "/api/admin/email",
    "/api/admin/calendar",
    "/api/admin/settings",
    "/api/admin/bugs",
    "/api/admin/patch-notes",
  ],
  "/admin/crm": [
    "/api/admin/crm/action-kpis",
    "/api/admin/crm/overview",
    "/api/admin/crm/neo?granularity=month&offset=0",
  ],
  "/admin/channel-talk": ["/api/admin/channel-talk", "/api/admin/channel-talk/mine"],
  "/admin/calendar": ["/api/admin/calendar"],
  "/admin/quotes": ["/api/admin/quotes"],
  "/admin/campaigns": [
    "/api/admin/email",
    "/api/admin/subscribers",
    "/api/admin/events",
    "/api/admin/event-metrics",
    "/api/admin/meta/campaigns?datePreset=last_30d&limit=50",
  ],
  "/admin/blog": ["/api/admin/blog", "/api/admin/blog?trash=1"],
  "/admin/events": ["/api/admin/events"],
  "/admin/docs": ["/api/admin/docs", "/api/admin/docs/analytics?days=30"],
  "/admin/docs/gaps": ["/api/admin/docs/alpha-readiness", "/api/admin/docs/gaps"],
  "/admin/branch": [
    "/api/admin/branch/summary?team=ALL&period=Q",
    "/api/admin/branch/kpi?team=ALL&period=Q",
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
  "/admin/settings": ["/api/admin/settings"],
  "/admin/users": ["/api/admin/users"],
  "/admin/dev": ["/api/admin/roadmap", "/api/admin/bugs", "/api/admin/patch-notes"],
}

const SECTION_META: Record<SidebarSection, { label: string; description: string }> = {
  workspace: { label: "운영", description: "팀 현황과 세일즈 진행 관리" },
  growth: { label: "성장", description: "캠페인, 콘텐츠, 전환 관리" },
  performance: { label: "분석", description: "성과, 매출, 지점 운영 확인" },
  system: { label: "시스템", description: "권한, 설정, 감사, 개발 도구" },
}

const ROLE_LABEL: Record<SidebarRole, string> = {
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

function normalizeRole(role: string): SidebarRole {
  const normalized = role.trim()

  if (normalized === "admin" || normalized === "ADMIN") return "ADMIN"
  if (normalized === "branch" || normalized === "BRANCH") return "BRANCH"
  if (normalized === "partner" || normalized === "PARTNER") return "PARTNER"
  if (normalized === "SUPER_ADMIN") return "SUPER_ADMIN"
  if (normalized === "EDITOR") return "EDITOR"
  if (normalized === "VIEWER") return "VIEWER"

  return "ADMIN"
}

export default function AdminSidebar({ role, name, email }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const prefetchedHrefs = useRef(new Set<string>())
  const warmedHrefs = useRef(new Set<string>())
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_collapsed") === "true"
  })
  const [isDesktop, setIsDesktop] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(media.matches)

    update()
    media.addEventListener("change", update)

    return () => media.removeEventListener("change", update)
  }, [])

  const effectiveCollapsed = isDesktop && collapsed

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

    await fetch("/api/admin/auth", { method: "DELETE" }).catch(() => null)

    router.replace("/admin/login")
    router.refresh()
  }

  const normalizedRole = normalizeRole(role)
  const visibleNav = useMemo(
    () => NAV.filter((item) => item.roles.includes(normalizedRole)),
    [normalizedRole]
  )
  const isNavActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const currentNavItem = visibleNav.find((item) => isNavActive(item.href)) ?? visibleNav[0]
  const mobilePrimaryNav = visibleNav
    .filter((item) => item.section === "workspace")
    .slice(0, 4)
  const mobileBottomColumns = Math.min(mobilePrimaryNav.length + 1, 5)
  const groupedNav = (Object.keys(SECTION_META) as SidebarSection[]).map((section) => ({
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

    for (const url of NAV_WARMUP_REQUESTS[href] ?? []) {
      void warmAdminRequestCache(url, { ttlMs: 60_000 })
    }
  }, [prefetchAdminRoute])

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
      {!isDesktop ? <AdminNotificationsBell placement="inline" /> : null}
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

          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
            {groupedNav.map(({ section, items }, groupIndex) => (
              <div key={`mobile-${section}`} className={groupIndex === 0 ? "" : "mt-5 border-t border-[#f0f0ec] pt-4"}>
                <div className="px-3 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                    {SECTION_META[section].label}
                  </p>
                </div>
                <div className="space-y-1">
                  {items.map((item) => {
                    const isActive = isNavActive(item.href)

                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        onFocus={() => warmAdminTab(item.href)}
                        onMouseEnter={() => warmAdminTab(item.href)}
                        onTouchStart={() => warmAdminTab(item.href)}
                        onClick={() => {
                          warmAdminTab(item.href)
                          setMobileMenuOpen(false)
                        }}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors ${
                          isActive
                            ? "bg-[#111110] text-white"
                            : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                        }`}
                      >
                        <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                          {item.icon}
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
            ))}
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
              onMouseEnter={() => warmAdminTab(item.href)}
              onTouchStart={() => warmAdminTab(item.href)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none transition-colors ${
                isActive
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
              }`}
            >
              <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                {item.icon}
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
      className={`hidden shrink-0 flex-col border-r border-[#e8e8e4] bg-white lg:sticky lg:top-0 lg:flex lg:min-h-screen ${
        effectiveCollapsed ? "lg:w-16" : "lg:w-60"
      }`}
    >
      <div className="flex items-center gap-1 border-b border-[#e8e8e4] px-4 py-4 sm:px-5 lg:pt-6 lg:pb-4">
        {!effectiveCollapsed && (
          <div className="flex-1">
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
            <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
          </div>
        )}
        {isDesktop ? <AdminNotificationsBell placement="inline" /> : null}
        <button
          onClick={toggle}
          className={`rounded-md p-1 text-[#1a1a1a]/30 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] ${
            effectiveCollapsed ? "lg:mx-auto" : ""
          }`}
          title={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          {effectiveCollapsed ? <SquareChevronRight className="h-4 w-4" /> : <SquareChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!effectiveCollapsed && (
        <div className="border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-medium text-[#111110]">{name}</p>
          <p className="text-[11px] text-[#1a1a1a]/40">
            {ROLE_LABEL[normalizedRole]}{email ? ` - ${email}` : ""}
          </p>
        </div>
      )}

      <div className={`border-b border-[#e8e8e4] py-3 ${effectiveCollapsed ? "px-2" : "px-4 sm:px-5"}`}>
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

      <nav className={`flex-1 px-3 py-4 lg:overflow-y-auto ${effectiveCollapsed ? "lg:px-2" : ""}`}>
        {groupedNav.map(({ section, items }, groupIndex) => (
          <div key={section} className={groupIndex === 0 ? "" : "mt-5 border-t border-[#f0f0ec] pt-4"}>
            {!effectiveCollapsed && (
              <div className="px-3 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                  {SECTION_META[section].label}
                </p>
                <p className="mt-1 hidden text-[11px] text-[#1a1a1a]/32 sm:block">
                  {SECTION_META[section].description}
                </p>
              </div>
            )}
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = isNavActive(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={effectiveCollapsed ? item.label : undefined}
                    onFocus={() => warmAdminTab(item.href)}
                    onMouseEnter={() => warmAdminTab(item.href)}
                    onTouchStart={() => warmAdminTab(item.href)}
                    className={`group flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
                    } ${
                      isActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/40 group-hover:text-[#111110]"}>
                      {item.icon}
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
              })}
            </div>
          </div>
        ))}
      </nav>

      {!effectiveCollapsed && (
        <div className="px-3 pb-3">
          <div className="mb-3 rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-3">
            <p className="text-[11px] font-medium text-[#111110]">오늘 빠른 이동</p>
            <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
              {visibleNav.slice(0, 3).map((item) => (
                <Link
                  key={`quick-${item.href}`}
                  href={item.href}
                  onFocus={() => warmAdminTab(item.href)}
                  onMouseEnter={() => warmAdminTab(item.href)}
                  onTouchStart={() => warmAdminTab(item.href)}
                  className="inline-flex shrink-0 items-center rounded-md border border-[#e8e8e4] bg-white px-2 py-1 text-[11px] text-[#1a1a1a]/55 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`pb-5 ${effectiveCollapsed ? "px-2 lg:px-2" : "px-3"}`}>
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
    </aside>
    </>
  )
}
