"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  LogOut,
  Menu,
  MoreHorizontal,
  Search,
  SquareChevronLeft,
  SquareChevronRight,
  Users,
  X,
} from "lucide-react"
import { adminFetchJsonCached, clearAdminSessionStorage, warmAdminRequestCache } from "@/lib/admin-client"
import { createSupabaseBrowserClient } from "@/lib/supabase/browser"
import { hasSupabaseBrowserEnv } from "@/lib/supabase/public-env"
import AdminNotificationsBell from "./AdminNotificationsBell"
import {
  CRM_SAVED_VIEW_GROUPS,
  CRM_SAVED_VIEWS,
  isCrmSavedViewActive,
  isCrmSavedViewsPath,
} from "./crm/crm-sidebar-navigation"
import { useDialogFocus } from "./use-dialog-focus"
import {
  ADMIN_NAV,
  ADMIN_NAV_CATEGORY_META,
  CRM_CHILD_NAV,
  normalizeAdminRole,
  type AdminNavItem,
  type AdminRole,
} from "./admin-nav"
// 상시/기타 배치 SSOT — 사이드바·커맨드 팔레트·권한 설정 미리보기가 전부 이 모듈의
// resolveNavAccess를 호출해야 세 화면이 어긋나지 않는다(사이드바 자체 계산 금지).
import { isNavPresetKey, normalizeNavOverrides, resolveNavAccess } from "./admin-nav-access"
// active 판정(splitNavHref/queryMatches/isNavActive)은 nav-active.ts로 추출됨 — CS 콘솔
// 가로 메뉴(cs/CsConsoleNav)와 같은 판정을 공유한다. 여기서는 클로저 인자만 채워 넘긴다.
import {
  isNavActive as matchNavActive,
  queryMatches as matchNavQuery,
  splitNavHref,
} from "./nav-active"

// NAV(섹션·항목·롤·뱃지)·SECTION_META·CRM 하위 nav는 admin-nav.ts(SSOT)로 추출됨 —
// 커맨드 팔레트(AdminCommandPalette)와 공유한다. 이 파일은 렌더링·warm-up 등 동작만 담당.

// hover warm-up은 페이지가 실제 호출하는 URL과 캐시 키(쿼리스트링 포함)가 완전히 같아야 적중한다.
// 날짜 파라미터가 붙는 URL은 hover 시점에 페이지와 같은 계산식으로 만들어야 하므로 함수 항목을 허용한다.

// /admin/overview 대시보드와 동일한 계산식 — 현재 월 + (7일 뒤가 다른 달에 걸치면) 그 달.
function overviewCalendarUrls() {
  const now = new Date()
  const weekLater = new Date(now)
  weekLater.setDate(now.getDate() + 7)
  const months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
  if (weekLater.getMonth() !== now.getMonth() || weekLater.getFullYear() !== now.getFullYear()) {
    months.push({ year: weekLater.getFullYear(), month: weekLater.getMonth() + 1 })
  }
  return months.map(({ year, month }) => `/api/admin/calendar?year=${year}&month=${month}`)
}

