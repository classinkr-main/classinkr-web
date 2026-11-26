"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Maximize2, MapPin, PanelRight, Plus, X } from "lucide-react"

import { FOCUSABLE_SELECTOR, nextTabIndex, nextTrapIndex } from "@/lib/admin-ai/a11y"
import { adminAiStore, countActionableOrders, selectPendingOrders, type AdminAiState } from "@/lib/admin-ai/store"
import type { AdminAiPageContext } from "@/lib/admin-ai/types"
import { AdminAiAnnouncer } from "./AdminAiAnnouncer"
import { AdminAiComposer } from "./AdminAiComposer"
import { AdminAiConversation } from "./AdminAiConversation"
import { AdminAiHome } from "./AdminAiHome"
import { GalmaebotAvatar } from "./GalmaebotAvatar"
import { NewConversationToast } from "./NewConversationToast"
import { OrderQueue } from "./OrderQueue"
import { useSheetMode } from "./use-sheet-mode"

const VIEWS = ["chat", "orders"] as const
const VIEW_LABEL = { chat: "대화", orders: "오더" } as const
const tabId = (view: (typeof VIEWS)[number]) => `admin-ai-widget-tab-${view}`
const panelId = (view: (typeof VIEWS)[number]) => `admin-ai-widget-panel-${view}`

const ICON_BUTTON =
  "flex h-[30px] w-[30px] items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] aria-pressed:bg-[#F6F5F4] aria-pressed:text-[#111110]"

// Deep Shadow(DESIGN.md §2) — 5레이어, 최대 opacity 0.05.
const DEEP_SHADOW =
  "shadow-[0_23px_52px_rgba(0,0,0,0.05),0_14px_28px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.03),0_2px_5px_rgba(0,0,0,0.02),0_0.5px_1.5px_rgba(0,0,0,0.01)]"

/**
 * 갈매봇 위젯 패널. 한 컴포넌트가 세 모습을 가진다.
 *  - lg 미만: 하단 시트(화면 높이의 80%) + 뒤 가림막
 *  - lg 이상: 우하단에 떠 있는 위젯
 *  - xl 이상 + 옆에 붙임: 오른쪽 전체 높이 패널(본문은 셸이 밀어낸다)
 */
