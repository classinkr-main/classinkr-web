"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Search } from "lucide-react"

interface Command {
  label: string
  href: string
  group: string
  keywords?: string
}

// 어드민 전역 이동·검색 대상. 사이드바 상단 항목 + 자주 가는 하위 라우트 + 빠른 작업.
const COMMANDS: Command[] = [
  { group: "운영", label: "Overview", href: "/admin/overview", keywords: "홈 대시보드 overview home" },
  { group: "운영", label: "CRM 홈", href: "/admin/crm", keywords: "crm 한국팀 매출 korea" },
  { group: "운영", label: "고객 (Accounts)", href: "/admin/crm/customers/accounts", keywords: "고객 거래처 account customer" },
  { group: "운영", label: "리드", href: "/admin/crm/customers/leads", keywords: "리드 잠재고객 lead 문의" },
  { group: "운영", label: "Deals", href: "/admin/crm/deals", keywords: "딜 거래 오더 order deal" },
  { group: "운영", label: "캘린더", href: "/admin/calendar", keywords: "캘린더 일정 calendar schedule" },
  { group: "운영", label: "견적·문서", href: "/admin/quotes", keywords: "견적 계약 영수증 quote contract receipt" },
  { group: "성장", label: "캠페인", href: "/admin/campaigns", keywords: "캠페인 이메일 campaign email" },
  { group: "성장", label: "콘텐츠 (블로그)", href: "/admin/blog", keywords: "블로그 콘텐츠 blog content" },
  { group: "성장", label: "새 블로그 글 작성", href: "/admin/blog/new", keywords: "새글 작성 write new post 블로그" },
  { group: "성장", label: "리드마그넷", href: "/admin/lead-magnets", keywords: "리드마그넷 lead magnet" },
  { group: "성장", label: "공개 행사", href: "/admin/events", keywords: "행사 이벤트 event 웨비나" },
  { group: "성장", label: "새 행사 등록", href: "/admin/events/new", keywords: "새 행사 등록 new event" },
  { group: "성장", label: "가이드 문서", href: "/admin/docs", keywords: "가이드 문서 docs guide" },
  { group: "성장", label: "문서 보강 큐", href: "/admin/docs/gaps", keywords: "챗봇 질문 보강 큐 gaps faq 문서 검색 초안" },
  { group: "분석", label: "지사 관리", href: "/admin/branch", keywords: "지사 브랜치 branch 매출" },
  { group: "분석", label: "Analytics", href: "/admin/analytics", keywords: "analytics 분석 통계" },
  { group: "시스템", label: "Settings", href: "/admin/settings", keywords: "설정 settings 환경" },
  { group: "시스템", label: "회원 관리", href: "/admin/users", keywords: "회원 사용자 users 권한" },
  { group: "시스템", label: "Dev Mode", href: "/admin/dev", keywords: "개발 dev 버그 패치노트 roadmap" },
]

export default function AdminCommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COMMANDS
    return COMMANDS.filter(
      (cmd) => cmd.label.toLowerCase().includes(q) || (cmd.keywords ?? "").toLowerCase().includes(q)
    )
  }, [query])

  // Cmd/Ctrl+K 토글 (어디서든). 입력 중에도 동작.
  // 사이드바 검색 버튼 등에서 커스텀 이벤트로도 열 수 있다(발견성).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    const onOpenEvent = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("admin:open-command-palette", onOpenEvent)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("admin:open-command-palette", onOpenEvent)
    }
  }, [])

  // 열릴 때 입력 포커스(DOM 사이드 이펙트만 — 상태 초기화는 닫을 때 수행).
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  // 닫을 때 검색어·선택을 초기화해 다음 열기는 항상 깨끗한 상태로 시작한다.
  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setSelected(0)
  }, [])

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
    } else if (event.key === "Escape") {
      event.preventDefault()
      close()
    }
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
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[#f0f0ec] px-4">
          <Search className="h-4 w-4 shrink-0 text-[#1a1a1a]/35" />
          <input
            ref={inputRef}
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

        <div className="max-h-[52vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">일치하는 항목이 없습니다.</p>
          ) : (
            filtered.map((cmd, index) => {
              const active = index === safeSelected
              return (
                <button
                  key={cmd.href + cmd.label}
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
