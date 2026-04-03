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
  Handshake,
  Megaphone,
} from "lucide-react"
import type { AdminRole } from "@/lib/admin-auth"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: AdminRole[]
  section: "workspace" | "performance" | "system"
  badge?: string
}

const NAV: NavItem[] = [
  { href: "/admin/overview",  label: "Overview",   icon: <LayoutDashboard className="w-4 h-4" />, roles: ["admin", "branch"], section: "workspace" },
  { href: "/admin/crm",       label: "CRM / 리드",  icon: <Users className="w-4 h-4" />,          roles: ["admin", "branch"], section: "workspace" },
  { href: "/admin/campaigns", label: "캠페인",      icon: <Megaphone className="w-4 h-4" />,       roles: ["admin"], section: "workspace" },
  { href: "/admin/partners",  label: "파트너 운영", icon: <Handshake className="w-4 h-4" />,      roles: ["admin"], section: "workspace" },
  { href: "/admin/calendar",  label: "캘린더",      icon: <CalendarDays className="w-4 h-4" />,   roles: ["admin", "branch"], section: "workspace" },
  { href: "/admin/blog",      label: "콘텐츠",      icon: <FileText className="w-4 h-4" />,       roles: ["admin"], section: "workspace" },
  { href: "/admin/branch",    label: "지사 관리",   icon: <Building2 className="w-4 h-4" />,      roles: ["admin", "branch"], section: "performance" },
  { href: "/admin/analytics", label: "Analytics",  icon: <BarChart2 className="w-4 h-4" />,      roles: ["admin", "branch"], section: "performance" },
  { href: "/admin/users",     label: "회원 관리",   icon: <UserCog className="w-4 h-4" />,        roles: ["admin"], section: "system" },
  { href: "/admin/settings",  label: "Settings",   icon: <Settings className="w-4 h-4" />,       roles: ["admin"], section: "system" },
  { href: "/admin/dev",       label: "Dev Mode",   icon: <Code2 className="w-4 h-4" />,          roles: ["admin"], section: "system", badge: "Beta" },
]

const SECTION_META: Record<NavItem["section"], { label: string; description: string }> = {
  workspace: { label: "운영", description: "매일 가장 자주 쓰는 화면" },
  performance: { label: "분석", description: "성과와 지점 운영 확인" },
  system: { label: "시스템", description: "권한, 설정, 개발 도구" },
}

interface Props {
  role: AdminRole
  name: string
  branch?: string
}

export default function AdminSidebar({ role, name, branch }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" })
    sessionStorage.clear()
    router.replace("/admin/login")
  }

  const visibleNav = NAV.filter((item) => item.roles.includes(role))
  const groupedNav = (Object.keys(SECTION_META) as NavItem["section"][]).map((section) => ({
    section,
    items: visibleNav.filter((item) => item.section === section),
  })).filter((group) => group.items.length > 0)

  return (
    <aside className="w-full shrink-0 border-b border-[#e8e8e4] bg-white flex flex-col lg:w-56 lg:min-h-screen lg:border-b-0 lg:border-r">
      <div className="px-4 pt-6 pb-4 border-b border-[#e8e8e4] sm:px-5">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">Classin</p>
        <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
      </div>

      <div className="px-4 py-3 border-b border-[#e8e8e4] sm:px-5">
        <p className="text-[12px] font-medium text-[#111110]">{name}</p>
        <p className="text-[11px] text-[#1a1a1a]/40">
          {role === "admin" ? "관리자" : `지사장 · ${branch}`}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 lg:overflow-y-auto">
        {groupedNav.map(({ section, items }, groupIndex) => (
          <div key={section} className={groupIndex === 0 ? "" : "mt-5 pt-4 border-t border-[#f0f0ec]"}>
            <div className="px-3 pb-2">
              <p className="text-[10px] font-semibold text-[#1a1a1a]/28 uppercase tracking-[0.16em]">
                {SECTION_META[section].label}
              </p>
              <p className="mt-1 hidden text-[11px] text-[#1a1a1a]/32 sm:block">
                {SECTION_META[section].description}
              </p>
            </div>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors group ${
                      isActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/40 group-hover:text-[#111110]"}>
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal ${
                        isActive ? "bg-white/15 text-white/80" : "bg-[#e8e8e4] text-[#1a1a1a]/50"
                      }`}>
                        {item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <div className="rounded-xl border border-[#e8e8e4] bg-[#fafaf8] px-3 py-3 mb-3">
          <p className="text-[11px] font-medium text-[#111110]">오늘 빠른 이동</p>
          <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-1">
            {visibleNav.slice(0, 3).map((item) => (
              <Link
                key={`quick-${item.href}`}
                href={item.href}
                className="inline-flex shrink-0 items-center rounded-md bg-white px-2 py-1 text-[11px] text-[#1a1a1a]/55 border border-[#e8e8e4] hover:text-[#111110] hover:border-[#c8c8c4] transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#1a1a1a]/40 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
