"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

import { adminAiStore, selectPendingOrders } from "@/lib/admin-ai/store"
import { resolveLauncherBottom } from "./floating-slots"
import { GalmaebotAvatar } from "./GalmaebotAvatar"
import { isAdminAiWidgetHidden } from "./page-context"
import { useAdminAiPageContext, useAdminAiState } from "./use-admin-ai"

// 패널은 처음 열 때 불러온다 — 갈매봇을 쓰지 않는 사람의 첫 화면 비용을 늘리지 않는다.
const AdminAiPanel = dynamic(() => import("./AdminAiPanel"), { ssr: false, loading: () => null })

/**
 * 갈매봇 진입점 — 셸(AdminShell)이 로그인 세션이 있을 때만 올린다.
 * ⌘K 는 어디로 갈지, 갈매봇은 무엇을 할지. 단축키는 Ctrl/⌘ + J.
 */
export default function AdminAiLauncher() {
  const pathname = usePathname() ?? "/admin"
  const hidden = isAdminAiWidgetHidden(pathname)
  if (hidden) return null
  return <LauncherBinding pathname={pathname} />
}

function LauncherBinding({ pathname }: { pathname: string }) {
  const state = useAdminAiState()
  const context = useAdminAiPageContext()
  const pendingCount = selectPendingOrders(state).length
  const launcherBottom = resolveLauncherBottom(pathname)
  const docked = state.open && state.size === "docked"

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        adminAiStore.toggleOpen()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <>
      {state.open ? (
        <AdminAiPanel state={state} context={context} launcherBottom={launcherBottom} />
      ) : null}
      <button
        type="button"
        onClick={() => adminAiStore.toggleOpen()}
        aria-label={state.open ? "갈매봇 닫기" : "갈매봇 열기"}
        aria-expanded={state.open}
        title="갈매봇 (Ctrl/⌘ + J)"
        style={{ "--ai-fab-bottom": `${launcherBottom}px` } as React.CSSProperties}
        // 쌓임 순서는 서랍·알림(z-50 이상)보다 아래 — 저장 버튼이나 오류 알림을 덮지 않는다.
        // 모바일에서는 하단 내비 위에 놓고, 시트가 열리면 숨긴다.
        className={`fixed bottom-[calc(env(safe-area-inset-bottom)+84px)] right-4 z-40 h-14 w-14 items-center justify-center rounded-full border border-[#E8E8E4] bg-white shadow-[0_23px_52px_rgba(0,0,0,0.05),0_14px_28px_rgba(0,0,0,0.04),0_6px_14px_rgba(0,0,0,0.03),0_2px_5px_rgba(0,0,0,0.02)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] motion-reduce:hover:translate-y-0 lg:bottom-[var(--ai-fab-bottom)] lg:right-6 ${
          state.open ? "hidden lg:flex" : "flex"
        } ${docked ? "xl:hidden" : ""}`}
      >
        <GalmaebotAvatar size={52} className="ring-0" />
        {pendingCount > 0 ? (
          <span
            className="absolute -right-[3px] -top-[3px] flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-[#A8741A] px-[5px] text-[10px] font-bold tabular-nums text-white ring-2 ring-[#FAFAF8]"
            aria-label={`확인 대기 오더 ${pendingCount}건`}
          >
            {pendingCount}
          </span>
        ) : null}
      </button>
    </>
  )
}
