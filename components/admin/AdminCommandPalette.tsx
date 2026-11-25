"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CornerDownLeft, Search } from "lucide-react"
import {
  ADMIN_NAV,
  ADMIN_NAV_SECTIONS,
  ADMIN_NAV_SECTION_META,
  type AdminNavItem,
} from "./admin-nav"
import {
  getAccessibleAdminNavItems,
  normalizeNavOverrides,
  resolveAdminNavAccess,
  type NavAccessContext,
} from "./admin-nav-access"
import { PALETTE_CHILD_COMMANDS } from "./admin-palette-children"
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


// 이동이 아닌 셸 동작 — nav 항목과 무관하게 항상 목록 끝(운영·시스템 그룹)에 붙는다.
const PALETTE_ACTION_COMMANDS: Array<Omit<AdminCommand, "group">> = [
  {
    label: "내 사이드바 편집",
    href: "",
    event: ADMIN_OPEN_NAV_EDITOR_EVENT,
    keywords: "내 사이드바 편집 탭 숨기기 숨김 다시 표시 상시 접힘 접기 기타 배치 메뉴 정리 sidebar nav menu edit hide customize",
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
 * CRM 하위 탭(crm: 키) 숨김도 마찬가지다 — 자식 명령(PALETTE_CHILD_COMMANDS)은 정적이라
 * 숨김으로 걸러지지 않는다(nav-crm-subnav.test.ts 고정).
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
