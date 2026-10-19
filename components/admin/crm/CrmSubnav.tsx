"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
// PrefetchKind는 next/navigation이 재수출하지 않는 런타임 enum이라 내부 경로에서 직접
// 가져온다(AdminSidebar.tsx와 같은 이유 — 값이 필요해 type-only import로는 안 된다).
import { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Building2,
  CircleDollarSign,
  EyeOff,
  FileSpreadsheet,
  Inbox,
  ListChecks,
  ListFilter,
  MapPinned,
  PhoneCall,
  Tag,
  Target,
  Truck,
  Users,
} from "lucide-react"

import { warmAdminRequestCacheQueued } from "@/lib/admin-client"
import {
  CRM_CHILD_NAV,
  CRM_CUSTOMERS_CHILD_NAV,
  type CrmCustomersSubKey,
} from "@/components/admin/admin-nav"
import {
  normalizeNavOverrides,
  resolveCrmSubnavAccess,
  setCrmSubnavOverride,
} from "@/components/admin/admin-nav-access"
import { useAdminNavPreferences } from "@/components/admin/admin-nav-preferences-context"
import { NAV_WARMUP_REQUESTS } from "@/components/admin/AdminSidebar"
import { ADMIN_OPEN_NAV_EDITOR_EVENT, saveMyNavOverrides } from "@/components/admin/my-nav-preferences"

type CrmSection = "home" | "customers" | "activity" | "deals" | "insights" | "sync"
type DealsSub = "revenue" | "revSheet" | "orders" | "kpi"
type CustomersSub = CrmCustomersSubKey
type ReviewSub = "matching" | "insights" | "revSheet"

// 평평한 사이드바 아래에서 CRM의 1차 메뉴와 컨텍스트 하위 메뉴를 함께 제공한다.

