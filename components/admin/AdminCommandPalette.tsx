"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Search } from "lucide-react"
import {
  ADMIN_NAV,
  ADMIN_NAV_SECTIONS,
  ADMIN_NAV_SECTION_META,
  CRM_CHILD_NAV,
} from "./admin-nav"
import { useDialogFocus } from "./use-dialog-focus"

const PALETTE_LISTBOX_ID = "admin-command-palette-listbox"
const paletteOptionId = (index: number) => `admin-command-palette-option-${index}`

interface Command {
  label: string
  href: string
  group: string
  keywords?: string
}

interface AdminCommandPaletteProps {
  open: boolean
  onClose: () => void
}

// 팔레트 전용 딥링크 — nav에는 없는 하위 라우트·빠른 작업. 부모 nav href 바로 뒤에 이어 붙는다.
const PALETTE_CHILD_COMMANDS: Record<string, Array<Omit<Command, "group">>> = {
  "/admin/crm": [
    // CRM 드릴인 하위 nav(admin-nav SSOT) 파생 — '현황'(/admin/crm)은 부모 항목과 중복이라 제외.
    ...CRM_CHILD_NAV.filter((child) => child.href !== "/admin/crm").map((child) => ({
      label: `CRM ${child.label}`,
      href: child.href,
      keywords: child.keywords,
    })),
    { label: "고객 (Accounts)", href: "/admin/crm/customers/accounts", keywords: "고객 거래처 account customer" },
    { label: "리드", href: "/admin/crm/customers/leads", keywords: "리드 잠재고객 lead 문의" },
    { label: "Deals", href: "/admin/crm/deals", keywords: "딜 거래 오더 order deal" },
  ],
  "/admin/quotes": [
    { label: "빠른 견적 작성", href: "/admin/quotes/new", keywords: "견적 작성 빠른 견적 quick quote" },
    { label: "녹화 세트 견적", href: "/admin/quotes/recording-studio", keywords: "녹화 세트 omo1 studio recording 견적" },
    { label: "AI Suite 견적", href: "/admin/quotes/ai-suite", keywords: "ai suite 구독형 온라인 패키지 견적" },
  ],
  "/admin/campaigns": [
    { label: "이메일 자동화", href: "/admin/campaigns?tab=email", keywords: "이메일 자동화 automation email logs" },
  ],
  "/admin/blog": [
    { label: "새 블로그 글 작성", href: "/admin/blog/new", keywords: "새글 작성 write new post 블로그" },
  ],
  "/admin/events": [
    { label: "새 행사 등록", href: "/admin/events/new", keywords: "새 행사 등록 new event" },
  ],
  // CS 콘솔 IA 재구성(2026-07-27) — 사이드바 cs 섹션이 3항목으로 줄면서 "문서 보강 큐"·"채널톡 상담"
  // 항목이 콘솔 가로 메뉴로 옮겨갔다. URL은 그대로이므로 ⌘K 도달성은 자식 커맨드로 보존한다
  // (라벨은 콘솔 메뉴명과 일치시켜 두 표면의 어휘가 갈리지 않게 한다).
  //
  // 숙주가 `/admin/chatbot`이 아니라 `/admin/docs`인 이유 — 자식 커맨드는 부모 nav 항목이
  // ADMIN_COMMANDS에 살아남을 때만 방출된다(아래 flatMap). 어드민 탭 재구성
  // (docs/active/admin-tab-restructure-2026-07-29.md §5.2)이 `/admin/chatbot`을 MOON_ONLY로
  // 분류해 비-super에게 차단하므로, 그 밑에 두면 팔레트가 접근 필터를 갖는 순간 둘 다 고아가 된다.
  // `/admin/docs`는 같은 표의 `OPEN` 묶음(전 프리셋 접근)이자 `staff` 프리셋 상시라 안전한 숙주다.
  // 두 항목의 section이 같아(cs) 그룹 라벨("고객 지원")은 이관 전후로 동일하다.
  "/admin/docs": [
    { label: "추천 질문 관리", href: "/admin/docs?tab=recommended", keywords: "추천 질문 starter chatbot recommended" },
    { label: "상담 Inbox (채널톡)", href: "/admin/channel-talk", keywords: "채널톡 상담 문의 채팅 channel talk chat inbox" },
    { label: "미해결 큐", href: "/admin/docs?tab=gaps", keywords: "보강 큐 gaps faq 문서 검색 초안 질문 패턴 미해결" },
  ],
  "/admin/settings": [
    { label: "통합 설정", href: "/admin/settings?tab=integrations", keywords: "설정 settings integrations webhook api key" },
  ],
}

// 어드민 전역 이동·검색 대상 — 사이드바 nav(admin-nav SSOT)에서 파생.
// 그룹은 사이드바 섹션 라벨과 동일해 사이드바와 팔레트의 IA가 항상 일치한다.
export const ADMIN_COMMANDS: Command[] = ADMIN_NAV_SECTIONS.flatMap((section) => {
  const group = ADMIN_NAV_SECTION_META[section].label
  return ADMIN_NAV.filter((item) => item.section === section).flatMap((item) => [
    { group, label: item.label, href: item.href, keywords: item.keywords },
    ...(PALETTE_CHILD_COMMANDS[item.href] ?? []).map((child) => ({ group, ...child })),
  ])
})

export default function AdminCommandPalette({ open, onClose }: AdminCommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return ADMIN_COMMANDS
    return ADMIN_COMMANDS.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || (cmd.keywords ?? "").toLowerCase().includes(q)
    )
  }, [query])

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

  const go = useCallback(
    (href: string) => {
      close()
      router.push(href)
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
      if (target) go(target.href)
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
                  key={cmd.href + cmd.label}
                  id={paletteOptionId(index)}
                  role="option"
                  aria-selected={active}
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => go(cmd.href)}
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
