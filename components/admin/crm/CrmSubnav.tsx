"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { BarChart3, Building2, CircleDollarSign, Handshake, LayoutDashboard, Link2, PhoneCall, Target, Users } from "lucide-react"

type CrmSection = "home" | "customers" | "deals" | "insights" | "sync"
type DealsSub = "revenue" | "orders" | "kpi"
type CustomersSub = "unified" | "leads" | "accounts"

// 한국팀 일상 동선: 현황(아침 점검) → 고객(콜·비짓) → Deals(견적→수납). 연동은 유지보수.
const PRIMARY_TABS = [
  {
    key: "home",
    href: "/admin/crm",
    label: "현황",
    description: "오늘 할 일",
    icon: <LayoutDashboard className="h-4 w-4" />,
  },
  {
    key: "customers",
    href: "/admin/crm/customers/unified",
    label: "고객",
    description: "통합 DB",
    icon: <PhoneCall className="h-4 w-4" />,
  },
  {
    key: "deals",
    href: "/admin/crm/deals",
    label: "돈흐름",
    description: "견적 → 수납",
    icon: <CircleDollarSign className="h-4 w-4" />,
  },
  {
    key: "insights",
    href: "/admin/crm/insights",
    label: "인사이트",
    description: "리스크·기회",
    icon: <BarChart3 className="h-4 w-4" />,
  },
] satisfies Array<{
  key: Exclude<CrmSection, "sync">
  href: string
  label: string
  description: string
  icon: ReactNode
}>

// 유지보수 전용 — 일상 동선에서 분리해 흐리게 노출.
const MAINTENANCE_TAB = {
  key: "sync",
  href: "/admin/crm/matching",
  label: "연동",
  description: "시트·CRM 동기화",
  icon: <Link2 className="h-4 w-4" />,
} satisfies {
  key: "sync"
  href: string
  label: string
  description: string
  icon: ReactNode
}

