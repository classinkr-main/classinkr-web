"use client"

import { useEffect, useState } from "react"
import {
  adminFetchJson as sharedAdminFetchJson,
  adminFetchJsonCachedWithMeta,
  clearAdminRequestCache,
  type AdminFetchInit,
} from "@/lib/admin-client"

interface BranchJsonState<T> {
  key: string
  data: T | null
  error: string | null
  loading: boolean
  /** 품질 웨이브 3 — 항목 1. true면 이 data는 방금 요청이 실패해 대체된 오래된 캐시다
   *  (stale-while-revalidate로 의도적으로 즉시 서빙된 경우는 포함하지 않는다 —
   *  그건 실패가 아니라 정상 캐시 정책이라 "갱신 실패" 신호로 잡지 않는다). */
  stale: boolean
  /** stale이 true일 때, 그 캐시 항목이 저장된 시각(ms epoch). */
  staleSince: number | null
}

const EMPTY_STATE = { data: null, error: null, loading: true, stale: false, staleSince: null } as const

export function clearBranchRequestCache() {
  clearAdminRequestCache()
}

// 품질 웨이브 4 — 항목 3. init 타입을 AdminFetchInit으로 넓혀 이 파일을 통해 호출하는
// 쪽(예: SalesLedgerWorkbench의 branch/sync·db-import 폴링)도 필요하면 adminTimeoutMs로
// 개별 오버라이드할 수 있게 한다 — 다만 그 경로들은 lib/admin-client.ts의
// LONG_RUNNING_ADMIN_PATHS로 이미 자동 opt-out되어 있어 당장 값을 넘길 필요는 없다.
export async function adminFetchJson<T>(url: string, init: AdminFetchInit = {}): Promise<T> {
  return sharedAdminFetchJson<T>(url, init)
}

function loadBranchJson<T>(key: string, url: string) {
  return adminFetchJsonCachedWithMeta<T>(url, undefined, {
    cacheKey: `branch:${key}`,
    ttlMs: 60_000,
  })
}

export function useBranchJson<T>(url: string, refreshKey: number): BranchJsonState<T> {
  const cacheKey = `${refreshKey}:${url}`
  const [state, setState] = useState<BranchJsonState<T>>({ key: cacheKey, ...EMPTY_STATE })

  useEffect(() => {
    let active = true
    void loadBranchJson<T>(cacheKey, url)
      .then((result) => {
        if (!active) return
        // staleReason: "revalidate"(정상 SWR 고속 경로)는 실패 신호가 아니므로 stale로 노출하지 않는다.
        const isErrorFallback = result.staleReason === "error"
        setState({
          key: cacheKey,
          data: result.data,
          error: null,
          loading: false,
          stale: isErrorFallback,
          staleSince: isErrorFallback ? result.staleSince : null,
        })
      })
      .catch((error) => {
        if (active) {
          setState({
            key: cacheKey,
            data: null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            stale: false,
            staleSince: null,
          })
        }
      })

    return () => { active = false }
  }, [cacheKey, url])

  if (state.key !== cacheKey) {
    return { key: cacheKey, ...EMPTY_STATE }
  }

  return state
}