export default function AdminAiPanel({
  state,
  context,
  launcherBottom,
}: {
  state: AdminAiState
  context: AdminAiPageContext
  /** 갈매봇 버튼의 아래 여백(px). 떠 있는 위젯은 버튼 바로 위에 놓인다. */
  launcherBottom: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const pending = selectPendingOrders(state)
  const actionable = countActionableOrders(state)
  const docked = state.size === "docked"
  const demo = adminAiStore.mode === "demo"
  // 좁은 화면에서는 패널이 화면을 덮는 모달 시트다 — 포커스를 가두고 뒤 화면을 비활성으로 둔다.
  const sheet = useSheetMode()

  // 열릴 때 입력창으로 — 확인 버튼이 아니라 입력창이다(Enter 연타로 오더가 실행되지 않게).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // 시트일 때 뒤 화면(시트의 조상 쪽 형제들)을 inert 로 — 스크린리더·Tab·클릭이 시트 밖으로 새지 않는다.
  // 가림막(data-ai-keep)만 살려 둔다: 눌러서 닫을 수 있어야 한다.
  useEffect(() => {
    if (!sheet) return
    const section = sectionRef.current
    if (!section) return
    const inerted: Element[] = []
    let node: Element = section
    while (node.parentElement && node !== document.body) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute("data-ai-keep") || sibling.hasAttribute("inert")) continue
        sibling.setAttribute("inert", "")
        inerted.push(sibling)
      }
      node = node.parentElement
    }
    return () => inerted.forEach((element) => element.removeAttribute("inert"))
  }, [sheet])

  // Esc — 수정 중인 카드가 있으면 그것부터 수정 취소로 되돌리고(패널은 열어 둔다), 없으면 닫는다.
  // 패널 안이 아니어도 받되, 페이지의 다른 입력란에 포커스가 있을 때(넓은 화면)는 건드리지 않는다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return
      const active = document.activeElement
      const inside = sectionRef.current?.contains(active) ?? false
      const idle = !active || active === document.body
      if (!sheet && !inside && !idle) return
      if (adminAiStore.revertEditingOrders()) {
        event.preventDefault()
        return
      }
      adminAiStore.setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [sheet])

  const onSectionKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!sheet || event.key !== "Tab") return
    const section = sectionRef.current
    if (!section) return
    const focusables = Array.from(section.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    const next = nextTrapIndex(
      focusables.length,
      focusables.indexOf(document.activeElement as HTMLElement),
      event.shiftKey
    )
    if (next === null) return
    event.preventDefault()
    ;(next < 0 ? section : focusables[next]).focus()
  }

  const onTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = nextTabIndex(event.key, index, VIEWS.length)
    if (next === null) return
    event.preventDefault()
    const view = VIEWS[next]
    adminAiStore.setView(view)
    tabRefs.current[view]?.focus()
  }

  return (
    <>
      <button
        type="button"
        aria-label="갈매봇 닫기"
        tabIndex={-1}
        data-ai-keep=""
        onClick={() => adminAiStore.setOpen(false)}
        className="fixed inset-0 z-50 bg-[#111110]/30 lg:hidden"
      />
      <section
        ref={sectionRef}
        role="dialog"
        aria-label="갈매봇"
        aria-modal={sheet ? "true" : undefined}
        tabIndex={-1}
        onKeyDown={onSectionKeyDown}
        style={{ "--ai-panel-bottom": `${launcherBottom + 68}px` } as React.CSSProperties}
        className={`fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col overflow-hidden focus:outline-none rounded-t-[20px] border border-[#E8E8E4] bg-white ${DEEP_SHADOW} lg:inset-x-auto lg:bottom-[var(--ai-panel-bottom)] lg:right-6 lg:z-40 lg:h-[min(660px,calc(100dvh-var(--ai-panel-bottom)-1.5rem))] lg:w-[408px] lg:rounded-2xl ${
          docked
            ? "xl:bottom-0 xl:right-0 xl:top-0 xl:h-auto xl:w-[420px] xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none"
            : ""
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[#E8E8E4] lg:hidden" aria-hidden="true" />

        <header className="@container flex shrink-0 items-center gap-2.5 border-b border-[#E8E8E4] py-2.5 pl-3.5 pr-2.5">
          <GalmaebotAvatar size={36} />
          <div className="min-w-0">
            <h2 className="text-[14px] font-bold leading-[1.2] tracking-[-0.01em] text-[#111110]">
              갈매봇
            </h2>
            <p className="text-[11px] text-[#A39E98]">
              {demo ? <span className="font-semibold text-[#A8741A]">시안 · 샘플 데이터</span> : "묻기 · 오더"}
            </p>
          </div>
          <span className="flex-1" />
          {/* 확인창 없이 한 번. 대화가 없으면 비활성. 폭이 좁으면 아이콘만. 실수는 6초 안에 되돌린다. */}
          <button
            type="button"
            title="새 대화"
            aria-label="새 대화"
            disabled={state.messages.length === 0}
            onClick={() => {
              adminAiStore.newConversation()
              // 누른 버튼은 곧 꺼진다 — 포커스가 문서 끝으로 떨어져 Esc 가 패널을 닫지 않도록 입력창으로 옮긴다.
              requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
            }}
            className="flex h-[30px] items-center justify-center gap-1 rounded-md px-[7px] text-[12px] font-semibold text-[#31302E] transition hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:text-[#A39E98] disabled:hover:bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
          >
            <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
            <span className="hidden @[380px]:inline">새 대화</span>
          </button>
          <button
            type="button"
            className={`${ICON_BUTTON} hidden xl:flex`}
            title={docked ? "떠 있는 위젯으로" : "옆에 붙여 넓게 보기"}
            aria-label={docked ? "떠 있는 위젯으로" : "옆에 붙여 넓게 보기"}
            aria-pressed={docked}
            onClick={() => adminAiStore.setSize(docked ? "floating" : "docked")}
          >
            <PanelRight className="h-[15px] w-[15px]" aria-hidden="true" />
          </button>
          <Link
            href="/admin/ai"
            className={ICON_BUTTON}
            title="AI 올인원 탭에서 열기"
            aria-label="AI 올인원 탭에서 열기"
          >
            <Maximize2 className="h-[15px] w-[15px]" aria-hidden="true" />
          </Link>
          <button
            type="button"
            className={ICON_BUTTON}
            title="닫기"
            aria-label="닫기"
            onClick={() => adminAiStore.setOpen(false)}
          >
            <X className="h-[15px] w-[15px]" aria-hidden="true" />
          </button>
        </header>

        <div role="tablist" aria-label="갈매봇 보기" className="flex shrink-0 gap-[18px] border-b border-[#E8E8E4] px-4 text-[12px] font-semibold">
          {VIEWS.map((view, index) => {
            const selected = state.view === view
            return (
              <button
                key={view}
                ref={(element) => {
                  tabRefs.current[view] = element
                }}
                id={tabId(view)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId(view)}
                tabIndex={selected ? 0 : -1}
                onClick={() => adminAiStore.setView(view)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`inline-flex items-center gap-[5px] py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] ${
                  selected ? "text-[#111110] shadow-[inset_0_-2px_0_#111110]" : "text-[#A39E98]"
                }`}
              >
                {VIEW_LABEL[view]}
                {view === "orders" && actionable > 0 ? (
                  <span className="tabular-nums text-[#A8741A]">{actionable}</span>
                ) : null}
              </button>
            )
          })}
        </div>

        <AdminAiAnnouncer state={state} />

        {state.view === "chat" ? (
          <div
            role="tabpanel"
            id={panelId("chat")}
            aria-labelledby={tabId("chat")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-[#E8E8E4] bg-[#F6F5F4] px-4 py-[7px] text-[12px] text-[#615D59]">
              <MapPin className="h-[13px] w-[13px] shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate">
                지금 화면{" "}
                <b
                  className={
                    state.contextEnabled
                      ? "font-semibold text-[#111110]"
                      : "font-medium text-[#A39E98] line-through"
                  }
                >
                  {context.label}
                </b>
                {context.entity ? (
                  <span className={state.contextEnabled ? "text-[#111110]" : "text-[#A39E98] line-through"}>
                    {" · "}
                    {context.entity.label}
                  </span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => adminAiStore.setContextEnabled(!state.contextEnabled)}
                className="ml-auto shrink-0 text-[11px] text-[#A39E98] hover:text-[#111110] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
              >
                {state.contextEnabled ? "맥락 끄기" : "맥락 켜기"}
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
              {state.messages.length === 0 ? (
                <AdminAiHome
                  context={context}
                  pendingCount={pending.length}
                  onShowPending={() => adminAiStore.setView("orders")}
                  recentThreads={state.recentThreads}
                />
              ) : (
                <AdminAiConversation state={state} />
              )}
            </div>
            <AdminAiComposer
              key={state.epoch}
              busy={state.busy}
              context={context}
              showShortcut
              inputRef={inputRef}
              className="mx-3 mb-3 shrink-0"
            />
          </div>
        ) : (
          <div
            role="tabpanel"
            id={panelId("orders")}
            aria-labelledby={tabId("orders")}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4"
          >
            <OrderQueue state={state} />
          </div>
        )}

        <NewConversationToast
          state={state}
          className={`absolute inset-x-3 z-10 ${state.view === "chat" ? "bottom-[68px]" : "bottom-3"}`}
        />
      </section>
    </>
  )
}
