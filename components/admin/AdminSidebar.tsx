"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  BarChart2,
  FileText,
  Settings,
  Code2,
  Building2,
  UserCog,
  LogOut,
  ChevronRight,
  CalendarDays,
  SquareChevronLeft,
  SquareChevronRight,
  Handshake,
  ClipboardList,
  ScrollText,
  Receipt,
} from "lucide-react"
import { useEffect, useState } from "react"
import { clearAdminSessionStorage } from "@/lib/admin-client"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"

// Supabase 역할 → 메뉴 접근 매핑
type SidebarRole = string

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: SidebarRole[]
  badge?: string
  section?: string  // 섹션 제목 (첫 번째 아이템에만 표시)
}

const PARTNER_ONLY = ["PARTNER"]
const ALL_STAFF    = ["SUPER_ADMIN","ADMIN","EDITOR","VIEWER"]
const STAFF_ADMIN  = ["SUPER_ADMIN","ADMIN"]
const STAFF_EDITOR = ["SUPER_ADMIN","ADMIN","EDITOR"]

const NAV: NavItem[] = [
  // ── 일반 스태프 메뉴 (PARTNER는 보이지 않음) ──
  { href: "/admin/overview",  label: "Overview",   icon: <LayoutDashboard className="w-4 h-4" />, roles: ALL_STAFF },
  { href: "/admin/crm",       label: "CRM / 리드",  icon: <Users className="w-4 h-4" />,          roles: ALL_STAFF },
  { href: "/admin/branch",    label: "지사 관리",   icon: <Building2 className="w-4 h-4" />,      roles: STAFF_ADMIN },
  { href: "/admin/analytics", label: "Analytics",  icon: <BarChart2 className="w-4 h-4" />,      roles: ALL_STAFF },
  { href: "/admin/calendar",  label: "캘린더",      icon: <CalendarDays className="w-4 h-4" />,   roles: ALL_STAFF },
  { href: "/admin/blog",      label: "콘텐츠",      icon: <FileText className="w-4 h-4" />,       roles: STAFF_EDITOR },
  { href: "/admin/marketing", label: "마케팅",      icon: <Users className="w-4 h-4" />,          roles: STAFF_ADMIN },
  { href: "/admin/users",     label: "회원 관리",   icon: <UserCog className="w-4 h-4" />,        roles: STAFF_ADMIN },
  { href: "/admin/settings",  label: "Settings",   icon: <Settings className="w-4 h-4" />,       roles: STAFF_ADMIN },
  { href: "/admin/dev",       label: "Dev Mode",   icon: <Code2 className="w-4 h-4" />,          roles: STAFF_ADMIN, badge: "Beta" },
  // ── 파트너 포털 (PARTNER 포함) ──
  { href: "/admin/partners",  label: "고객사",      icon: <Handshake className="w-4 h-4" />,      roles: [...STAFF_ADMIN, ...PARTNER_ONLY], section: "파트너 포털" },
  { href: "/admin/quotes",    label: "견적서",      icon: <ClipboardList className="w-4 h-4" />, roles: [...STAFF_EDITOR, ...PARTNER_ONLY] },
  { href: "/admin/contracts", label: "계약서",      icon: <ScrollText className="w-4 h-4" />,    roles: [...STAFF_ADMIN, ...PARTNER_ONLY] },
  { href: "/admin/receipts",  label: "영수증",      icon: <Receipt className="w-4 h-4" />,       roles: [...STAFF_ADMIN, ...PARTNER_ONLY] },
]

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "최고 관리자",
  ADMIN: "관리자",
  EDITOR: "에디터",
  VIEWER: "뷰어",
  PARTNER: "파트너",
}

interface Props {
  role: string
  name: string
  email: string
}

const PARTNER_ALLOWED_PATHS = ["/admin/partners", "/admin/quotes", "/admin/contracts", "/admin/receipts"]

export default function AdminSidebar({ role, name, email }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // PARTNER 역할은 파트너 포털 외 접근 차단
  useEffect(() => {
    if (role.toUpperCase() === "PARTNER") {
      const allowed = PARTNER_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
      if (!allowed) router.replace("/admin/partners")
    }
  }, [pathname, role, router])

  useEffect(() => {
    const saved = localStorage.getItem("admin_sidebar_collapsed")
    if (saved === "true") {
      queueMicrotask(() => setCollapsed(true))
    }
  }, [])

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
  }

  const visibleNav = NAV.filter((item) =>
    item.roles.some((r) => r.toLowerCase() === role.toLowerCase())
  )

  return (
    <aside
      className={`shrink-0 min-h-screen bg-white border-r border-[#e8e8e4] flex flex-col transition-all duration-200 ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      {/* 헤더 */}
      <div className={`flex items-center border-b border-[#e8e8e4] ${collapsed ? "justify-center px-2 py-4" : "px-5 pt-6 pb-4"}`}>
        {!collapsed && (
          <div className="flex-1">
            <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">Classin</p>
            <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
          </div>
        )}
        <button
          onClick={toggle}
          className="p-1 rounded-md text-[#1a1a1a]/30 hover:text-[#111110] hover:bg-[#f5f5f2] transition-colors"
          title={collapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          {collapsed ? <SquareChevronRight className="w-4 h-4" /> : <SquareChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* 유저 정보 */}
      {!collapsed && (
        <div className="px-5 py-3 border-b border-[#e8e8e4]">
          <p className="text-[12px] font-medium text-[#111110]">{name}</p>
          <p className="text-[11px] text-[#1a1a1a]/40">
            {ROLE_LABEL[role] ?? role} · {email}
          </p>
        </div>
      )}

      {/* 네비게이션 */}
      <nav className={`flex-1 py-4 space-y-0.5 ${collapsed ? "px-1.5" : "px-3"}`}>
        {visibleNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <div key={item.href}>
              {item.section && !collapsed && (
                <p className="text-[10px] font-semibold text-[#1a1a1a]/25 uppercase tracking-widest px-3 pt-4 pb-1">
                  {item.section}
                </p>
              )}
              {item.section && collapsed && (
                <div className="my-2 border-t border-[#e8e8e4]" />
              )}
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors group ${
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
                } ${
                  isActive
                    ? "bg-[#111110] text-white"
                    : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                }`}
              >
                <span className={`shrink-0 ${isActive ? "text-white" : "text-[#1a1a1a]/40 group-hover:text-[#111110]"}`}>
                  {item.icon}
                </span>
                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e8e8e4] text-[#1a1a1a]/50 font-normal">
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
                  </>
                )}
              </Link>
            </div>
          )
        })}
      </nav>

      {/* 로그아웃 */}
      <div className={`pb-5 ${collapsed ? "px-1.5" : "px-3"}`}>
        <button
          onClick={handleLogout}
          title={collapsed ? "로그아웃" : undefined}
          className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] text-[#1a1a1a]/40 hover:text-red-500 hover:bg-red-50 transition-colors ${
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && "로그아웃"}
        </button>
      </div>
    </aside>
  )
}
