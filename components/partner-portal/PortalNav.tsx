"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CalendarDays, LayoutDashboard } from "lucide-react"

const ITEMS = [
  {
    href: "/partner/workspace",
    label: "홈",
    icon: LayoutDashboard,
  },
  {
    href: "/partner/calendar",
    label: "캘린더",
    icon: CalendarDays,
  },
] as const

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav className="inline-flex items-center gap-1 rounded-2xl border border-[#e8e8e4] bg-[#f7f7f5] p-1">
      {ITEMS.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#1a1a1a] text-white shadow-sm"
                : "text-[#1a1a1a]/60 hover:bg-white hover:text-[#1a1a1a]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
