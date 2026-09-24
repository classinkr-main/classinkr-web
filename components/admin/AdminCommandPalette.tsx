"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Search } from "lucide-react"
import {
  ADMIN_NAV,
  ADMIN_NAV_SECTIONS,
  ADMIN_NAV_SECTION_META,
  CRM_CHILD_NAV,
  type AdminNavItem,
} from "./admin-nav"
import {
  getAccessibleAdminNavItems,
  normalizeNavOverrides,
  resolveAdminNavAccess,
  type NavAccessContext,
} from "./admin-nav-access"
import { useDialogFocus } from "./use-dialog-focus"

const PALETTE_LISTBOX_ID = "admin-command-palette-listbox"
const paletteOptionId = (index: number) => `admin-command-palette-option-${index}`

export interface AdminCommand {
  label: string
  /** 이동 대상. 이벤트형 명령(event)은 이동하지 않으므로 빈 문자열이다. */
  href: string
  group: string
  keywords?: string
  /**
   * 설정되면 이동 대신 window 에 이 이름의 CustomEvent 를 보낸다 — 화면 이동이 아닌
   * 셸 동작(예: 사이드바 편집기 열기)을 팔레트에서 실행하기 위한 선택 필드.
   */
  event?: string
}

// "내 사이드바 편집" 명령이 보내는 이벤트 — 사이드바(AdminSidebar)가 받아 편집기를 연다.
// 정본은 my-nav-preferences.ts 하나다(기존 import 경로 호환을 위해 여기서 재수출한다).
import { ADMIN_OPEN_NAV_EDITOR_EVENT } from "./my-nav-preferences"
export { ADMIN_OPEN_NAV_EDITOR_EVENT }

export interface AdminCommandPaletteAccessProps {
  role: string
  navOverrides: Record<string, string>
}

interface AdminCommandPaletteProps extends AdminCommandPaletteAccessProps {
  open: boolean
  onClose: () => void
}

