"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { Handshake, LayoutDashboard, Users } from "lucide-react"

type CrmTab = "customers" | "partners" | "partnerPortal" | "partnerCustomers"

const CRM_TABS = [
  {
    key: "customers",
    href: "/admin/crm",
    label: "고객 / 리드",
    description: "문의, 팔로업, 고객 전환",
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: "partners",
    href: "/admin/crm/partners",
    label: "파트너사",
    description: "파트너 계정, 담당 고객, 운영 리스크",
    icon: <Handshake className="h-4 w-4" />,
  },
  {
    key: "partnerPortal",
    href: "/admin/crm/partners/portal",
    label: "포털 대시보드",
    description: "파트너 포털 현황과 우선순위",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: "partnerCustomers",
    href: "/admin/crm/partners/customers",
    label: "포털 고객",
    description: "포털 고객 목록과 상세 로그",
    icon: <Users className="h-4 w-4" />,
  },
] satisfies Array<{
  key: CrmTab
  href: string
  label: string
  description: string
  icon: ReactNode
}>

export default function CrmSubnav({ active }: { active: CrmTab }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {CRM_TABS.map((tab) => {
        const isActive = active === tab.key

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={`flex min-w-[180px] items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
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
