"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { Maximize2, MapPin, PanelRight, Plus, X } from "lucide-react"

import { adminAiStore, selectPendingOrders, type AdminAiState } from "@/lib/admin-ai/store"
import type { AdminAiPageContext } from "@/lib/admin-ai/types"
import { AdminAiComposer } from "./AdminAiComposer"
import { AdminAiConversation } from "./AdminAiConversation"
import { AdminAiHome } from "./AdminAiHome"
import { GalmaebotAvatar } from "./GalmaebotAvatar"
import { OrderQueue } from "./OrderQueue"

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
  const pending = selectPendingOrders(state)
  const docked = state.size === "docked"
  const demo = adminAiStore.mode === "demo"

  // 열릴 때 입력창으로 — 확인 버튼이 아니라 입력창이다(Enter 연타로 오더가 실행되지 않게).
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <>
      <button
        type="button"
        aria-label="갈매봇 닫기"
        onClick={() => adminAiStore.setOpen(false)}
        className="fixed inset-0 z-50 bg-[#111110]/30 lg:hidden"
      />
      <section
        role="dialog"
        aria-label="갈매봇"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) adminAiStore.setOpen(false)
        }}
        style={{ "--ai-panel-bottom": `${launcherBottom + 68}px` } as React.CSSProperties}
        className={`fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col overflow-hidden rounded-t-[20px] border border-[#E8E8E4] bg-white ${DEEP_SHADOW} lg:inset-x-auto lg:bottom-[var(--ai-panel-bottom)] lg:right-6 lg:z-40 lg:h-[min(660px,calc(100dvh-var(--ai-panel-bottom)-1.5rem))] lg:w-[408px] lg:rounded-2xl ${
          docked
            ? "xl:bottom-0 xl:right-0 xl:top-0 xl:h-auto xl:w-[420px] xl:rounded-none xl:border-y-0 xl:border-r-0 xl:shadow-none"
            : ""
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[#E8E8E4] lg:hidden" aria-hidden="true" />

        <header className="flex shrink-0 items-center gap-2.5 border-b border-[#E8E8E4] py-2.5 pl-3.5 pr-2.5">
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
          <button
            type="button"
            className={ICON_BUTTON}
            title="새 대화"
            aria-label="새 대화"
            onClick={() => adminAiStore.newConversation()}
          >
            <Plus className="h-[15px] w-[15px]" aria-hidden="true" />
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
          {(["chat", "orders"] as const).map((view) => {
            const selected = state.view === view
            return (
              <button
                key={view}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => adminAiStore.setView(view)}
                className={`inline-flex items-center gap-[5px] py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734] ${
                  selected ? "text-[#111110] shadow-[inset_0_-2px_0_#111110]" : "text-[#A39E98]"
                }`}
              >
                {view === "chat" ? "대화" : "확인 대기"}
                {view === "orders" && pending.length > 0 ? (
                  <span className="tabular-nums text-[#A8741A]">{pending.length}</span>
                ) : null}
              </button>
            )
          })}
        </div>

        {state.view === "chat" ? (
          <>
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
                />
              ) : (
                <AdminAiConversation state={state} />
              )}
            </div>
            <AdminAiComposer
              busy={state.busy}
              context={context}
              showShortcut
              inputRef={inputRef}
              className="mx-3 mb-3 shrink-0"
            />
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4">
            <OrderQueue state={state} />
          </div>
        )}
      </section>
    </>
  )
}
