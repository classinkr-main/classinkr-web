"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BadgeCheck,
  BookOpen,
  Bot,
  Building,
  Headset,
  Inbox,
  MessageSquare,
  MessageSquareText,
  Search,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import { warmAdminRequestCache } from "@/lib/admin-client"

import {
  normalizeAdminRole,
  STAFF_ADMIN,
  STAFF_EDITOR,
  type AdminRole,
} from "../admin-nav"
import { NAV_WARMUP_REQUESTS } from "../AdminSidebar"
import { isNavActive } from "../nav-active"

// CS 어드민 콘솔 2단 내비게이션 (레이아웃 1b).
// 정본: docs/active/cs-admin-console-ia-2026-07-27.md — §2 메뉴 구조 · §4 셸 · §5 URL 규약 · §8 색.
//
// 이 파일이 CS 메뉴 정의의 단일 진실 원천이다. 라우트 그룹(app/admin/(cs)/layout.tsx)을 쓰지 않는
// 이유는 §4 참조 — /admin/docs 아래 new/·[id]/edit/ 전체화면 에디터에까지 콘솔이 붙기 때문이다.
// 4개 페이지가 이 컴포넌트를 직접 불러 쓴다(부착은 P1/P2).
//
// active 판정은 사이드바와 같은 nav-active.ts를 쓴다 — 두 벌로 갈리면 반드시 어긋난다(§5).

export type CsConsoleMode = "customer" | "internal"

export interface CsConsoleNavItem {
  href: string
  label: string
  icon: LucideIcon
  roles: AdminRole[]
  /**
   * 그룹 active 조건 — 이 href들 중 하나라도 매칭되면 항목이 active가 된다.
   * `가이드 문서`는 카테고리·리디렉트를 화면 내부 보조 탭으로 품고 있어
   * tab ∈ {documents, categories, redirects}가 모두 같은 메뉴를 가리킨다(§5 "가이드 문서 그룹 매핑").
   */
  activeWhen?: string[]
  /**
   * false면 메뉴 정의에는 남지만 렌더에서 빠진다 — 화면보다 메뉴 확정이 먼저 끝난 단계용 스위치.
   * 현재 끄고 있는 항목은 없다(`본사 확인`은 P3에서 켜졌다).
   */
  enabled?: boolean
}

interface CsConsoleModeSpec {
  mode: CsConsoleMode
  label: string
  /** 모드 탭 클릭 시 이동할 그 축의 첫 화면(§5 "모드는 URL에 넣지 않는다"). */
  entryHref: string
  items: CsConsoleNavItem[]
}

const CS_STAFF_EDITOR: AdminRole[] = [...STAFF_EDITOR, "BRANCH"]
const CS_STAFF_ADMIN: AdminRole[] = [...STAFF_ADMIN, "BRANCH"]

/** 외부용 · Customer (6) — §2 표 그대로. */
const CUSTOMER_ITEMS: CsConsoleNavItem[] = [
  { href: "/admin/chatbot", label: "대시보드", icon: Bot, roles: CS_STAFF_EDITOR },
  // 채널톡만 STAFF_ADMIN — 사이드바 시절 롤을 그대로 승계한다(§4).
  { href: "/admin/channel-talk", label: "상담 Inbox", icon: MessageSquare, roles: CS_STAFF_ADMIN },
  { href: "/admin/docs?tab=gaps", label: "미해결 큐", icon: Search, roles: CS_STAFF_EDITOR },
  // 10개 메뉴 중 유일한 신설 아이콘(§2). BadgeCheck = 검증·인증 완료.
  // ShieldCheck를 쓰지 않는다 — 이 저장소에서 방패는 이미 보안·동의·권한을 뜻한다
  // (설정 보안 패널, 연동 제어, 멤버 권한, 리드 마케팅 동의, CRM 커버리지, 자산 담당자 확인).
  // 이 화면은 알파 준비도 점검 + 골든셋 회귀 품질이라 보안 축이 아니다.
  { href: "/admin/docs?tab=quality", label: "AI 품질 검수", icon: BadgeCheck, roles: CS_STAFF_EDITOR },
  {
    href: "/admin/docs?tab=documents",
    label: "가이드 문서",
    icon: BookOpen,
    roles: CS_STAFF_EDITOR,
    // 카테고리·리디렉트는 화면 안쪽 보조 탭이라 같은 메뉴로 묶인다.
    // 쿼리 없는 `/admin/docs`도 포함 — 문서 화면의 기본 탭이 documents이고,
    // 형제 딥링크(gaps·quality·recommended)가 매칭될 때는 nav-active가 알아서 양보한다.
    activeWhen: [
      "/admin/docs?tab=categories",
      "/admin/docs?tab=redirects",
      "/admin/docs?tab=analytics",
      "/admin/docs",
    ],
  },
  { href: "/admin/docs?tab=recommended", label: "추천 질문", icon: MessageSquareText, roles: CS_STAFF_EDITOR },
]