// 팔레트 전용 딥링크 — nav에는 없는 하위 라우트·빠른 작업. 부모 nav href 바로 뒤에 이어 붙는다.
const PALETTE_CHILD_COMMANDS: Record<string, Array<Omit<AdminCommand, "group">>> = {
  "/admin/calendar": [
    { label: "행사 관리", href: "/admin/events", keywords: "행사 공개 행사 이벤트 웨비나 event 관리" },
    { label: "새 행사 등록", href: "/admin/events/new", keywords: "새 행사 등록 new event" },
  ],
  "/admin/crm": [
    // CRM 드릴인 하위 nav(admin-nav SSOT) 파생 — '현황'(/admin/crm)은 부모 항목과 중복이라 제외.
    ...CRM_CHILD_NAV.filter((child) => child.href !== "/admin/crm").map((child) => ({
      label: `CRM ${child.label}`,
      href: child.href,
      keywords: child.keywords,
    })),
    { label: "고객 (Accounts)", href: "/admin/crm/customers/accounts", keywords: "고객 거래처 account customer" },
    { label: "리드", href: "/admin/crm/customers/leads", keywords: "리드 잠재고객 lead 문의" },
    // 고객 보조 탭(CrmSubnav)과 같은 라벨. 2026-09-20·21 신설 화면이라 ⌘K 도달이 빠져 있었다.
    { label: "접수", href: "/admin/crm/customers/intake", keywords: "접수 쇼룸 예약 도입 신청 접수 큐 intake showroom booking application queue" },
    { label: "지도", href: "/admin/crm/customers/map", keywords: "고객 지역 지도 분포 지역분포 원천 map source region" },
    { label: "태그", href: "/admin/crm/customers/tags", keywords: "태그 라벨 고객 분류 태그 관리 tag tags label" },
    { label: "Deals", href: "/admin/crm/deals", keywords: "딜 거래 오더 order deal" },
    // 화면 제목(rev-sheet/page.tsx h1)·교차 링크가 전부 "매출시트"라 그 표기로 통일했다.
    // 옛 라벨 "REV 스냅샷"은 검색어로 남겨 손에 익은 검색이 계속 걸리게 한다.
    { label: "매출시트", href: "/admin/crm/deals/rev-sheet", keywords: "매출시트 매출 시트 rev 스냅샷 snapshot revenue sheet 검수" },
    { label: "오더·설치", href: "/admin/crm/deals/orders", keywords: "오더 설치 일정 주문 order installation" },
    { label: "워크스페이스", href: "/admin/crm/deals/kpi", keywords: "파트너 계약 정산 큐 kpi workspace" },
    { label: "인사이트", href: "/admin/crm/insights", keywords: "crm 인사이트 분석 insight analytics" },
  ],
  // 견적 빠른 작업은 redirect 스텁(app/admin/quotes/{new,recording-studio,ai-suite}/page.tsx)을
  // 거치지 않고 스텁이 보내는 최종 URL로 곧장 간다 — 서버 왕복 한 번과 히스토리 한 칸을 던다.
  // 스텁 파일은 북마크·외부 링크 보호용으로 남아 있다(목적지를 바꾸면 여기도 함께 바꿀 것).
  "/admin/quotes": [
    { label: "빠른 견적 작성", href: "/admin/quotes?tab=hardware&action=new", keywords: "견적 작성 빠른 견적 quick quote" },
    { label: "녹화 세트 견적", href: "/admin/quotes?tab=hardware&action=recording_studio", keywords: "녹화 세트 omo1 studio recording 견적" },
    { label: "AI Suite 견적", href: "/admin/quotes?tab=hardware&action=online_suite", keywords: "ai suite 구독형 온라인 패키지 견적" },
  ],
  "/admin/campaigns": [
    // 라벨은 허브 탭 이름(lib/marketing/hub-tabs.ts CAMPAIGN_TABS의 email 탭 = "메시지")과 같다.
    { label: "메시지", href: "/admin/campaigns?tab=email", keywords: "메시지 발송 이메일 자동화 문자 카카오 구독자 message email sms kakao automation logs" },
    // 캠페인 관리·마케팅 프로젝트는 그 자체가 사이드바(ADMIN_NAV) 항목이라 평소에는 최상위 명령으로
    // 뜨고 여기 자식은 중복이라 방출되지 않는다(buildAdminCommands). 사이드바 SSOT에서 빠지는 날
    // (허브 흡수 결정 D2) 이 자식이 ⌘K 도달 경로를 자동으로 이어받는 안전망이다.
    { label: "캠페인 관리", href: "/admin/campaigns/manage", keywords: "캠페인 관리 크로스채널 통합 롤업 연결 campaign manage cross-channel rollup" },
    { label: "마케팅 프로젝트", href: "/admin/campaigns/projects", keywords: "마케팅 프로젝트 캠페인 묶음 롤업 예산 소진 project rollup budget" },
  ],
  "/admin/blog": [
    { label: "새 블로그 글 작성", href: "/admin/blog/new", keywords: "새글 작성 write new post 블로그" },
  ],
  "/admin/analytics": [
    { label: "방문자·트래픽", href: "/admin/traffic", keywords: "방문자 트래픽 홈페이지 흐름 전환 traffic visitor" },
  ],
  // CS 진입점 단일화(2026-08-18) — 사이드바 cs 섹션이 CS 콘솔 1항목이 되면서 가이드 문서·내부 CS의
  // nav 항목도 콘솔 가로 메뉴로 흡수됐다. URL은 전부 그대로이므로 ⌘K 도달성은 자식 커맨드로 보존한다
  // (라벨은 콘솔 메뉴명과 일치시켜 두 표면의 어휘가 갈리지 않게 한다).
  //
  // 자식 커맨드는 부모 nav 항목이 ADMIN_COMMANDS에 살아남을 때만 방출된다(아래 flatMap).
  // `/admin/chatbot`은 같은 단일화로 MOON_ONLY에서 풀려 전 프리셋 접근 + `staff` 프리셋 상시가
  // 됐으므로 이제 안전한 숙주다(이전 숙주는 그때의 OPEN 묶음이던 `/admin/docs` — nav에서 내려가며
  // 자식들이 이 항목으로 옮겨왔다). section이 같아(cs) 그룹 라벨("고객 지원")은 이관 전후로 동일하다.
  "/admin/chatbot": [
    { label: "가이드 문서", href: "/admin/docs", keywords: "가이드 문서 docs guide 챗봇 faq 카테고리 리디렉트 발행" },
    { label: "새 가이드 문서", href: "/admin/docs/new", keywords: "가이드 문서 새 문서 작성 new docs guide" },
    { label: "추천 질문 관리", href: "/admin/docs?tab=recommended", keywords: "추천 질문 starter chatbot recommended" },
    { label: "상담 Inbox (채널톡)", href: "/admin/channel-talk", keywords: "채널톡 상담 문의 채팅 channel talk chat inbox" },
    { label: "미해결 큐", href: "/admin/docs?tab=gaps", keywords: "보강 큐 gaps faq 문서 검색 초안 질문 패턴 미해결" },
    { label: "AI 품질 검수", href: "/admin/docs?tab=quality", keywords: "ai 품질 평가 알파 준비도 quality readiness" },
    { label: "내부 CS", href: "/admin/cs-chatbot", keywords: "내부 cs 챗봇 상담 도우미 소통 가이드 템플릿 대기열 본사 확인 운영 도구 internal support assistant" },
  ],
  "/admin/settings": [
    { label: "통합 설정", href: "/admin/settings?tab=integrations", keywords: "설정 settings integrations webhook api key" },
    { label: "회원 관리", href: "/admin/settings?tab=members", keywords: "회원 사용자 권한 계정 users members role" },
  ],
}