// CS 콘솔 IA 재구성(2026-07-27) 이후에도 이 맵의 키는 href 문자열 그대로 유지한다.
// 사이드바 CS 섹션이 3항목으로 줄면서 "/admin/docs?tab=gaps"·"/admin/channel-talk"는
// 사이드바 hover 경로에서 빠졌지만, 두 화면은 사라진 게 아니라 CS 콘솔 가로 메뉴
// (components/admin/cs/CsConsoleNav.tsx)로 옮겨간 것이고 URL도 동일하다 —
// 키를 지우면 "어느 화면이 어떤 API를 먼저 부르는지"의 유일한 기록이 사라져
// P1에서 다시 유추해야 하고, 그때 키가 어긋나면 warm이 조용히 빗나간다(이 파일 상단 경고).
// 그래서 남겨두고 export만 열어 콘솔 내비가 같은 맵을 그대로 쓸 수 있게 한다.
export const NAV_WARMUP_REQUESTS: Record<string, string[] | (() => string[])> = {
  "/admin/overview": () => [
    // overview 페이지가 실제 호출하는 URL과 캐시 키를 맞춰야 hover-warm이 적중한다.
    "/api/admin/leads?scope=dashboard",
    "/api/admin/subscribers?count=1",
    "/api/admin/blog",
    "/api/admin/email",
    ...overviewCalendarUrls(),
    // overview는 GET /api/admin/settings 대신 env+DB 합성 health를 읽는다 (페이지 주석 참조).
    "/api/admin/settings/integrations/status",
    "/api/admin/bugs",
    "/api/admin/patch-notes",
  ],
  "/admin/crm": [
    "/api/admin/crm/action-kpis",
    "/api/admin/crm/overview",
    "/api/admin/crm/neo?granularity=month&offset=0",
  ],
  "/admin/crm/customers/unified": [
    "/api/admin/crm/customers/unified?limit=100&offset=0",
    "/api/admin/crm/owners",
  ],
  "/admin/crm/activity": [
    "/api/admin/crm/events?limit=50&offset=0",
  ],
  "/admin/crm/capture": [
    "/api/admin/events",
    "/api/admin/crm/capture/batches",
  ],
  // 검수 탭(href=/admin/crm/matching)만 warm — deals·insights는 nav에서 내려가 죽은 키라 제거.
  "/admin/crm/matching": [
    "/api/admin/crm/matching",
    "/api/admin/crm/overview",
  ],
  // 채널톡 상담도 CS 콘솔 "상담 Inbox" 메뉴로 옮겨갔다 — 라우트·초기 페치가 동일해 키 유지.
  // 두 URL 모두 화면이 adminFetchJsonCached로 소비한다(상담 목록은 cache:"no-cache" 직페치에서
  // 캐시 소비로 바꿔 이 warm이 실제로 적중하게 했다 — P6). 동기화 버튼은 force로 우회한다.
  "/admin/channel-talk": ["/api/admin/channel-talk", "/api/admin/channel-talk/mine"],
  "/admin/calendar": () => {
    // 캘린더 페이지 초기 로드는 항상 현재 연/월 쿼리를 붙인다.
    const now = new Date()
    return [`/api/admin/calendar?year=${now.getFullYear()}&month=${now.getMonth() + 1}`]
  },
  // /admin/quotes 기본 탭은 portalFetch(/api/portal/documents?type=quote)라 admin 캐시를 읽지 않는다 — warm 대상 아님.
  "/admin/campaigns": [
    "/api/admin/email",
    "/api/admin/subscribers",
    // 캠페인 페이지의 리드 귀속 소비는 scope=campaigns(경량 컬럼) — warm 키 일치 필수.
    "/api/admin/leads?scope=campaigns",
    "/api/admin/events",
    "/api/admin/event-metrics",
    "/api/admin/meta/campaigns?datePreset=last_30d&limit=50",
    // 메시지 발송 허브(구 /admin/marketing)가 캠페인 탭으로 흡수되며 채널 상태도 함께 데운다.
    "/api/admin/messaging/status",
  ],
  "/admin/lead-magnets": [
    "/api/admin/lead-magnets",
    "/api/admin/lead-magnets/metrics?days=30",
  ],
  "/admin/blog": ["/api/admin/blog", "/api/admin/blog?trash=1"],
  "/admin/events": ["/api/admin/events"],
  // 쿼리 없는 진입은 문서 화면의 기본 탭(documents)이고, 그 탭은 페이지 공통 두 건만 쓴다.
  // 예전에 함께 데우던 docs/gaps·alpha-readiness는 각각 gaps·quality 탭 전용이라
  // documents 탭에서는 호출되지 않는다 — 안 여는 탭을 데우면 대역폭만 쓴다(P6).
  "/admin/docs": [
    "/api/admin/docs",
    "/api/admin/docs/analytics?days=30",
  ],
  // 문서 센터 탭 딥링크들 — warm 키는 href(쿼리 포함)와 문자 그대로 같아야 적중한다.
  // 사이드바 항목에서 CS 콘솔 가로 메뉴로 옮겨갔지만 href가 그대로라 키도 유효하다.
  // 어느 탭으로 들어가든 페이지 자체가 /api/admin/docs와 analytics를 캐시 페치하므로 공통으로 넣는다.
  //
  // 보강 큐 — DocsGapsPanel의 두 마운트 페치(/api/admin/docs/gaps · /api/admin/chatbot/stats)는
  // adminFetchJson(캐시를 읽지 않는 직페치)이라 warm이 원리적으로 적중할 수 없다.
  // 데워도 쓰이지 않는 두 건을 뺐다 — 소비를 캐시로 바꾸는 쪽은 그 패널의 결정이라 여기서 하지 않는다(P6).
  // alpha-readiness도 AI 품질 검수 탭으로 이관돼 여기서는 호출되지 않는다(§7).
  "/admin/docs?tab=gaps": [
    "/api/admin/docs",
    "/api/admin/docs/analytics?days=30",
  ],
  // AI 품질 검수 — 알파 준비도가 이 탭의 마운트 페치다(품질 평가는 POST라 warm 대상 아님).
  "/admin/docs?tab=quality": [
    "/api/admin/docs",
    "/api/admin/docs/analytics?days=30",
    "/api/admin/docs/alpha-readiness",
  ],
  // 가이드 문서·추천 질문 — 탭 전용 페치는 캐시를 쓰지 않으므로(DocsRecommendedQuestionsManager는
  // adminFetchJson) 페이지 공통 두 건만 데운다.
  "/admin/docs?tab=documents": ["/api/admin/docs", "/api/admin/docs/analytics?days=30"],
  "/admin/docs?tab=recommended": ["/api/admin/docs", "/api/admin/docs/analytics?days=30"],
  // 외부 챗봇 운영 대시보드(이원화로 재건) — 지표 6카드가 이 화면의 유일한 마운트 페치다.
  // CS 콘솔 IA 재구성 이후 이 href는 외부 축의 첫 화면("대시보드")이자 사이드바 "CS 콘솔" 항목이다.
  // 알파 준비도는 §7 중복 단일화로 AI 품질 검수 탭(위 ?tab=quality 키)으로 넘어갔고
  // ExternalChatbotOpsDashboard는 더 이상 호출하지 않는다 — 죽은 키라 뺀다(P6).
  "/admin/chatbot": [
    "/api/admin/chatbot/stats",
  ],
  // 내부 CS 워크스페이스 — 마운트 시점에 실제로 나가는 두 요청만 데운다.
  // conversations는 첫 화면을 막는 블로킹 로드이고, regression-candidates는
  // "운영 도구" 탭 진입 전에 미리 받는다(InternalCsChatWorkspace의 두 mount effect).
  // integrations/status·docs/gaps·cs-chat/metrics는 tools 탭에 들어가야 호출되므로 제외 —
  // 안 여는 탭을 데우면 대역폭만 쓴다. (P2가 탭을 URL 상태로 옮기면 ?tab=tools 키를 따로 잡으면 된다.)
  "/admin/cs-chatbot": [
    "/api/admin/cs-chat/conversations?status=all&limit=100",
    "/api/admin/cs-chat/regression-candidates",
  ],
  "/admin/branch": [
    "/api/admin/branch/summary?team=ALL&period=Q",
    "/api/admin/branch/kpi?team=ALL&period=Q",
  ],
  "/admin/branch/ledger": [
    "/api/admin/branch/summary?team=ALL&period=Q",
    "/api/admin/branch/kpi?team=ALL&period=Q",
    "/api/admin/branch/pipeline?team=ALL&period=Q",
  ],
  "/admin/hardware": ["/api/admin/hardware"],
  "/admin/traffic": [
    // 3중 스캔(visitor-stats/homepage-flow/event-counts)은 단일 집계 traffic-summary로 대체됨 —
    // warm 키도 페이지 소비 URL과 일치해야 적중한다(Wave 3-A).
    "/api/admin/traffic-summary?range=30",
    "/api/admin/marketing/conversions/status",
  ],
  "/admin/analytics": [
    // 페이지 소비가 스코프 파라미터로 좁혀짐 — warm 키를 소비 URL과 일치시킨다.
    "/api/admin/leads?scope=dashboard",
    "/api/admin/subscribers?scope=analytics",
    "/api/admin/email",
    "/api/admin/blog",
    "/api/admin/events",
    "/api/admin/event-metrics",
    "/api/admin/event-counts?range=30",
  ],
  "/admin/ops": [
    "/api/admin/settings/integrations/status",
    "/api/admin/automation/rules",
    "/api/admin/automation/logs",
  ],
  // 회원 관리는 Settings "회원" 탭으로 흡수됨 — Settings warm-up에 회원 디렉터리도 함께 데운다.
  "/admin/settings": ["/api/admin/settings", "/api/admin/users"],
  "/admin/dev": ["/api/admin/roadmap", "/api/admin/bugs", "/api/admin/patch-notes"],
}