/** 내부용 · Internal (4) — §2 표 그대로. */
const INTERNAL_ITEMS: CsConsoleNavItem[] = [
  {
    href: "/admin/cs-chatbot?tab=chat",
    label: "내부 상담",
    icon: Headset,
    roles: CS_STAFF_EDITOR,
    // 탭 없는 진입(/admin/cs-chatbot)과 conversation 딥링크만 온 경우는 chat으로 친다(§5).
    activeWhen: ["/admin/cs-chatbot"],
  },
  { href: "/admin/cs-chatbot?tab=queue", label: "대기열", icon: Inbox, roles: CS_STAFF_EDITOR },
  // P3에서 화면이 생겼다(§6) — `evidence:hq_pending` 태그를 가진 대화 목록.
  { href: "/admin/cs-chatbot?tab=hq", label: "본사 확인", icon: Building, roles: CS_STAFF_EDITOR },
  { href: "/admin/cs-chatbot?tab=tools", label: "운영 도구", icon: Wrench, roles: CS_STAFF_EDITOR },
]

export const CS_CONSOLE_MODES: CsConsoleModeSpec[] = [
  { mode: "customer", label: "외부용 · Customer", entryHref: "/admin/chatbot", items: CUSTOMER_ITEMS },
  { mode: "internal", label: "내부용 · Internal", entryHref: "/admin/cs-chatbot?tab=chat", items: INTERNAL_ITEMS },
]

/** §8 — 색보다 이 문구가 축을 훨씬 강하게 알린다. 프로토타입 문안 승계. */
export const CS_INTERNAL_WARNING =
  "사내 전용 영역 — 예외 조항·단가·본사 담당자 정보는 고객에게 그대로 안내하지 마세요"

/**
 * 모드는 URL 파라미터가 아니라 현재 라우트로 결정된다(§5).
 * /admin/cs-chatbot이면 내부, 나머지는 외부.
 */
export function resolveCsConsoleMode(pathname: string): CsConsoleMode {
  return pathname === "/admin/cs-chatbot" || pathname.startsWith("/admin/cs-chatbot/")
    ? "internal"
    : "customer"
}

export interface CsConsoleNavProps {
  /**
   * 현재 사용자 역할. 생략하면 sessionStorage("admin_role")에서 읽는다 —
   * 서버 컴포넌트 페이지에서 `<CsConsoleNav />`로 그대로 붙일 수 있게 하기 위함.
   */
  role?: string
  /**
   * 본문 컨테이너와 좌우 정렬을 맞추는 내부 래퍼 클래스.
   *
   * 폭 계약은 "1240px"이 아니라 "그 화면 본문과 좌우가 맞는다"이다(§1 "본문 폭을 1240px로
   * 통일하지 않는 이유"). 기본값은 1240px 중앙 정렬이고, 본문이 그 폭이 아닌 화면
   * (`/admin/docs` 폭 제한 없음 · `/admin/channel-talk` max-w-5xl 좌측 정렬)만 자기 폭을 넘긴다.
   * 1480 미만 뷰포트에서는 어차피 상한이 걸리지 않아 네 화면의 렌더 결과가 같다.
   */
  contentClassName?: string
  /** 바깥 래퍼 추가 클래스. */
  className?: string
}