// Deals 섹션 안에서만 보이는 단계별 보조 탭 (견적→오더·설치→KPI).
const DEALS_SUBTABS = [
  { key: "revenue", href: "/admin/crm/deals", label: "매출", icon: <CircleDollarSign className="h-3.5 w-3.5" /> },
  { key: "orders", href: "/admin/crm/deals/orders", label: "오더·설치", icon: <Handshake className="h-3.5 w-3.5" /> },
  { key: "kpi", href: "/admin/crm/deals/kpi", label: "KPI", icon: <Target className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: DealsSub; href: string; label: string; icon: ReactNode }>

// 고객 섹션 보조 탭: 통합 운영 목록 + 원천별 상세 화면.
const CUSTOMERS_SUBTABS = [
  { key: "unified", href: "/admin/crm/customers/unified", label: "통합", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "leads", href: "/admin/crm/customers/leads", label: "리드", icon: <PhoneCall className="h-3.5 w-3.5" /> },
  { key: "accounts", href: "/admin/crm/customers/accounts", label: "원천 고객", icon: <Building2 className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: CustomersSub; href: string; label: string; icon: ReactNode }>

function resolveSection(pathname: string | null): CrmSection | null {
  if (!pathname) return null
  if (pathname === "/admin/crm/matching" || pathname.startsWith("/admin/crm/matching/")) return "sync"
  if (
    pathname === "/admin/crm/customers" ||
    pathname.startsWith("/admin/crm/customers/") ||
    pathname === "/admin/crm/partners/customers" ||
    pathname.startsWith("/admin/crm/partners/customers/")
  )
    return "customers"
  if (
    pathname === "/admin/crm/deals" ||
    pathname.startsWith("/admin/crm/deals/") ||
    pathname === "/admin/crm/revenue" ||
    pathname.startsWith("/admin/crm/revenue/") ||
    pathname.startsWith("/admin/crm/partners")
  )
    return "deals"
  if (pathname === "/admin/crm/insights" || pathname.startsWith("/admin/crm/insights/")) return "insights"
  if (pathname === "/admin/crm") return "home"
  return null
}

function resolveCustomersSub(pathname: string | null): CustomersSub | null {
  if (!pathname) return null
  if (pathname === "/admin/crm/customers" || pathname.startsWith("/admin/crm/customers/unified")) return "unified"
  if (pathname.startsWith("/admin/crm/customers/leads")) return "leads"
  if (
    pathname.startsWith("/admin/crm/customers/accounts") ||
    pathname.startsWith("/admin/crm/partners/customers")
  )
    return "accounts"
  return null
}

function resolveDealsSub(pathname: string | null): DealsSub | null {
  if (!pathname) return null
  if (pathname.startsWith("/admin/crm/deals/orders") || pathname === "/admin/crm/partners/portal") return "orders"
  if (pathname.startsWith("/admin/crm/deals/kpi") || pathname.startsWith("/admin/crm/partners")) return "kpi"
  if (
    pathname === "/admin/crm/deals" ||
    pathname.startsWith("/admin/crm/deals/") ||
    pathname === "/admin/crm/revenue" ||
    pathname.startsWith("/admin/crm/revenue/")
  )
    return "revenue"
  return null
}

export default function CrmSubnav({ active }: { active?: CrmSection } = {}) {
  const pathname = usePathname()
  const section = active ?? resolveSection(pathname)
  const dealsSub = section === "deals" ? resolveDealsSub(pathname) : null
  const customersSub = section === "customers" ? resolveCustomersSub(pathname) : null
  const showDealsSub = section === "deals"
  const showCustomersSub = section === "customers"

  return (
    <div className={showDealsSub || showCustomersSub ? "mb-4" : "mb-6"}>
      <div className="admin-scroll-snap-x no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-5">
        {PRIMARY_TABS.map((tab) => {
          const isActive = section === tab.key

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
                <span
                  className={`mt-0.5 hidden text-[11px] sm:block ${isActive ? "text-white/60" : "text-[#1a1a1a]/42"}`}
                >
                  {tab.description}
                </span>
              </span>
            </Link>
          )
        })}

        {/* 유지보수 탭: dashed ghost 스타일로 일상 운영 탭과 시각적으로 분리 */}
        <Link
          href={MAINTENANCE_TAB.href}
          className={`flex min-w-[144px] shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors sm:min-w-0 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3 ${
            section === "sync"
              ? "border-[#111110] bg-[#111110] text-white"
              : "border-dashed border-[#dcdcd6] bg-transparent text-[#1a1a1a]/55 hover:border-[#c8c8c4]"
          }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              section === "sync" ? "bg-white/12 text-white" : "bg-[#fafaf8] text-[#1a1a1a]/40"
            }`}
          >
            {MAINTENANCE_TAB.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold">{MAINTENANCE_TAB.label}</span>
            <span
              className={`mt-0.5 hidden text-[11px] sm:block ${
                section === "sync" ? "text-white/60" : "text-[#1a1a1a]/38"
              }`}
            >
              {MAINTENANCE_TAB.description}
            </span>
          </span>
        </Link>
      </div>

      {showCustomersSub ? (
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">고객</span>
          {CUSTOMERS_SUBTABS.map((sub) => {
            const isActive = customersSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "border-[#111110] bg-[#111110] text-white"
                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/70 hover:border-[#c8c8c4]"
                }`}
              >
                <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>{sub.icon}</span>
                {sub.label}
              </Link>
            )
          })}
        </div>
      ) : null}

      {showDealsSub ? (
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">돈흐름</span>
          {DEALS_SUBTABS.map((sub) => {
            const isActive = dealsSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                  isActive
                    ? "border-[#111110] bg-[#111110] text-white"
                    : "border-[#e8e8e4] bg-white text-[#1a1a1a]/70 hover:border-[#c8c8c4]"
                }`}
              >
                <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>{sub.icon}</span>
                {sub.label}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