// Deals 섹션 안에서만 보이는 단계별 보조 탭 (매출→오더·설치→KPI).
const DEALS_SUBTABS = [
  { key: "revenue", href: "/admin/crm/deals", label: "매출", icon: <CircleDollarSign className="h-3.5 w-3.5" /> },
  // 같은 경로가 검수 보조 탭(REVIEW_SUBTABS)에도 있다 — 두 곳 라벨은 화면 제목(rev-sheet/page.tsx h1)과
  // 같은 "매출시트" 하나로 맞춘다(2026-09-25, 이전엔 여기만 "REV 스냅샷").
  { key: "revSheet", href: "/admin/crm/deals/rev-sheet", label: "매출시트", icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
  { key: "orders", href: "/admin/crm/deals/orders", label: "오더·설치", icon: <Truck className="h-3.5 w-3.5" /> },
  { key: "kpi", href: "/admin/crm/deals/kpi", label: "워크스페이스", icon: <Target className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: DealsSub; href: string; label: string; icon: ReactNode }>

// 고객 섹션 보조 탭: 통합 운영 목록 + 원천별 상세 화면 + 세그먼트 허브.
// 키·href·라벨·순서의 정본은 admin-nav.ts(CRM_CUSTOMERS_CHILD_NAV)다 — 개인 숨김 정규화(순수 모듈)와
// 편집기가 같은 표를 봐야 해서 올렸다. 여기서는 키별 아이콘만 붙인다(satisfies 가 빠진 키를 잡는다).
const CUSTOMERS_SUBTAB_ICONS = {
  unified: <Users className="h-3.5 w-3.5" />,
  leads: <PhoneCall className="h-3.5 w-3.5" />,
  intake: <ListChecks className="h-3.5 w-3.5" />,
  accounts: <Building2 className="h-3.5 w-3.5" />,
  segments: <ListFilter className="h-3.5 w-3.5" />,
  map: <MapPinned className="h-3.5 w-3.5" />,
  tags: <Tag className="h-3.5 w-3.5" />,
} satisfies Record<CustomersSub, ReactNode>

const CUSTOMERS_SUBTABS = CRM_CUSTOMERS_CHILD_NAV.map((sub) => ({
  ...sub,
  icon: CUSTOMERS_SUBTAB_ICONS[sub.key],
}))

// 고객DB 보조 탭 href 는 정본 표(CRM_CUSTOMERS_CHILD_NAV)에서만 읽는다 — 현황·분석 줄의 "지역 분석"도 지도 탭과
// 같은 경로라 사본을 두지 않는다(tests/admin/crm-route-labels.test.ts 사본 금지).
const CUSTOMERS_SUBTAB_HREF = Object.fromEntries(CRM_CUSTOMERS_CHILD_NAV.map((sub) => [sub.key, sub.href])) as Record<
  CustomersSub,
  string
>

// 현황·분석 보조 탭(10월 재구성) — 현황·인사이트 화면에서 업무 현황·전체 분석·지역 분석을 잇는다(인사이트는
// 이제 검수가 아니라 현황 1차 탭에 귀속 — admin-nav.ts CRM_CHILD_NAV).
const ANALYSIS_SUBTABS = [
  { key: "home", href: "/admin/crm", label: "업무 현황" },
  { key: "insights", href: "/admin/crm/insights", label: "전체 분석" },
  { key: "map", href: CUSTOMERS_SUBTAB_HREF.map, label: "지역 분석" },
]

// 검수 섹션 보조 탭(2026-09-07 감사 #9) — admin-nav.ts(CRM_CHILD_NAV, 오케스트레이터 소유)의
// "검수" 1차 탭은 매칭·인사이트·매출시트 3개 라우트를 하나로 묶어 활성 판정하지만
// (match: matching|insights|deals/rev-sheet), 정작 그 탭을 눌러 도착하는 /admin/crm/matching
// 에는 나머지 둘로 가는 하위 탭 바가 없었다 — 인사이트가 상단 내비에서 발견되지 않는다는
// 지적이 그래서였다. 라우트는 이미 존재하므로 여기 서브탭만 추가한다(1차 탭·admin-nav.ts는
// 손대지 않음).
const REVIEW_SUBTABS = [
  { key: "matching", href: "/admin/crm/matching", label: "매칭 인박스", icon: <Inbox className="h-3.5 w-3.5" /> },
  { key: "revSheet", href: "/admin/crm/deals/rev-sheet", label: "매출시트", icon: <FileSpreadsheet className="h-3.5 w-3.5" /> },
] satisfies Array<{ key: ReviewSub; href: string; label: string; icon: ReactNode }>

// 예열 표는 NAV_WARMUP_REQUESTS(SSOT) 하나다 — 여기 사본을 두던 시절에는 같은 URL이 두 파일에
// 복제되고 사이드바 쪽 CRM 하위 키는 아무도 조회하지 않는 사문으로 남았다.
// 항목이 {url, cacheKey} 형태일 수 있다(캐시 키가 URL과 다른 소비처) — warmAdminRequestCacheQueued가
// 두 형태를 그대로 받아 소비 측 캐시 슬롯에 맞춰 데운다.
function resolveSubtabWarmupEntries(href: string) {
  const entry = NAV_WARMUP_REQUESTS[href]
  return typeof entry === "function" ? entry() : entry ?? []
}

// AdminSidebar(warmAdminTab/scheduleWarmAdminTab)와 같은 규약 — hover 180ms 디바운스 + href당
// 1회 예열. admin-client의 inflight 중복 제거가 있어 이게 없어도 네트워크가 중복되지는 않지만,
// 사이드바와 같은 규약으로 맞춰 마우스가 탭 여러 개를 훑고 지나갈 때의 타이머·핸들러 비용을
// 줄인다(§7). 동시성 3 큐(warmAdminRequestCacheQueued)도 사이드바와 동일하게 사용한다.
function useSubtabWarmup() {
  const router = useRouter()
  const warmedHrefs = useRef(new Set<string>())
  const timerRef = useRef<number | null>(null)
  // href당 30초 스로틀(T2, AdminSidebar의 fullPrefetchThrottleRef와 같은 규약) — Next가 신선한
  // FULL 엔트리는 중복 요청을 스스로 스킵하므로 href당 1회로 막지 않고, hover 폭주만 막는다.
  const fullPrefetchThrottleRef = useRef(new Map<string, number>())

  const warm = useCallback((href: string) => {
    // T2 — 이 화면들도 layout.tsx의 force-dynamic을 그대로 물려받는 dynamic 페이지다.
    // hover 완료·focus·pointerdown·touchstart(=이동 의도) 시점에 FULL 프리페치를 태워
    // 서버 왕복(그 화면의 RSC 프리페치 포함)을 클릭 이전으로 앞당긴다 — click은 이 화면에
    // 별도 핸들러가 없어(<Link> 네비게이션이 곧장 처리) 여기서 걸러낼 대상이 없다.
    const now = Date.now()
    const last = fullPrefetchThrottleRef.current.get(href)
    if (last === undefined || now - last >= 30_000) {
      fullPrefetchThrottleRef.current.set(href, now)
      try {
        router.prefetch(href, { kind: PrefetchKind.FULL })
      } catch {
        // Prefetch is an optimization only.
      }
    }

    if (warmedHrefs.current.has(href)) return
    warmedHrefs.current.add(href)
    warmAdminRequestCacheQueued(resolveSubtabWarmupEntries(href), { ttlMs: 60_000 })
  }, [router])

  const scheduleWarm = useCallback((href: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      warm(href)
      timerRef.current = null
    }, 180)
  }, [warm])

  const cancelWarm = useCallback(() => {
    if (timerRef.current === null) return
    window.clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => () => cancelWarm(), [cancelWarm])

  return { warm, scheduleWarm, cancelWarm }
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
  if (pathname.startsWith("/admin/crm/customers/segments")) return "segments"
  if (pathname.startsWith("/admin/crm/customers/leads")) return "leads"
  if (pathname.startsWith("/admin/crm/customers/intake")) return "intake"
  if (pathname.startsWith("/admin/crm/customers/map")) return "map"
  if (pathname.startsWith("/admin/crm/customers/tags")) return "tags"
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

// resolveSection의 "sync"(=/admin/crm/matching)·"insights" 두 섹션 안에서만 쓴다 — deals
// 섹션이 rev-sheet를 자기 서브탭(위 resolveDealsSub)으로도 갖는 이중 소속은 그대로 둔다
// (매출 화면들끼리의 좌우 이동과 "검수 백오피스" 진입로는 서로 다른 목적).
function resolveReviewSub(pathname: string | null): ReviewSub | null {
  if (!pathname) return null
  if (pathname.startsWith("/admin/crm/matching")) return "matching"
  if (pathname.startsWith("/admin/crm/insights")) return "insights"
  if (pathname.startsWith("/admin/crm/deals/rev-sheet")) return "revSheet"
  return null
}

export default function CrmSubnav({ active }: { active?: CrmSection } = {}) {
  const pathname = usePathname()
  const navRef = useRef<HTMLDivElement>(null)
  const { warm: warmSubtab, scheduleWarm: scheduleWarmSubtab, cancelWarm: cancelWarmSubtab } = useSubtabWarmup()
  const section = active ?? resolveSection(pathname)
  const dealsSub = section === "deals" ? resolveDealsSub(pathname) : null
  const showReviewSub = section === "sync"
  const showAnalysisSub = section === "home" || section === "insights"
  const reviewSub = showReviewSub ? resolveReviewSub(pathname) : null
  const customersSub = section === "customers" ? resolveCustomersSub(pathname) : null
  const showDealsSub = section === "deals"
  const showCustomersSub = section === "customers"
  const currentPath = pathname ?? ""

  // 개인 숨김(2026-09-25) — 셸 세션의 nav_overrides(crm: 키)를 admin-nav-access 순수 함수로 판정한다.
  // 숨김은 목록 정리일 뿐이다: 숨긴 탭도 ⌘K·주소·맥락 딥링크로 열리고, 그 화면에 있으면 아래에서
  // 탭을 강제로 보인다. 펼침 상태는 저장하지 않는다(사이드바 "숨긴 탭" 묶음과 같은 규약).
  const { navOverrides, onNavOverridesChange } = useAdminNavPreferences()
  const overrides = useMemo(() => normalizeNavOverrides(navOverrides), [navOverrides])
  const crmAccess = useMemo(() => resolveCrmSubnavAccess(overrides), [overrides])
  const [hiddenOpen, setHiddenOpen] = useState(false)
  const [restoringHref, setRestoringHref] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const hiddenPanelId = useId()
  const hiddenCount = crmAccess.hidden.length

  // 숨긴 탭이라도 지금 그 화면이면 줄에 남긴다 — 빼면 현재 위치가 탭 줄에서 사라진다.
  const primaryTabs = CRM_CHILD_NAV.filter(
    (child) => !crmAccess.hiddenHrefs.has(child.href) || child.match(currentPath)
  )
  const customersTabs = CUSTOMERS_SUBTABS.filter(
    (sub) => !crmAccess.hiddenHrefs.has(sub.href) || customersSub === sub.key
  )

  // "다시 표시" — 본인 경로(PATCH /api/admin/me/nav)로 전체 상태를 저장하고, 서버가 정규화해
  // 돌려준 값을 셸에 반영한다(사이드바 "다시 표시"와 같은 흐름). 숨기기는 편집기에서만 한다.
  const restoreHiddenTab = async (href: string) => {
    setRestoringHref(href)
    setRestoreError(null)
    try {
      const saved = await saveMyNavOverrides(setCrmSubnavOverride(overrides, href, "shown"))
      onNavOverridesChange?.(saved)
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : "다시 표시하지 못했습니다.")
    } finally {
      setRestoringHref(null)
    }
  }

  // 좁은 화면에서 오른쪽 하위 메뉴로 이동해도 현재 위치가 보이도록 가로 스크롤만 조정한다.
  useEffect(() => {
    navRef.current?.querySelectorAll("nav").forEach((nav) => {
      const current = nav.querySelector<HTMLElement>('[aria-current="page"]')
      if (!current) return
      const bounds = nav.getBoundingClientRect()
      const itemBounds = current.getBoundingClientRect()
      if (itemBounds.left < bounds.left) nav.scrollLeft += itemBounds.left - bounds.left
      else if (itemBounds.right > bounds.right) nav.scrollLeft += itemBounds.right - bounds.right
    })
  }, [pathname])

  // 1차 탭은 조건부일 수 없다 — CRM 하위 9개 화면 중 5개(현황·기록·입력함·검수·인사이트)는
  // 지금까지 사이드바 드릴인이 유일한 내비였고, 여기서 null 을 뱉으면 그 화면들의 내비가 0이 된다.
  // 숨김이 있어도 진입 탭 3개(현황·고객DB·검수)는 숨길 수 없어 1차 줄은 비지 않는다.
  return (
    <div ref={navRef} className="pt-3">
      <div className="flex items-center gap-2">
        {/* 1차 — CRM 하위 탭. 정본은 admin-nav.ts(CRM_CHILD_NAV)라 ⌘K 팔레트와 같은 표를 본다. */}
        {/* 폰에서는 좌우 전폭 스크롤(-mx-4 px-4) — 토글이 오른쪽에 붙을 때만 왼쪽만 넓힌다. */}
        <nav
          aria-label="CRM 주요 메뉴"
          className={`no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto sm:mx-0 sm:gap-2 sm:px-0 ${
            hiddenCount > 0 ? "-ml-4 pl-4" : "-mx-4 px-4"
          }`}
        >
          {primaryTabs.map((child) => {
            const isActive = child.match(currentPath)
            const forced = crmAccess.hiddenHrefs.has(child.href)
            return (
              <Link
                key={child.href}
                href={child.href}
                aria-current={isActive ? "page" : undefined}
                onFocus={() => warmSubtab(child.href)}
                onMouseEnter={() => scheduleWarmSubtab(child.href)}
                onMouseLeave={cancelWarmSubtab}
                onPointerDown={() => warmSubtab(child.href)}
                onTouchStart={() => warmSubtab(child.href)}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1 whitespace-nowrap border-b-2 px-3 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] sm:flex-none sm:px-4 ${
                  isActive
                    ? "border-[#084734] text-[#084734]"
                    : "border-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                {forced ? <EyeOff aria-hidden className="h-3 w-3 shrink-0 opacity-70" /> : null}
                {child.label}
                {forced ? <span className="sr-only">(숨긴 탭)</span> : null}
              </Link>
            )
          })}
        </nav>
        {/* 숨긴 탭 토글 — 가로 스크롤 밖 오른쪽에 둬 폰에서도 항상 보인다. */}
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setHiddenOpen((open) => !open)}
            aria-expanded={hiddenOpen}
            aria-controls={hiddenOpen ? hiddenPanelId : undefined}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 text-[12px] text-[#615D59] transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] sm:min-h-9"
          >
            <EyeOff aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">
              숨김 <span className="tabular-nums">{hiddenCount}</span>
            </span>
            <span className="hidden sm:inline">
              숨긴 탭 <span className="tabular-nums">{hiddenCount}</span> · {hiddenOpen ? "접기" : "보기"}
            </span>
          </button>
        ) : null}
      </div>

      {hiddenOpen && hiddenCount > 0 ? (
        <div
          id={hiddenPanelId}
          role="group"
          aria-label="숨긴 CRM 탭"
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 pb-2"
        >
          {crmAccess.hidden.map((item) => {
            const restoring = restoringHref === item.href
            return (
              <span key={item.href} className="inline-flex items-center">
                <Link
                  href={item.href}
                  onFocus={() => warmSubtab(item.href)}
                  onMouseEnter={() => scheduleWarmSubtab(item.href)}
                  onMouseLeave={cancelWarmSubtab}
                  onPointerDown={() => warmSubtab(item.href)}
                  onTouchStart={() => warmSubtab(item.href)}
                  className="inline-flex min-h-11 items-center rounded-full px-2.5 text-[12.5px] font-medium text-[#615D59] transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] sm:min-h-9"
                >
                  {item.displayLabel}
                </Link>
                <button
                  type="button"
                  onClick={() => void restoreHiddenTab(item.href)}
                  disabled={!onNavOverridesChange || restoringHref !== null}
                  aria-label={`${item.displayLabel} 다시 표시`}
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-[11px] font-medium text-[#615D59] transition-colors hover:bg-[#f5f5f2] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-9"
                >
                  {restoring ? "표시 중..." : "다시 표시"}
                </button>
              </span>
            )
          })}
          <span className="px-1 text-[11px] text-[#1a1a1a]/40">숨겨도 ⌘K·주소로 열립니다</span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(ADMIN_OPEN_NAV_EDITOR_EVENT))}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-[11px] font-medium text-[#615D59] underline-offset-2 transition-colors hover:text-[#111110] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] sm:min-h-9"
          >
            사이드바 편집
          </button>
          {restoreError ? (
            <p role="alert" className="w-full px-2.5 text-[11px] leading-snug text-[#B43E3E]">
              {restoreError}
            </p>
          ) : null}
        </div>
      ) : null}

      {showAnalysisSub ? <nav aria-label="CRM 현황·분석 메뉴" className="flex flex-wrap gap-3 border-t border-[#e8e8e4]">
        {ANALYSIS_SUBTABS.map(item => <Link key={item.key} href={item.href} onFocus={() => warmSubtab(item.href)} onMouseEnter={() => scheduleWarmSubtab(item.href)} onMouseLeave={cancelWarmSubtab} aria-current={pathname === item.href ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 px-1 text-[13px] font-medium ${pathname === item.href ? "border-[#084734] text-[#084734]" : "border-transparent text-[#615D59] hover:text-[#111110]"}`}>{item.label}</Link>)}
      </nav> : null}
      {showCustomersSub ? (
        <nav
          aria-label="CRM 고객 메뉴"
          className="no-scrollbar -mx-4 mt-1.5 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">고객</span>
          {customersTabs.map((sub) => {
            const isActive = customersSub === sub.key
            const forced = crmAccess.hiddenHrefs.has(sub.href)

            return (
              <Link
                key={sub.key}
                href={sub.href}
                aria-current={isActive ? "page" : undefined}
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => scheduleWarmSubtab(sub.href)}
                onMouseLeave={cancelWarmSubtab}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  isActive ? "text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <span className={isActive ? "text-[#084734]" : "text-[#1a1a1a]/35"}>
                  {forced ? <EyeOff aria-hidden className="h-3.5 w-3.5" /> : sub.icon}
                </span>
                {sub.label}
                {forced ? <span className="sr-only">(숨긴 탭)</span> : null}
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
                onMouseEnter={() => scheduleWarmSubtab(sub.href)}
                onMouseLeave={cancelWarmSubtab}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  isActive ? "text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
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

      {showReviewSub ? (
        <nav
          aria-label="CRM 검수 메뉴"
          className="no-scrollbar -mx-4 mt-1.5 flex items-center gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          <span className="mr-1 hidden shrink-0 text-[11px] font-medium text-[#1a1a1a]/40 sm:inline">검수</span>
          {REVIEW_SUBTABS.map((sub) => {
            const isActive = reviewSub === sub.key

            return (
              <Link
                key={sub.key}
                href={sub.href}
                aria-current={isActive ? "page" : undefined}
                onFocus={() => warmSubtab(sub.href)}
                onMouseEnter={() => scheduleWarmSubtab(sub.href)}
                onMouseLeave={cancelWarmSubtab}
                onPointerDown={() => warmSubtab(sub.href)}
                onTouchStart={() => warmSubtab(sub.href)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#084734] ${
                  isActive ? "text-[#084734]" : "text-[#615D59] hover:text-[#111110]"
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