const DEFAULT_CONTENT_CLASS = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8"

// 웜 뉴트럴(내부) vs Classin Green(외부) — DESIGN.md 팔레트만 사용, 세 번째 예외 토큰 없음(§8).
const MODE_ACCENT: Record<CsConsoleMode, { activeTab: string; activeItem: string; underline: string }> = {
  customer: {
    activeTab: "bg-[#084734] text-white",
    activeItem: "text-[#084734]",
    underline: "bg-[#084734]",
  },
  internal: {
    activeTab: "bg-[#31302E] text-white",
    activeItem: "text-[#31302E]",
    underline: "bg-[#31302E]",
  },
}

export default function CsConsoleNav(props: CsConsoleNavProps) {
  // useSearchParams는 프리렌더 시 Suspense 경계를 요구한다(AdminSidebar와 같은 이유).
  // fallback 높이는 실제 2단 바(pt-3 + 36 + mt-1.5 + 36)와 같게 잡아 스트리밍 중 점프를 막는다.
  return (
    <Suspense fallback={<div className="h-[90px] border-b border-black/[0.08] bg-white" />}>
      <CsConsoleNavContent {...props} />
    </Suspense>
  )
}

function CsConsoleNavContent({ role, contentClassName, className }: CsConsoleNavProps) {
  const pathname = usePathname() ?? ""
  const searchParams = useSearchParams()
  const router = useRouter()
  // role prop이 없으면 사이드바와 같은 세션 소스(sessionStorage.admin_role)에서 읽는다.
  // 마운트 시 동기 초기화라 콘솔 안에서 화면을 옮겨도 메뉴가 깜빡이지 않는다
  // (AdminSidebar의 collapsed와 동일한 lazy-initializer 패턴).
  // 서버 렌더에는 값이 없어 기본(ADMIN)으로 전체 메뉴를 그린다 — 내비 가시성은 권한 경계가
  // 아니고(실제 경계는 각 API의 verifyAdmin), 항목이 빠진 채 늦게 나타나는 것보다 낫다.
  const [sessionRole] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return sessionStorage.getItem("admin_role")
  })

  const normalizedRole = normalizeAdminRole(role ?? sessionRole ?? "")
  const mode = resolveCsConsoleMode(pathname)
  const spec = CS_CONSOLE_MODES.find((entry) => entry.mode === mode) ?? CS_CONSOLE_MODES[0]

  const visibleItems = useMemo(
    () => spec.items.filter((item) => item.enabled !== false && item.roles.includes(normalizedRole)),
    [spec, normalizedRole]
  )

  // 하이라이트 양보 판정용 형제 목록 — 렌더되는 항목의 href + 그룹 대체 href 전부.
  const siblings = useMemo(
    () =>
      visibleItems.flatMap((item) => [
        { href: item.href },
        ...(item.activeWhen ?? []).map((href) => ({ href })),
      ]),
    [visibleItems]
  )

  // 호버 워밍 — 사이드바(AdminSidebar.scheduleWarmAdminTab)와 같은 규칙을 콘솔 메뉴에도 건다.
  // NAV_WARMUP_REQUESTS의 키는 href 문자열(쿼리 포함)과 완전히 같아야 적중하므로
  // /admin/docs?tab=quality 같은 콘솔 전용 딥링크 키를 사이드바 맵에 함께 등록해 뒀다.
  // 180ms 지연으로 스쳐 지나가는 호버는 요청을 만들지 않고, href당 1회만 데운다.
  const warmedHrefs = useRef<Set<string>>(new Set())
  const warmTimerRef = useRef<number | null>(null)

  const cancelWarm = useCallback(() => {
    if (warmTimerRef.current === null) return
    window.clearTimeout(warmTimerRef.current)
    warmTimerRef.current = null
  }, [])

  const scheduleWarm = useCallback(
    (href: string) => {
      try {
        router.prefetch(href)
      } catch {
        // 프리페치는 최적화일 뿐이라 실패해도 무시한다.
      }
      if (warmedHrefs.current.has(href)) return

      cancelWarm()
      warmTimerRef.current = window.setTimeout(() => {
        warmTimerRef.current = null
        if (warmedHrefs.current.has(href)) return
        warmedHrefs.current.add(href)

        const entry = NAV_WARMUP_REQUESTS[href]
        const urls = typeof entry === "function" ? entry() : entry ?? []
        for (const url of urls) {
          void warmAdminRequestCache(url, { ttlMs: 60_000 })
        }
      }, 180)
    },
    [cancelWarm, router]
  )

  useEffect(() => () => cancelWarm(), [cancelWarm])

  const accent = MODE_ACCENT[mode]
  const isItemActive = (item: CsConsoleNavItem) =>
    [item.href, ...(item.activeWhen ?? [])].some((href) =>
      isNavActive(href, { pathname, searchParams, siblings })
    )

  return (
    <div className={`border-b border-black/[0.08] bg-white ${className ?? ""}`}>
      <div className={contentClassName ?? DEFAULT_CONTENT_CLASS}>
        {/* 상단 행 — 모드 탭. 클릭하면 그 축의 첫 화면으로 간다(§5). */}
        <nav aria-label="CS 콘솔 축" className="flex items-center gap-1 pt-3">
          {CS_CONSOLE_MODES.map((entry) => {
            const active = entry.mode === mode
            return (
              <Link
                key={entry.mode}
                href={entry.entryHref}
                aria-current={active ? "true" : undefined}
                onMouseEnter={() => scheduleWarm(entry.entryHref)}
                onFocus={() => scheduleWarm(entry.entryHref)}
                onMouseLeave={cancelWarm}
                onBlur={cancelWarm}
                className={`inline-flex min-h-9 items-center rounded-full px-3.5 text-[12.5px] font-semibold transition-colors ${
                  active
                    ? MODE_ACCENT[entry.mode].activeTab
                    : "text-[#615D59] hover:bg-[#F6F5F4] hover:text-[#111110]"
                }`}
              >
                {entry.label}
              </Link>
            )
          })}
        </nav>

        {/* 하단 행 — 현재 모드의 가로 메뉴. lg 미만에서는 가로 스크롤 스트립으로 붕괴한다. */}
        <nav
          aria-label={`CS 콘솔 ${spec.label} 메뉴`}
          className="admin-scroll-snap-x no-scrollbar -mx-4 mt-1.5 flex gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:overflow-x-visible lg:px-0"
        >
          {visibleItems.map((item) => {
            const active = isItemActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => scheduleWarm(item.href)}
                onFocus={() => scheduleWarm(item.href)}
                onMouseLeave={cancelWarm}
                onBlur={cancelWarm}
                className={`group relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 pb-2.5 pt-2 text-[13px] font-medium transition-colors ${
                  active ? accent.activeItem : "text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" aria-hidden />
                <span>{item.label}</span>
                <span
                  aria-hidden
                  className={`absolute inset-x-1.5 bottom-0 h-[2px] rounded-full transition-colors ${
                    active ? accent.underline : "bg-transparent group-hover:bg-[#A39E98]/40"
                  }`}
                />
              </Link>
            )
          })}
        </nav>
      </div>

      {/* 내부 모드 전용 경고 바 — 문안은 §8 그대로. */}
      {mode === "internal" ? (
        <div className="border-t border-black/[0.08] bg-[#F6F5F4]">
          <div className={contentClassName ?? DEFAULT_CONTENT_CLASS}>
            <p className="py-2 text-[11.5px] font-medium leading-relaxed text-[#615D59]">
              {CS_INTERNAL_WARNING}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