// 이동이 아닌 셸 동작 — nav 항목과 무관하게 항상 목록 끝(운영·시스템 그룹)에 붙는다.
const PALETTE_ACTION_COMMANDS: Array<Omit<AdminCommand, "group">> = [
  {
    label: "내 사이드바 편집",
    href: "",
    event: ADMIN_OPEN_NAV_EDITOR_EVENT,
    keywords: "내 사이드바 편집 탭 숨기기 숨김 다시 표시 상시 기타 배치 메뉴 정리 sidebar nav menu edit hide customize",
  },
]

// 사이드바 SSOT의 모든 최상위 href — 자식 명령이 최상위 명령과 겹치면 자식을 방출하지 않는다.
const TOP_LEVEL_NAV_HREFS = new Set(ADMIN_NAV.map((item) => item.href))

// 어드민 전역 이동·검색 대상 — 사이드바 nav(admin-nav SSOT)에서 파생.
// 그룹은 사이드바 섹션 라벨과 동일해 사이드바와 팔레트의 IA가 항상 일치한다.
function buildAdminCommands(items: readonly AdminNavItem[]): AdminCommand[] {
  const accessibleHrefs = new Set(items.map((item) => item.href))

  const navCommands = ADMIN_NAV_SECTIONS.flatMap((section) => {
    const group = ADMIN_NAV_SECTION_META[section].label
    return ADMIN_NAV.filter(
      (item) => item.section === section && accessibleHrefs.has(item.href)
    ).flatMap((item) => [
      { group, label: item.label, href: item.href, keywords: item.keywords },
      ...(PALETTE_CHILD_COMMANDS[item.href] ?? [])
        .filter((child) => !TOP_LEVEL_NAV_HREFS.has(child.href))
        .map((child) => ({ group, ...child })),
    ])
  })

  const actionGroup = ADMIN_NAV_SECTION_META.system.label
  return [...navCommands, ...PALETTE_ACTION_COMMANDS.map((command) => ({ group: actionGroup, ...command }))]
}

/** 정적 전체 인벤토리 — 문서/회귀 테스트용. 실제 UI는 사용자별 resolveAdminCommands를 쓴다. */
export const ADMIN_COMMANDS: AdminCommand[] = buildAdminCommands(ADMIN_NAV)

/**
 * 사이드바와 같은 배치 해석(전원 공통 기본 + 사람별 오버라이드)을 거친 명령 목록.
 * getAccessibleAdminNavItems 는 배치·숨김과 무관하게 ADMIN_NAV 전체를 돌려준다 — 그래서
 * 사이드바에서 숨긴 탭(기본 숨김 포함)도 ⌘K 에서는 계속 검색된다(command-palette.test.ts 고정).
 */
