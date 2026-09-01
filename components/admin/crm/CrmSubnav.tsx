"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import {
  Building2,
  CircleDollarSign,
  FileSpreadsheet,
  MapPinned,
  PhoneCall,
  Target,
  Truck,
  Users,
} from "lucide-react"

import { warmAdminRequestCache } from "@/lib/admin-client"
import { CRM_CHILD_NAV } from "@/components/admin/admin-nav"
import { NAV_WARMUP_REQUESTS } from "@/components/admin/AdminSidebar"

type CrmSection = "home" | "customers" | "activity" | "deals" | "insights" | "sync"
type DealsSub = "revenue" | "revSheet" | "orders" | "kpi"
type CustomersSub = "unified" | "leads" | "accounts" | "map"

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
  { key: "map", href: "/admin/crm/customers/map", label: "지도", icon: <MapPinned className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: CustomersSub; href: string; label: string; icon: ReactNode }>

// 예열 표는 NAV_WARMUP_REQUESTS(SSOT) 하나다 — 여기 사본을 두던 시절에는 같은 URL이 두 파일에
// 복제되고 사이드바 쪽 CRM 하위 키는 아무도 조회하지 않는 사문으로 남았다.
// 항목이 {url, cacheKey} 형태일 수 있다(캐시 키가 URL과 다른 소비처).
function warmSubtab(href: string) {
  const entry = NAV_WARMUP_REQUESTS[href]
  const entries = typeof entry === "function" ? entry() : entry ?? []
  for (const item of entries) {
    const url = typeof item === "string" ? item : item.url
    const cacheKey = typeof item === "string" ? undefined : item.cacheKey
    void warmAdminRequestCache(url, { ttlMs: 60_000, cacheKey })
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
  if (pathname.startsWith("/admin/crm/customers/map")) return "map"
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

  // 1차 탭은 조건부일 수 없다 — CRM 하위 9개 화면 중 5개(현황·기록·입력함·검수·인사이트)는
  // 지금까지 사이드바 드릴인이 유일한 내비였고, 여기서 null 을 뱉으면 그 화면들의 내비가 0이 된다.
  return (
    <div className="pt-3">
      {/* 1차 — CRM 하위 5개. 정본은 admin-nav.ts(CRM_CHILD_NAV)라 ⌘K 팔레트와 같은 표를 본다. */}
      <nav
        aria-label="CRM 주요 메뉴"
        className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
      >
        {CRM_CHILD_NAV.map((child) => {
          const isActive = child.match(pathname ?? "")
          return (
            <Link
              key={child.href}
              href={child.href}
              aria-current={isActive ? "page" : undefined}
              onFocus={() => warmSubtab(child.href)}
              onMouseEnter={() => warmSubtab(child.href)}
              onPointerDown={() => warmSubtab(child.href)}
              onTouchStart={() => warmSubtab(child.href)}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] sm:min-h-9 ${
                isActive
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
              }`}
            >
              {child.label}
            </Link>
          )
        })}
      </nav>
      {showCustomersSub ? (
        <nav
          aria-label="CRM 고객 메뉴"
          className="no-scrollbar -mx-4 mt-1.5 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">고객</span>
          {CUSTOMERS_SUBTABS.map((sub) => {
            const isActive = customersSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                aria-current={isActive ? "page" : undefined}
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => warmSubtab(sub.href)}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  isActive ? "text-[#084734]" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                }`}
              >
                <span className={isActive ? "text-[#084734]" : "text-[#1a1a1a]/35"}>{sub.icon}</span>
                {sub.label}
                {isActive ? (
                  <span aria-hidden className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[#084734]" />
                ) : null}
              </Link>
            )
          })}
        </nav>
      ) : null}

      {showDealsSub ? (
        <nav
          aria-label="CRM 돈흐름 메뉴"
          className="no-scrollbar -mx-4 mt-1.5 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">돈흐름</span>
          {DEALS_SUBTABS.map((sub) => {
            const isActive = dealsSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                aria-current={isActive ? "page" : undefined}
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => warmSubtab(sub.href)}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  isActive ? "text-[#084734]" : "text-[#1a1a1a]/55 hover:text-[#111110]"
                }`}
              >
                <span className={isActive ? "text-[#084734]" : "text-[#1a1a1a]/35"}>{sub.icon}</span>
                {sub.label}
                {isActive ? (
                  <span aria-hidden className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full bg-[#084734]" />
                ) : null}
              </Link>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
