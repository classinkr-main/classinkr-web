"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import {
  Building2,
  CircleDollarSign,
  FileSpreadsheet,
  PhoneCall,
  Target,
  Truck,
  Users,
} from "lucide-react"

import { warmAdminRequestCache } from "@/lib/admin-client"

type CrmSection = "home" | "customers" | "activity" | "deals" | "insights" | "sync"
type DealsSub = "revenue" | "revSheet" | "orders" | "kpi"
type CustomersSub = "unified" | "leads" | "accounts"

// 상단 primary 탭은 글로벌 사이드바(AdminSidebar)의 CRM 확장으로 이전됨.
// CrmSubnav는 컨텍스트 sub-tab(고객·돈흐름 내부)만 본문 상단에 렌더한다.

// Deals 섹션 안에서만 보이는 단계별 보조 탭 (매출→오더·설치→KPI).
const DEALS_SUBTABS = [
  { key: "revenue", href: "/admin/crm/deals", label: "매출", icon: <CircleDollarSign className="h-3.5 w-3.5" /> },
  { key: "revSheet", href: "/admin/crm/deals/rev-sheet", label: "REV 스냅샷", icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
  { key: "orders", href: "/admin/crm/deals/orders", label: "오더·설치", icon: <Truck className="h-3.5 w-3.5" /> },
  { key: "kpi", href: "/admin/crm/deals/kpi", label: "워크스페이스", icon: <Target className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: DealsSub; href: string; label: string; icon: ReactNode }>

// 고객 섹션 보조 탭: 통합 운영 목록 + 원천별 상세 화면.
const CUSTOMERS_SUBTABS = [
  { key: "unified", href: "/admin/crm/customers/unified", label: "통합", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "leads", href: "/admin/crm/customers/leads", label: "리드", icon: <PhoneCall className="h-3.5 w-3.5" /> },
  { key: "accounts", href: "/admin/crm/customers/accounts", label: "원천 고객", icon: <Building2 className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: CustomersSub; href: string; label: string; icon: ReactNode }>

const SUBTAB_WARMUP_REQUESTS: Record<string, string[]> = {
  "/admin/crm/customers/unified": [
    "/api/admin/crm/customers/unified?limit=100&offset=0",
    "/api/admin/crm/owners",
  ],
  "/admin/crm/customers/leads": [
    "/api/admin/leads",
    "/api/admin/leads/activity-summary",
  ],
  "/admin/crm/customers/accounts": ["/api/admin/crm/customers-neo"],
  "/admin/crm/deals": [
    "/api/admin/crm/revenue?months=6",
    "/api/admin/crm/readiness",
  ],
  "/admin/crm/deals/rev-sheet": ["/api/admin/crm/revenue-sheet"],
  "/admin/crm/deals/orders": ["/api/portal/overview?shape=partner"],
  "/admin/crm/deals/kpi": [
    "/api/admin/crm/revenue?months=6",
    "/api/portal/overview?shape=partner",
  ],
}

function warmSubtab(href: string) {
  for (const url of SUBTAB_WARMUP_REQUESTS[href] ?? []) {
    void warmAdminRequestCache(url, { ttlMs: 60_000 })
  }
}

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
  if (pathname === "/admin/crm/activity" || pathname.startsWith("/admin/crm/activity/")) return "activity"
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
  if (pathname.startsWith("/admin/crm/deals/rev-sheet")) return "revSheet"
  if (pathname.startsWith("/admin/crm/deals/orders")) return "orders"
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

  if (!showCustomersSub && !showDealsSub) return null

  return (
    <div className="mb-4">
      {showCustomersSub ? (
        <div className="no-scrollbar -mx-4 mt-3 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">고객</span>
          {CUSTOMERS_SUBTABS.map((sub) => {
            const isActive = customersSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => warmSubtab(sub.href)}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
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
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => warmSubtab(sub.href)}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
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