export function resolveAdminCommands(ctx: NavAccessContext): AdminCommand[] {
  return buildAdminCommands(getAccessibleAdminNavItems(resolveAdminNavAccess(ctx)))
}

export default function AdminCommandPalette({
  open,
  onClose,
  role,
  navOverrides,
}: AdminCommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const commands = useMemo(
    () =>
      resolveAdminCommands({
        role,
        overrides: normalizeNavOverrides(navOverrides),
      }),
    [role, navOverrides]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || (cmd.keywords ?? "").toLowerCase().includes(q)
    )
  }, [commands, query])

  // 닫을 때 검색어·선택을 초기화해 다음 열기는 항상 깨끗한 상태로 시작한다.
  const close = useCallback(() => {
    setQuery("")
    setSelected(0)
    onClose()
  }, [onClose])

  // 포커스 이동(열릴 때 검색창)·Escape 닫기·이전 포커스 복귀는 공용 훅으로 통일
  // (품질 웨이브 3 — 항목 6, DealModal과 동일한 use-dialog-focus). 기존 setTimeout(0)
  // 트릭은 DealModal도 쓰지 않는 패턴이라 제거 — 커밋 후 이펙트는 마운트/커밋 다음에
  // 실행되므로 동기 focus()로 충분하다.
  useDialogFocus(open, close, inputRef)

  // 이벤트형 명령은 이동하지 않고 셸에 이벤트만 보낸다. 닫기와 같은 핸들러에서 보내므로 두
  // 상태 변경이 한 커밋에 묶이고, 팔레트의 포커스 복귀(언마운트 정리)가 받는 쪽 다이얼로그의
  // 포커스 이동(마운트 이펙트)보다 먼저 실행된다.
  const run = useCallback(
    (command: AdminCommand) => {
      close()
      if (command.event) {
        window.dispatchEvent(new CustomEvent(command.event))
        return
      }
      router.push(command.href)
    },
    [close, router]
  )

  const onListKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelected((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelected((prev) => Math.max(prev - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const target = filtered[selected]
      if (target) run(target)
    }
    // Escape는 useDialogFocus의 전역 document keydown 리스너가 처리한다(위 참조).
  }

  if (!open) return null

  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1))

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/30 px-4 pt-[12vh]"
      onMouseDown={close}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="빠른 이동 · 검색"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#f0f0ec] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={PALETTE_LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={filtered.length > 0 ? paletteOptionId(safeSelected) : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelected(0)
            }}
            onKeyDown={onListKeyDown}
            placeholder="페이지 이동 · 검색 (예: 리드, 캠페인, 견적)"
            className="h-12 w-full bg-transparent text-[14px] text-[#111110] placeholder:text-[#1a1a1a]/30 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/40 sm:inline">
            ESC
          </kbd>
        </div>

        <div id={PALETTE_LISTBOX_ID} role="listbox" aria-label="검색 결과" className="max-h-[52vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">일치하는 항목이 없습니다.</p>
          ) : (
            filtered.map((cmd, index) => {
              const active = index === safeSelected
              return (
                <button
                  key={(cmd.event ?? cmd.href) + cmd.label}
                  id={paletteOptionId(index)}
                  role="option"
                  aria-selected={active}
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(cmd)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors ${
                    active ? "bg-[#ECFDF5]" : "hover:bg-[#fafaf8]"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#084734]" : "text-[#1a1a1a]/25"}`} />
                    <span className="truncate text-[13px] font-medium text-[#111110]">{cmd.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[11px] text-[#1a1a1a]/30">{cmd.group}</span>
                    {active ? <CornerDownLeft className="h-3.5 w-3.5 text-[#084734]" /> : null}
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#f0f0ec] px-4 py-2 text-[11px] text-[#1a1a1a]/35">
          <span>↑↓ 이동 · ↵ 열기</span>
          <span>⌘K / Ctrl+K</span>
        </div>
      </div>
    </div>
  )
}
