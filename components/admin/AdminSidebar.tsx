"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import {
  BarChart2,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Code2,
  FileText,
  Globe,
  Handshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Settings,
  SquareChevronLeft,
  SquareChevronRight,
  Ticket,
  UserCog,
  Users,
} from "lucide-react"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

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
  { href: "/admin/crm", label: "CRM / 리드", icon: <Users className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
  { href: "/admin/calendar", label: "캘린더", icon: <CalendarDays className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "workspace" },
  { href: "/admin/partners", label: "파트너 운영", icon: <Handshake className="h-4 w-4" />, roles: STAFF_ADMIN, section: "workspace" },
  { href: "/admin/software-quote-codes", label: "SW 견적 코드", icon: <Ticket className="h-4 w-4" />, roles: STAFF_ADMIN, section: "workspace" },
  { href: "/admin/campaigns", label: "캠페인", icon: <Megaphone className="h-4 w-4" />, roles: STAFF_ADMIN, section: "growth" },
  { href: "/admin/blog", label: "콘텐츠", icon: <FileText className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth" },
  { href: "/admin/events", label: "공개 행사", icon: <Globe className="h-4 w-4" />, roles: STAFF_ADMIN, section: "growth" },
  { href: "/admin/docs", label: "문서 센터", icon: <BookOpen className="h-4 w-4" />, roles: STAFF_EDITOR, section: "growth" },
  { href: "/admin/analytics", label: "Analytics", icon: <BarChart2 className="h-4 w-4" />, roles: [...ALL_STAFF, "BRANCH"], section: "performance" },
  { href: "/admin/branch", label: "지사 관리", icon: <Building2 className="h-4 w-4" />, roles: [...STAFF_ADMIN, "BRANCH"], section: "performance" },
  { href: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system" },
  { href: "/admin/users", label: "회원 관리", icon: <UserCog className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system" },
  { href: "/admin/dev", label: "Dev Mode", icon: <Code2 className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system", badge: "Beta" },
  // 파트너 포털 (외부)
  { href: "/partner", label: "파트너 포털", icon: <ClipboardList className="h-4 w-4" />, roles: STAFF_ADMIN, section: "system" },
]

const SECTION_META: Record<SidebarSection, { label: string; description: string }> = {
  workspace: { label: "운영", description: "매일 가장 자주 쓰는 화면" },
  growth: { label: "성장", description: "캠페인과 콘텐츠 운영" },
  performance: { label: "분석", description: "성과와 지점 운영 확인" },
  system: { label: "시스템", description: "권한, 설정, 개발 도구" },
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_collapsed") === "true"
  })
  const [isDesktop, setIsDesktop] = useState(false)

  // PARTNER 역할은 별도 포털로 이동
  useEffect(() => {
    if (role.toUpperCase() === "PARTNER") {
      router.replace("/partner/workspace")
    }
  }, [pathname, role, router])

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
  const visibleNav = NAV.filter((item) => item.roles.includes(normalizedRole))
  const groupedNav = (Object.keys(SECTION_META) as SidebarSection[]).map((section) => ({
    section,
    items: visibleNav.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0)

  return (
    <aside
      className={`flex w-full shrink-0 flex-col border-b border-[#e8e8e4] bg-white lg:sticky lg:top-0 lg:min-h-screen lg:border-r lg:border-b-0 ${
        effectiveCollapsed ? "lg:w-16" : "lg:w-60"
      }`}
    >
      <div className="flex items-center border-b border-[#e8e8e4] px-4 py-4 sm:px-5 lg:pt-6 lg:pb-4">
        {!effectiveCollapsed && (
          <div className="flex-1">
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
            <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
          </div>
        )}
        <button
          onClick={toggle}
          className={`rounded-md p-1 text-[#1a1a1a]/30 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] ${
            effectiveCollapsed ? "ml-0 lg:mx-auto" : "ml-auto"
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
            {ROLE_LABEL[normalizedRole]}{email ? ` · ${email}` : ""}
          </p>
        </div>
      )}

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
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={effectiveCollapsed ? item.label : undefined}
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
  )
}
