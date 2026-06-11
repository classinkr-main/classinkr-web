"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { CircleDollarSign, Handshake, LayoutDashboard, Link2, PhoneCall, Target } from "lucide-react"

type CrmTab = "home" | "partners" | "partnerPortal" | "partnerCustomers" | "matching" | "revenue"

const CRM_TABS = [
  {
    key: "home",
    href: "/admin/crm",
    label: "Neo CRM",
    description: "한국팀 매출·KPI",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: "revenue",
    href: "/admin/crm/revenue",
    label: "견적·매출",
    description: "Quote, Opportunity",
    icon: <CircleDollarSign className="h-4 w-4" />,
  },
  {
    key: "partnerPortal",
    href: "/admin/crm/partners/portal",
    label: "Order·Delivery",
    description: "오더, 설치, 수납",
    icon: <Handshake className="h-4 w-4" />,
  },
  {
    key: "partners",
    href: "/admin/crm/partners",
    label: "KPI 운영",
    description: "계약, 이슈, 팔로업",
    icon: <Target className="h-4 w-4" />,
  },
  {
    key: "partnerCustomers",
    href: "/admin/crm/partners/customers",
    label: "고객·후속",
    description: "고객, 콜, 비짓",
    icon: <PhoneCall className="h-4 w-4" />,
  },
  {
    key: "matching",
    href: "/admin/crm/matching",
    label: "데이터 정합성",
    description: "Neo CRM, 시트 연결",
    icon: <Link2 className="h-4 w-4" />,
  },
] satisfies Array<{
  key: CrmTab
  href: string
  label: string
  description: string
  icon: ReactNode
}>

function resolveActiveTab(pathname: string | null): CrmTab | null {
  if (!pathname) return null
  if (pathname === "/admin/crm/matching" || pathname.startsWith("/admin/crm/matching/")) return "matching"
  if (pathname === "/admin/crm/revenue" || pathname.startsWith("/admin/crm/revenue/")) return "revenue"
  if (pathname === "/admin/crm/partners/portal") return "partnerPortal"
  if (pathname === "/admin/crm/partners/customers") return "partnerCustomers"
  if (pathname.startsWith("/admin/crm/partners")) return "partners"
  if (pathname === "/admin/crm") return "home"
  return null
}

export default function CrmSubnav({ active }: { active?: CrmTab } = {}) {
  const pathname = usePathname()
  const resolved = active ?? resolveActiveTab(pathname)

  return (
    <div className="admin-scroll-snap-x no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 xl:grid-cols-6">
      {CRM_TABS.map((tab) => {
        const isActive = resolved === tab.key

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex min-w-[144px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors sm:min-w-0 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${
              isActive
                ? "border-[#111110] bg-[#111110] text-white"
                : "border-[#e8e8e4] bg-white text-[#111110] hover:border-[#c8c8c4]"
            }`}
          >
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                isActive ? "bg-white/12 text-white" : "bg-[#fafaf8] text-[#1a1a1a]/45"
              }`}
            >
              {tab.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold">{tab.label}</span>
              <span className={`mt-0.5 hidden text-[11px] sm:block ${isActive ? "text-white/60" : "text-[#1a1a1a]/42"}`}>
                {tab.description}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
