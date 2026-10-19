"use client"

import { useMemo, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import { adminAiStore, type AdminAiState } from "@/lib/admin-ai/store"
import type { AdminAiPageContext } from "@/lib/admin-ai/types"
import { describeAdminPath } from "./page-context"

/** 갈매봇 상태 구독. 위젯과 AI 올인원 탭이 같은 스토어를 본다. */
export function useAdminAiState(): AdminAiState {
  return useSyncExternalStore(
    adminAiStore.subscribe,
    adminAiStore.getState,
    adminAiStore.getServerState
  )
}

/**
 * 지금 화면의 맥락. v1 은 경로와 화면 이름까지만 넘긴다 — 열려 있는 대상(고객·견적)은
 * 화면이 직접 알려 주는 방식으로 붙인다(기획 §11.6). 화면의 글자를 긁어 추측하지 않는다.
 */
export function useAdminAiPageContext(): AdminAiPageContext {
  const pathname = usePathname() ?? "/admin"
  return useMemo(() => ({ path: pathname, label: describeAdminPath(pathname) }), [pathname])
}
