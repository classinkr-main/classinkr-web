"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { Building2, LayoutDashboard, ListChecks, Users } from "lucide-react"

type CrmTab = "customers" | "partners" | "partnerPortal" | "partnerCustomers"

const CRM_TABS = [
  {
    key: "customers",
    href: "/admin/crm",
    label: "리드 관리",
    description: "문의, 팔로업, 전환 관리",
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: "partners",
    href: "/admin/crm/partners",
    label: "처리 큐",
    description: "계약, 설치, 정산, 이슈 우선순위",
    icon: <ListChecks className="h-4 w-4" />,
  },
  {
    key: "partnerPortal",
    href: "/admin/crm/partners/portal",
    label: "거래 현황",
    description: "파이프라인, 일정, 수납 집계",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: "partnerCustomers",
    href: "/admin/crm/partners/customers",
    label: "고객사",
    description: "기관 목록, 상세 정보, 활동 로그",
    icon: <Building2 className="h-4 w-4" />,
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
  if (pathname === "/admin/crm/partners/portal") return "partnerPortal"
  if (pathname === "/admin/crm/partners/customers") return "partnerCustomers"
  if (pathname.startsWith("/admin/crm/partners")) return "partners"
  if (pathname === "/admin/crm" || pathname.startsWith("/admin/crm/")) return "customers"
  return null
}

export default function CrmSubnav({ active }: { active?: CrmTab } = {}) {
  const pathname = usePathname()
  const resolved = active ?? resolveActiveTab(pathname)

  return (
    <div className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {CRM_TABS.map((tab) => {
        const isActive = resolved === tab.key

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex min-w-[176px] shrink-0 items-center gap-3 rounded-xl border px-3 py-3 transition-colors sm:min-w-[180px] sm:rounded-2xl sm:px-4 ${
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
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">{tab.label}</span>
              <span className={`mt-0.5 block text-[11px] ${isActive ? "text-white/60" : "text-[#1a1a1a]/42"}`}>
                {tab.description}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}
