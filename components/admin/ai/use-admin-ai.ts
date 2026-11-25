"use client"

import { useEffect, useMemo, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"

import { adminAiStore, type AdminAiState } from "@/lib/admin-ai/store"
import {
  getAdminAiEntity,
  registerAdminAiEntity,
  subscribeAdminAiEntity,
} from "@/lib/admin-ai/page-entity"
import type { AdminAiEntity, AdminAiPageContext } from "@/lib/admin-ai/types"
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
 * 지금 화면의 맥락 — 경로·화면 이름, 그리고 화면이 알려 준 "지금 열린 대상"(있을 때만).
 * 화면의 글자를 긁어 추측하지 않는다. 대상은 아래 useAdminAiEntity 로 화면이 직접 알린다(기획 §11.6).
 */
export function useAdminAiPageContext(): AdminAiPageContext {
  const pathname = usePathname() ?? "/admin"
  const entity = useSyncExternalStore(subscribeAdminAiEntity, getAdminAiEntity, () => null)
  return useMemo(
    () => ({
      path: pathname,
      label: describeAdminPath(pathname),
      ...(entity ? { entity } : {}),
    }),
    [pathname, entity]
  )
}

/**
 * 화면이 "지금 이 고객·견적이 열려 있다" 고 갈매봇에게 알린다. 대상이 없으면 null 을 넘긴다.
 * 화면이 닫히면(언마운트) 자동으로 거둔다. 골격만 있고 실제 화면 연결은 각 화면 소유 파트가 한다
 * (CRM 고객 상세·리드 서랍·견적 상세 — 점검 R28).
 */
export function useAdminAiEntity(entity: AdminAiEntity | null): void {
  const type = entity?.type
  const id = entity?.id
  const label = entity?.label
  useEffect(() => {
    if (!type || !id || !label) return
    return registerAdminAiEntity({ type, id, label })
  }, [type, id, label])
}
