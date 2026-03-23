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
} from "lucide-react"
import type { AdminRole } from "@/lib/admin-auth"

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: AdminRole[]
  badge?: string
}

const NAV: NavItem[] = [
  { href: "/admin/overview",  label: "Overview",   icon: <LayoutDashboard className="w-4 h-4" />, roles: ["admin", "branch"] },
  { href: "/admin/crm",       label: "CRM / 리드",  icon: <Users className="w-4 h-4" />,          roles: ["admin", "branch"] },
  { href: "/admin/branch",    label: "지사 관리",   icon: <Building2 className="w-4 h-4" />,      roles: ["admin", "branch"] },
  { href: "/admin/analytics", label: "Analytics",  icon: <BarChart2 className="w-4 h-4" />,      roles: ["admin", "branch"] },
  { href: "/admin/blog",      label: "콘텐츠",      icon: <FileText className="w-4 h-4" />,       roles: ["admin"] },
  { href: "/admin/users",     label: "회원 관리",   icon: <UserCog className="w-4 h-4" />,        roles: ["admin"] },
  { href: "/admin/settings",  label: "Settings",   icon: <Settings className="w-4 h-4" />,       roles: ["admin"] },
  { href: "/admin/dev",       label: "Dev Mode",   icon: <Code2 className="w-4 h-4" />,          roles: ["admin"], badge: "Beta" },
]

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

  return (
    <aside className="w-56 shrink-0 min-h-screen bg-white border-r border-[#e8e8e4] flex flex-col">
      <div className="px-5 pt-6 pb-4 border-b border-[#e8e8e4]">
        <p className="text-[11px] font-medium text-[#1a1a1a]/30 uppercase tracking-widest mb-0.5">Classin</p>
        <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
      </div>

      <div className="px-5 py-3 border-b border-[#e8e8e4]">
        <p className="text-[12px] font-medium text-[#111110]">{name}</p>
        <p className="text-[11px] text-[#1a1a1a]/40">
          {role === "admin" ? "관리자" : `지사장 · ${branch}`}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleNav.map((item) => {
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#e8e8e4] text-[#1a1a1a]/50 font-normal">
                  {item.badge}
                </span>
              )}
              {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 pb-5">
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