// 사이드바 nav 전용 초미니멀 스크롤바: 4px 폭 + 투명 트랙 + hover 시에만 또렷한 thumb.
const MINIMAL_SCROLLBAR =
  "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-black/10 hover:[&::-webkit-scrollbar-thumb]:bg-black/20"

// 현장 사용 빈도 기준 — 2026-07-29 탭 재구성으로 첫 화면이 캘린더가 되면서 Overview를 내렸다.
// 나머지는 More의 전체 메뉴에서 접근한다.
const MOBILE_PRIMARY_NAV: AdminNavItem[] = [
  { href: "/admin/calendar", label: "캘린더", icon: CalendarDays, roles: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER", "BRANCH"], section: "sales" },
  { href: "/admin/quotes", label: "견적", icon: FileText, roles: ["SUPER_ADMIN", "ADMIN", "BRANCH"], section: "sales" },
  { href: "/admin/crm", label: "CRM", icon: Users, roles: ["SUPER_ADMIN", "ADMIN", "EDITOR", "VIEWER", "BRANCH"], section: "sales" },
]

const ROLE_LABEL: Record<AdminRole, string> = {
  SUPER_ADMIN: "최고 관리자",
  ADMIN: "관리자",
  EDITOR: "에디터",
  VIEWER: "뷰어",
  BRANCH: "지사장",
  PARTNER: "파트너",
}

interface Props {
  role: string
  name: string
  email: string
  navPreset: string | null
  navOverrides: Record<string, string>
}

export default function AdminSidebar(props: Props) {
  // useSearchParams(쿼리 인지형 active 매칭)는 프리렌더 시 Suspense 경계를 요구한다.
  // 사이드바는 클라이언트 컴포넌트지만 정적 프리렌더 대상이 될 수 있어 자체 경계로 감싼다.
  // admin layout이 세션 확인 전에는 스켈레톤을 그리므로 fallback null로 충분하다.
  return (
    <Suspense fallback={null}>
      <AdminSidebarContent {...props} />
    </Suspense>
  )
}

function AdminSidebarContent({ role, name, email, navPreset, navOverrides }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const prefetchedHrefs = useRef(new Set<string>())
  const warmedHrefs = useRef(new Set<string>())
  const warmupTimerRef = useRef<number | null>(null)
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_collapsed") === "true"
  })
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // 기타 접힘 패널 펼침 상태 — 새로고침에도 유지. 로그아웃 정리(clearAdminSessionStorage) 대상이
  // 아니다 — 세션 신원이 아니라 UI 취향이라 계정이 바뀌어도 지울 이유가 없다.
  const [otherOpen, setOtherOpen] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("admin_sidebar_other_open") === "true"
  })
  const mobileDrawerCloseRef = useRef<HTMLButtonElement | null>(null)
  // 모바일 드로어 접근성(품질 웨이브 3 — 항목 5) — Escape 닫기 + 열릴 때 닫기 버튼으로
  // 포커스 이동 · 닫힐 때 이전 포커스 복귀. DealModal과 동일한 공용 훅.
  useDialogFocus(mobileMenuOpen, () => setMobileMenuOpen(false), mobileDrawerCloseRef)

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)")
    const update = () => setIsDesktop(media.matches)

    update()
    media.addEventListener("change", update)

    return () => media.removeEventListener("change", update)
  }, [])

  const effectiveCollapsed = isDesktop === true && collapsed
  const inCrm = pathname?.startsWith("/admin/crm") ?? false
  const showCrmSavedViews = isCrmSavedViewsPath(pathname)
  const currentCrmSavedView = searchParams.get("view")
  const hasActiveCrmSavedView =
    showCrmSavedViews && CRM_SAVED_VIEWS.some(({ view }) => view === currentCrmSavedView)
  const [crmSegCounts, setCrmSegCounts] = useState<Record<string, number> | null>(null)
  // CRM 하위탭 접기 — admin layout이 유지 마운트라 네비게이션 동안 상태 보존(하드 리로드만 리셋).
  // CRM 드릴인 nav — 진입 시 기본 글로벌 탭이 접히고 CRM 하위 패널이 열린다. '← 전체 메뉴'로 복귀.
  const [navView, setNavView] = useState<"auto" | "global">("auto")
  const crmDrill = inCrm && navView !== "global" && !effectiveCollapsed

  // 통합 고객 목록에서만 저장 보기 카운트를 1회 lazy 로드한다. 다른 CRM 화면은
  // 저장 보기를 렌더하지 않으므로 관련 API 요청도 만들지 않는다.
  useEffect(() => {
    if (!showCrmSavedViews || crmSegCounts) return
    let alive = true
    adminFetchJsonCached<{ summary?: { viewCounts?: Record<string, number> } }>(
      "/api/admin/crm/customers/unified?limit=1",
      undefined,
      { cacheKey: "sidebar:crm-seg-counts", ttlMs: 120_000, staleWhileRevalidateMs: 300_000 }
    )
      .then((d) => {
        if (alive) setCrmSegCounts(d?.summary?.viewCounts ?? null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [showCrmSavedViews, crmSegCounts])

  const toggle = () => {
    setCollapsed((prev) => {
      localStorage.setItem("admin_sidebar_collapsed", String(!prev))
      return !prev
    })
  }

  const toggleOther = () => {
    // 접힌 상태에서는 라벨이 렌더되지 않아 기타 패널을 펼쳐도 내용을 알아볼 수 없다 —
    // 그때는 사이드바부터 펼치고 기타 패널도 함께 연다(닫는 방향으로는 토글하지 않는다).
    if (effectiveCollapsed) {
      setCollapsed(false)
      localStorage.setItem("admin_sidebar_collapsed", "false")
      setOtherOpen(true)
      localStorage.setItem("admin_sidebar_other_open", "true")
      return
    }

    setOtherOpen((prev) => {
      localStorage.setItem("admin_sidebar_other_open", String(!prev))
      return !prev
    })
  }

  const handleLogout = async () => {
    clearAdminSessionStorage()

    if (hasSupabaseBrowserEnv()) {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    }

    await fetch("/api/admin/auth/logout", { method: "POST" }).catch(() => null)

    router.replace("/admin/login")
    router.refresh()
  }

  const normalizedRole = normalizeAdminRole(role)
  const visibleNav = useMemo(
    () => ADMIN_NAV.filter((item) => item.roles.includes(normalizedRole)),
    [normalizedRole]
  )
  // 상시/기타 배치는 반드시 resolveNavAccess를 통해서만 계산한다 — 사이드바가 자체 계산을
  // 하면 나중에 권한 설정 화면의 미리보기와 어긋난다. preset이 없으면(마이그레이션 미적용·
  // 프리셋 미배정) resolveNavPlacement가 전부 "primary"로 돌려줘 오늘과 동일한 화면을 보장한다.
  const navAccess = useMemo(() => {
    const preset = isNavPresetKey(navPreset) ? navPreset : null
    return resolveNavAccess(
      { role: normalizedRole, preset, overrides: normalizeNavOverrides(navOverrides) },
      visibleNav
    )
  }, [normalizedRole, navPreset, navOverrides, visibleNav])
  const queryMatches = (query: string) => matchNavQuery(query, searchParams)
  const isNavActive = (href: string) =>
    matchNavActive(href, { pathname, searchParams, siblings: visibleNav })
  const currentNavItem = visibleNav.find((item) => isNavActive(item.href)) ?? visibleNav[0]
  const currentCrmChild = inCrm ? CRM_CHILD_NAV.find((item) => item.match(pathname ?? "")) : undefined
  const mobilePrimaryNav = MOBILE_PRIMARY_NAV.filter((item) => item.roles.includes(normalizedRole))
  const mobilePrimaryActiveHref = mobilePrimaryNav.reduce<string | null>((bestHref, item) => {
    const { path, query } = splitNavHref(item.href)
    const matchesPath = pathname === path || pathname.startsWith(`${path}/`)
    const matches = matchesPath && (query === null || queryMatches(query))
    if (!matches) return bestHref
    if (!bestHref) return item.href

    const bestPath = splitNavHref(bestHref).path
    return path.length > bestPath.length ? item.href : bestHref
  }, null)
  const mobileBottomColumns = Math.min(mobilePrimaryNav.length + 1, 5)

  const prefetchAdminRoute = useCallback((href: string) => {
    if (prefetchedHrefs.current.has(href)) return
    prefetchedHrefs.current.add(href)

    try {
      router.prefetch(href)
    } catch {
      // Prefetch is an optimization only.
    }
  }, [router])

  const warmAdminTab = useCallback((href: string) => {
    prefetchAdminRoute(href)

    if (warmedHrefs.current.has(href)) return
    warmedHrefs.current.add(href)

    const warmupEntry = NAV_WARMUP_REQUESTS[href]
    const warmupUrls = typeof warmupEntry === "function" ? warmupEntry() : warmupEntry ?? []
    for (const url of warmupUrls) {
      void warmAdminRequestCache(url, { ttlMs: 60_000 })
    }
  }, [prefetchAdminRoute])

  const scheduleWarmAdminTab = useCallback((href: string) => {
    prefetchAdminRoute(href)

    if (warmupTimerRef.current !== null) {
      window.clearTimeout(warmupTimerRef.current)
    }

    warmupTimerRef.current = window.setTimeout(() => {
      warmAdminTab(href)
      warmupTimerRef.current = null
    }, 180)
  }, [prefetchAdminRoute, warmAdminTab])

  const cancelWarmAdminTab = useCallback(() => {
    if (warmupTimerRef.current === null) return
    window.clearTimeout(warmupTimerRef.current)
    warmupTimerRef.current = null
  }, [])

  useEffect(() => () => cancelWarmAdminTab(), [cancelWarmAdminTab])

  // 코덱스 감사 #3 — 유휴 prefetch 축소. 과거엔 유휴 시 visibleNav 상위 6개(2026-07-18 재정렬
  // 후 전부 대형 라우트: overview·branch·ledger·crm·quotes·hardware)를 일괄 router.prefetch해
  // 로그인 직후 대역폭·서버 렌더를 크게 썼다. 이제 유휴 시간에는
  //  (a) 현재 활성 탭과 같은 섹션(admin-nav.ts section 필드)의 바로 이웃(±1) 탭만 내려받는다
  //      — 다음 이동 확률이 가장 높은 후보. 탭 이동(currentNavItem 변경) 시 새 이웃을 다시 잡는다.
  //  (b) 그 외 탭은 hover/focus/터치 시점의 warmAdminTab/scheduleWarmAdminTab 경로가 즉시
  //      prefetch한다(기존 동작 유지 — prefetchAdminRoute가 warm 경로에 이미 배선돼 있다).
  // prefetchedHrefs Set이 중복 prefetch를 막는다.
  useEffect(() => {
    if (!currentNavItem) return

    const run = () => {
      const sectionItems = visibleNav.filter((item) => item.section === currentNavItem.section)
      const index = sectionItems.findIndex((item) => item.href === currentNavItem.href)
      if (index === -1) return
      for (const neighbor of [sectionItems[index - 1], sectionItems[index + 1]]) {
        if (neighbor) prefetchAdminRoute(neighbor.href)
      }
    }
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const idleId = idleWindow.requestIdleCallback?.(run, { timeout: 1_800 })

    if (idleId !== undefined) {
      return () => idleWindow.cancelIdleCallback?.(idleId)
    }

    const timeoutId = window.setTimeout(run, 650)
    return () => window.clearTimeout(timeoutId)
  }, [currentNavItem, prefetchAdminRoute, visibleNav])

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-3 border-b border-[#e8e8e4] bg-white/95 px-3 pr-16 shadow-sm backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#e8e8e4] bg-white text-[#111110] shadow-sm"
        aria-label="Open admin menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/35">
          Classin Admin
        </p>
        <p className="truncate text-[15px] font-semibold text-[#111110]">
          {currentCrmChild?.label ?? currentNavItem?.label ?? "Admin"}
        </p>
      </div>
      {isDesktop === false ? <AdminNotificationsBell placement="inline" /> : null}
    </header>

    {mobileMenuOpen ? (
      <div className="fixed inset-0 z-[60] lg:hidden">
        <button
          type="button"
          className="absolute inset-0 bg-[#111110]/35"
          aria-label="Close admin menu"
          onClick={() => setMobileMenuOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
          className="absolute inset-y-0 left-0 flex w-[min(88vw,360px)] flex-col border-r border-[#e8e8e4] bg-white shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-[#e8e8e4] px-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
              <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
            </div>
            <button
              type="button"
              ref={mobileDrawerCloseRef}
              onClick={() => setMobileMenuOpen(false)}
              className="flex h-10 w-10 items-center justify-center rounded-md border border-[#e8e8e4] text-[#1a1a1a]/55"
              aria-label="Close admin menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-[#e8e8e4] px-4 py-3">
            <p className="truncate text-[13px] font-medium text-[#111110]">{name}</p>
            <p className="truncate text-[11px] text-[#1a1a1a]/40">
              {ROLE_LABEL[normalizedRole]}{email ? ` - ${email}` : ""}
            </p>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4">
            {crmDrill ? (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setNavView("global")}
                  className="mb-1 flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  전체 메뉴
                </button>
                <div className="flex items-center gap-2 px-3 pb-1">
                  <Users className="h-4 w-4 text-[#1a1a1a]/45" />
                  <p className="text-[13px] font-bold text-[#111110]">CRM</p>
                </div>
                {CRM_CHILD_NAV.map((child) => {
                  const childActive = child.match(pathname ?? "")
                  return (
                    <div key={`mobile-${child.href}`}>
                      <Link
                        href={child.href}
                        onFocus={() => warmAdminTab(child.href)}
                        onMouseEnter={() => scheduleWarmAdminTab(child.href)}
                        onMouseLeave={cancelWarmAdminTab}
                        onPointerDown={() => warmAdminTab(child.href)}
                        onTouchStart={() => warmAdminTab(child.href)}
                        onClick={() => {
                          warmAdminTab(child.href)
                          setMobileMenuOpen(false)
                        }}
                        aria-current={
                          childActive &&
                          !(child.href === "/admin/crm/customers/unified" && hasActiveCrmSavedView)
                            ? "page"
                            : undefined
                        }
                        className={`flex min-h-11 items-center rounded-md px-3 text-[14px] font-medium transition-colors ${
                          childActive
                            ? "bg-[#111110] text-white"
                            : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                        }`}
                      >
                        {child.label}
                      </Link>
                      {child.href === "/admin/crm/customers/unified" && showCrmSavedViews ? (
                        <div
                          className="ml-3 mt-1 space-y-2 border-l border-[#e8e8e4] pb-1 pl-3"
                          role="group"
                          aria-label="고객DB 저장 보기"
                        >
                          {CRM_SAVED_VIEW_GROUPS.map((group) => (
                            <div key={`mobile-${group.key}`}>
                              <p className="px-3 pb-1 pt-1 text-[10px] font-semibold tracking-[0.02em] text-[#1a1a1a]/55">
                                {group.label}
                              </p>
                              <div className="space-y-px">
                                {group.views.map((seg) => {
                                  const count = crmSegCounts?.[seg.view]
                                  const segmentActive = isCrmSavedViewActive(
                                    pathname,
                                    currentCrmSavedView,
                                    seg.view
                                  )
                                  return (
                                    <Link
                                      key={`mobile-${seg.view}`}
                                      href={`/admin/crm/customers/unified?view=${seg.view}`}
                                      onClick={() => setMobileMenuOpen(false)}
                                      aria-current={segmentActive ? "page" : undefined}
                                      className={`flex min-h-11 items-center gap-2 rounded-md px-3 text-[12px] transition-colors ${
                                        segmentActive
                                          ? "bg-[#ECFDF5] font-semibold text-[#084734]"
                                          : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
                                      }`}
                                    >
                                      <span className="flex-1 truncate">{seg.label}</span>
                                      <span
                                        aria-hidden={count == null}
                                        className={`min-w-5 rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums ${
                                          count == null
                                            ? "bg-transparent"
                                            : segmentActive
                                            ? "bg-white/80 text-[#084734]"
                                            : "bg-[#f0f0ec] text-[#1a1a1a]/55"
                                        }`}
                                      >
                                        {count ?? ""}
                                      </span>
                                    </Link>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {navAccess.primary.map((item) => {
                    const isActive = isNavActive(item.href)

                    return (
                      <Link
                        key={`mobile-${item.href}`}
                        href={item.href}
                        onFocus={() => warmAdminTab(item.href)}
                        onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                        onMouseLeave={cancelWarmAdminTab}
                        onPointerDown={() => warmAdminTab(item.href)}
                        onTouchStart={() => warmAdminTab(item.href)}
                        onClick={() => {
                          warmAdminTab(item.href)
                          if (item.href === "/admin/crm") setNavView("auto")
                          setMobileMenuOpen(false)
                        }}
                        className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors ${
                          isActive
                            ? "bg-[#111110] text-white"
                            : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                        }`}
                      >
                        <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                          <item.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge ? (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                            isActive ? "bg-white/15 text-white/80" : "bg-[#e8e8e4] text-[#1a1a1a]/50"
                          }`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    )
                  })}
                </div>

                {navAccess.folded.length > 0 && (
                  <div className="mt-5 border-t border-[#f0f0ec] pt-4">
                    <button
                      type="button"
                      onClick={toggleOther}
                      aria-expanded={otherOpen}
                      className="flex min-h-11 w-full items-center gap-1.5 rounded-md px-3 text-[13px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                    >
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${otherOpen ? "rotate-90" : ""}`} />
                      <span className="flex-1 text-left">기타</span>
                      <span className="tabular-nums text-[#1a1a1a]/30">
                        {navAccess.folded.reduce((sum, group) => sum + group.items.length, 0)}
                      </span>
                    </button>

                    {otherOpen && (
                      <div className="mt-1 space-y-3">
                        {navAccess.folded.map(({ category, items }) => (
                          <div key={`mobile-${category}`}>
                            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                              {ADMIN_NAV_CATEGORY_META[category].label}
                            </p>
                            <div className="space-y-1">
                              {items.map((item) => {
                                const isActive = isNavActive(item.href)
                                const isWip = item.maturity === "wip"

                                return (
                                  <Link
                                    key={`mobile-${item.href}`}
                                    href={item.href}
                                    onFocus={() => warmAdminTab(item.href)}
                                    onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                                    onMouseLeave={cancelWarmAdminTab}
                                    onPointerDown={() => warmAdminTab(item.href)}
                                    onTouchStart={() => warmAdminTab(item.href)}
                                    onClick={() => {
                                      warmAdminTab(item.href)
                                      setMobileMenuOpen(false)
                                    }}
                                    className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors ${
                                      isActive
                                        ? "bg-[#111110] text-white"
                                        : isWip
                                          ? "text-[#1a1a1a]/40 hover:bg-[#f5f5f2] hover:text-[#1a1a1a]/65"
                                          : "text-[#1a1a1a]/65 hover:bg-[#f5f5f2] hover:text-[#111110]"
                                    }`}
                                  >
                                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                                      <item.icon className="h-4 w-4" />
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                    {isWip && !isActive && (
                                      <span className="rounded bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-normal text-[#1a1a1a]/40">
                                        다듬는 중
                                      </span>
                                    )}
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </nav>

          <div className="border-t border-[#e8e8e4] p-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false)
                void handleLogout()
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-[14px] text-[#B85C33] transition-colors hover:bg-[#FEF3EE]"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    ) : null}

    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e8e8e4] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden">
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${mobileBottomColumns}, minmax(0, 1fr))` }}>
        {mobilePrimaryNav.map((item) => {
          const isActive = mobilePrimaryActiveHref === item.href

          return (
            <Link
              key={`bottom-${item.href}`}
              href={item.href}
              onFocus={() => warmAdminTab(item.href)}
              onMouseEnter={() => scheduleWarmAdminTab(item.href)}
              onMouseLeave={cancelWarmAdminTab}
              onPointerDown={() => warmAdminTab(item.href)}
              onTouchStart={() => warmAdminTab(item.href)}
              onClick={() => warmAdminTab(item.href)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none transition-colors ${
                isActive
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
              }`}
            >
              <span className={isActive ? "text-white" : "text-[#1a1a1a]/40"}>
                <item.icon className="h-4 w-4" />
              </span>
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
        >
          <MoreHorizontal className="h-4 w-4 text-[#1a1a1a]/40" />
          <span>More</span>
        </button>
      </div>
    </nav>

    <aside
      className={`relative hidden shrink-0 flex-col border-r border-[#e8e8e4] bg-white lg:flex lg:h-[100dvh] lg:min-h-0 ${
        effectiveCollapsed ? "lg:w-16" : "lg:w-60"
      }`}
    >
      <div
        className={`flex shrink-0 items-center border-b border-[#e8e8e4] py-4 lg:pt-6 lg:pb-4 ${
          effectiveCollapsed ? "flex-col gap-2 px-2" : "gap-1 px-4 sm:px-5"
        }`}
      >
        {!effectiveCollapsed && (
          <div className="flex-1">
            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Classin</p>
            <p className="text-[15px] font-semibold text-[#111110]">Admin</p>
          </div>
        )}
        {isDesktop === true ? <AdminNotificationsBell placement="inline" /> : null}
        <button
          onClick={toggle}
          className="rounded-md p-1 text-[#1a1a1a]/30 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
          title={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        >
          {effectiveCollapsed ? <SquareChevronRight className="h-4 w-4" /> : <SquareChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!effectiveCollapsed && (
        <div className="shrink-0 border-b border-[#e8e8e4] px-4 py-3 sm:px-5">
          <p className="text-[12px] font-medium text-[#111110]">{name}</p>
          <p className="text-[11px] text-[#1a1a1a]/40">
            {ROLE_LABEL[normalizedRole]}{email ? ` - ${email}` : ""}
          </p>
        </div>
      )}

      <div className={`shrink-0 border-b border-[#e8e8e4] py-3 ${effectiveCollapsed ? "px-2" : "px-4 sm:px-5"}`}>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("admin:open-command-palette"))}
          className={`flex items-center rounded-lg border border-[#e8e8e4] bg-[#fafaf8] text-[#1a1a1a]/45 transition-colors hover:border-[#c8c8c4] hover:text-[#111110] ${
            effectiveCollapsed ? "mx-auto h-9 w-9 justify-center" : "w-full gap-2 px-2.5 py-2"
          }`}
          title="빠른 이동·검색 (⌘K)"
          aria-label="빠른 이동·검색"
        >
          <Search className="h-4 w-4 shrink-0" />
          {!effectiveCollapsed && (
            <>
              <span className="flex-1 text-left text-[12px]">빠른 이동·검색</span>
              <kbd className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/35 shadow-sm">⌘K</kbd>
            </>
          )}
        </button>
      </div>

      <nav className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 ${MINIMAL_SCROLLBAR} ${effectiveCollapsed ? "lg:px-2" : ""}`}>
        {crmDrill ? (
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setNavView("global")}
              className="mb-2 flex w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              전체 메뉴
            </button>
            <div className="mb-1 flex items-center gap-2 px-3">
              <Users className="h-4 w-4 text-[#1a1a1a]/45" />
              <p className="text-[13px] font-bold text-[#111110]">CRM</p>
            </div>
            {CRM_CHILD_NAV.map((child) => {
              const childActive = child.match(pathname ?? "")
              return (
                <div key={child.href}>
                  <Link
                    href={child.href}
                    onFocus={() => warmAdminTab(child.href)}
                    onMouseEnter={() => scheduleWarmAdminTab(child.href)}
                    onMouseLeave={cancelWarmAdminTab}
                    onPointerDown={() => warmAdminTab(child.href)}
                    onTouchStart={() => warmAdminTab(child.href)}
                    onClick={() => warmAdminTab(child.href)}
                    aria-current={
                      childActive &&
                      !(child.href === "/admin/crm/customers/unified" && hasActiveCrmSavedView)
                        ? "page"
                        : undefined
                    }
                    className={`flex items-center rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                      childActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    {child.label}
                  </Link>
                  {child.href === "/admin/crm/customers/unified" && showCrmSavedViews ? (
                    <div
                      className="mb-1 ml-3 mt-1 space-y-1.5 border-l border-[#e8e8e4] pb-1 pl-2.5"
                      role="group"
                      aria-label="고객DB 저장 보기"
                    >
                      {CRM_SAVED_VIEW_GROUPS.map((group) => (
                        <div key={group.key}>
                          <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold tracking-[0.02em] text-[#1a1a1a]/55">
                            {group.label}
                          </p>
                          <div className="space-y-px">
                            {group.views.map((seg) => {
                              const count = crmSegCounts?.[seg.view]
                              const segmentActive = isCrmSavedViewActive(
                                pathname,
                                currentCrmSavedView,
                                seg.view
                              )
                              return (
                                <Link
                                  key={seg.view}
                                  href={`/admin/crm/customers/unified?view=${seg.view}`}
                                  aria-current={segmentActive ? "page" : undefined}
                                  className={`flex min-h-7 items-center gap-2 rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                                    segmentActive
                                      ? "bg-[#ECFDF5] font-semibold text-[#084734]"
                                      : "text-[#1a1a1a]/55 hover:bg-[#f5f5f2] hover:text-[#111110]"
                                  }`}
                                >
                                  <span className="flex-1 truncate">{seg.label}</span>
                                  <span
                                    aria-hidden={count == null}
                                    className={`min-w-5 rounded-full px-1.5 text-center text-[10px] font-semibold tabular-nums ${
                                      count == null
                                        ? "bg-transparent"
                                        : segmentActive
                                        ? "bg-white/80 text-[#084734]"
                                        : "bg-[#f0f0ec] text-[#1a1a1a]/55"
                                    }`}
                                  >
                                    {count ?? ""}
                                  </span>
                                </Link>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <div className="space-y-0.5">
              {navAccess.primary.map((item) => {
                const isActive = isNavActive(item.href)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={effectiveCollapsed ? item.label : undefined}
                    onFocus={() => warmAdminTab(item.href)}
                    onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                    onMouseLeave={cancelWarmAdminTab}
                    onPointerDown={() => warmAdminTab(item.href)}
                    onTouchStart={() => warmAdminTab(item.href)}
                    onClick={() => {
                      warmAdminTab(item.href)
                      if (item.href === "/admin/crm") setNavView("auto")
                    }}
                    className={`group flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
                    } ${
                      isActive
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                    }`}
                  >
                    <span className={isActive ? "text-white" : "text-[#1a1a1a]/40 group-hover:text-[#111110]"}>
                      <item.icon className="h-4 w-4" />
                    </span>
                    {!effectiveCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.badge && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                            isActive ? "bg-white/15 text-white/80" : "bg-[#e8e8e4] text-[#1a1a1a]/50"
                          }`}>
                            {item.badge}
                          </span>
                        )}
                        {isActive && <ChevronRight className="h-3 w-3 opacity-60" />}
                      </>
                    )}
                  </Link>
                )
              })}
            </div>

            {navAccess.folded.length > 0 && (
              <div className="mt-5 border-t border-[#f0f0ec] pt-4">
                <button
                  type="button"
                  onClick={toggleOther}
                  aria-expanded={otherOpen}
                  className="flex w-full items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
                >
                  <ChevronRight className={`h-3.5 w-3.5 shrink-0 transition-transform ${otherOpen ? "rotate-90" : ""}`} />
                  {!effectiveCollapsed && (
                    <>
                      <span className="flex-1 text-left">기타</span>
                      <span className="tabular-nums text-[#1a1a1a]/30">
                        {navAccess.folded.reduce((sum, group) => sum + group.items.length, 0)}
                      </span>
                    </>
                  )}
                </button>

                {otherOpen && !effectiveCollapsed && (
                  <div className="mt-1 space-y-3">
                    {navAccess.folded.map(({ category, items }) => (
                      <div key={category}>
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/28">
                          {ADMIN_NAV_CATEGORY_META[category].label}
                        </p>
                        <div className="space-y-0.5">
                          {items.map((item) => {
                            const isActive = isNavActive(item.href)
                            const isWip = item.maturity === "wip"

                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                onFocus={() => warmAdminTab(item.href)}
                                onMouseEnter={() => scheduleWarmAdminTab(item.href)}
                                onMouseLeave={cancelWarmAdminTab}
                                onPointerDown={() => warmAdminTab(item.href)}
                                onTouchStart={() => warmAdminTab(item.href)}
                                onClick={() => warmAdminTab(item.href)}
                                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                                  isActive
                                    ? "bg-[#111110] text-white"
                                    : isWip
                                      ? "text-[#1a1a1a]/35 hover:bg-[#f5f5f2] hover:text-[#1a1a1a]/60"
                                      : "text-[#1a1a1a]/60 hover:bg-[#f5f5f2] hover:text-[#111110]"
                                }`}
                              >
                                <span className={isActive ? "text-white" : "text-[#1a1a1a]/30"}>
                                  <item.icon className="h-4 w-4" />
                                </span>
                                <span className="flex-1">{item.label}</span>
                                {isWip && !isActive && (
                                  <span className="rounded bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-normal text-[#1a1a1a]/40">
                                    다듬는 중
                                  </span>
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </nav>

      <div className={`relative shrink-0 pt-3 pb-5 ${effectiveCollapsed ? "px-2 lg:px-2" : "px-3"}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-white to-transparent"
        />
        <button
          onClick={handleLogout}
          title={effectiveCollapsed ? "로그아웃" : undefined}
          className={`flex w-full items-center gap-2.5 rounded-lg text-[13px] text-[#1a1a1a]/40 transition-colors hover:bg-[#FEF3EE] hover:text-[#B85C33] ${
            effectiveCollapsed ? "justify-center px-2 py-2.5" : "px-3 py-2"
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!effectiveCollapsed && "로그아웃"}
        </button>
      </div>

      {/* 오른쪽 경계선 클릭 토글 — 헤더 아이콘과 별개로 사이드바 가장자리를 눌러도 접힘/펼침.
          nav 스크롤바(우측 4px)를 가로채지 않도록 경계선 바로 바깥 6px 스트립만 클릭 대상으로 둔다. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        title={effectiveCollapsed ? "사이드바 열기" : "사이드바 닫기"}
        className="group absolute inset-y-0 left-full z-30 flex w-1.5 cursor-pointer items-center justify-center focus:outline-none"
      >
        {/* 경계선 하이라이트 — hover/focus 시 또렷해진다 */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors group-hover:bg-[#111110]/20 group-focus-visible:bg-[#111110]/30"
        />
        {/* 중앙 손잡이 — hover/focus 시 노출 */}
        <span
          aria-hidden
          className="flex h-9 w-[18px] -translate-x-1/2 items-center justify-center rounded-full border border-[#e8e8e4] bg-white text-[#1a1a1a]/50 opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {effectiveCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </span>
      </button>
    </aside>
    </>
  )
}
