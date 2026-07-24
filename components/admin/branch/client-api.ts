"use client"

import { useEffect, useRef, useState } from "react"
import {
  adminFetchJson as sharedAdminFetchJson,
  adminFetchJsonCachedWithMeta,
  clearAdminRequestCache,
  type AdminFetchInit,
} from "@/lib/admin-client"

// 웨이브 7 2단(I4): 낙관적 잠금 409 응답 바디({error, draft})는 상태코드와 바디를 함께 읽어야
// 구분할 수 있다 — adminFetchJson은 실패 시 Error(message)만 던지고 status를 버리므로, 원
// Response를 그대로 노출하는 통로를 별도로 연다(401 처리·mutation 캐시 무효화 등 공통 동작은
// lib/admin-client의 adminFetch가 동일하게 수행한다).
export { adminFetch } from "@/lib/admin-client"

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

interface UseBranchJsonOptions {
  /** false면 네트워크 요청을 만들지 않는다. 탭·렌즈가 실제로 소비하는 동안에만 켠다. */
  enabled?: boolean
}

const EMPTY_STATE = { data: null, error: null, loading: true, stale: false, staleSince: null } as const

// branch 새로고침·재동기화가 무효화해야 하는 캐시 스코프 — branch API 키 전체에 매칭된다.
const BRANCH_API_CACHE_PREFIX = "/api/admin/branch"

export function clearBranchRequestCache() {
  // 코덱스 감사 #2: 과거엔 무인자 전역 클리어라 branch 새로고침이 블로그·CRM 등 다른 어드민
  // 탭 캐시까지 전부 날렸다. 캐시 키가 정규화 URL(GET:/api/admin/branch/…)로 통일됐으므로
  // (아래 감사 #1) prefix 무효화로 좁힌다 — summary/kpi/pipeline/data-quality/ledger 키 전부
  // 이 prefix에 매칭된다. 비-branch URL(hardware·crm coverage·account-master)을 같은
  // refreshKey로 소비하는 훅들은 refreshKey 증가 → force 재검증으로 신선도를 확보하므로
  // 여기서 함께 지울 필요가 없다.
  clearAdminRequestCache(BRANCH_API_CACHE_PREFIX)
}

// 품질 웨이브 4 — 항목 3. init 타입을 AdminFetchInit으로 넓혀 이 파일을 통해 호출하는
// 쪽(예: SalesLedgerWorkbench의 branch/sync·db-import 폴링)도 필요하면 adminTimeoutMs로
// 개별 오버라이드할 수 있게 한다 — 다만 그 경로들은 lib/admin-client.ts의
// LONG_RUNNING_ADMIN_PATHS로 이미 자동 opt-out되어 있어 당장 값을 넘길 필요는 없다.
export async function adminFetchJson<T>(url: string, init: AdminFetchInit = {}): Promise<T> {
  return sharedAdminFetchJson<T>(url, init)
}

// 코덱스 감사 #1 — 캐시 키를 정규화 URL로 통일. 과거엔 `branch:${refreshKey}:${url}`을 키로
// 써서 사이드바 예열(warmAdminRequestCache — URL 그대로가 키)과 절대 만나지 못했고, 예열해
// 둔 GET을 화면 진입 시 같은 URL로 재발사했다. 이제 키는 URL 그대로(GET:${url})라 사이드바
// 예열·다른 화면(개요↔장부의 summary/kpi 등)과 캐시를 공유한다. refreshKey는 키가 아니라
// force 재검증으로 매핑한다(useBranchJson 내부 주석 참조).
function loadBranchJson<T>(url: string, force: boolean) {
  return adminFetchJsonCachedWithMeta<T>(url, undefined, {
    ttlMs: 60_000,
    force,
  })
}

export function useBranchJson<T>(url: string, refreshKey: number, options: UseBranchJsonOptions = {}): BranchJsonState<T> {
  const enabled = options.enabled ?? true
  // 상태 키는 기존 그대로 `${refreshKey}:${url}` — refreshKey 증가·URL 변경 시 로딩 상태로
  // 리셋되는 소비자 가시 동작(스켈레톤)을 유지한다. 네트워크 캐시 키(정규화 URL)와는 분리.
  const stateKey = `${refreshKey}:${url}`
  const [state, setState] = useState<BranchJsonState<T>>({ key: stateKey, ...EMPTY_STATE })
  // 이 인스턴스가 마지막으로 fetch를 실행했을 때의 refreshKey. null = 아직 미실행.
  // 초기 마운트는 force 없이 캐시(사이드바 예열 포함)를 그대로 쓰고, 마운트 이후 refreshKey가
  // 바뀌면 force로 새 네트워크 요청(브라우저 HTTP 캐시까지 우회)을 보장한다 — "refreshKey
  // 증가 = 새 네트워크 요청" 계약(PipelineTable·Kanban·Heatmap의 refreshKey + localRetry
  // 재시도 패턴 포함)이 그대로 성립한다. 새로고침 경로는 clearBranchRequestCache(prefix)가
  // 선행돼 늦게 마운트되는 소비자도 오래된 branch 캐시를 집지 않는다.
  const lastFetchedRefreshKeyRef = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    const force =
      lastFetchedRefreshKeyRef.current !== null && lastFetchedRefreshKeyRef.current !== refreshKey
    lastFetchedRefreshKeyRef.current = refreshKey
    void loadBranchJson<T>(url, force)
      .then((result) => {
        if (!active) return
        // staleReason: "revalidate"(정상 SWR 고속 경로)는 실패 신호가 아니므로 stale로 노출하지 않는다.
        const isErrorFallback = result.staleReason === "error"
        setState({
          key: stateKey,
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
            key: stateKey,
            data: null,
            error: error instanceof Error ? error.message : String(error),
            loading: false,
            stale: false,
            staleSince: null,
          })
        }
      })

    return () => { active = false }
  }, [stateKey, enabled, url, refreshKey])

  if (!enabled) {
    return { key: stateKey, data: null, error: null, loading: false, stale: false, staleSince: null }
  }

  if (state.key !== stateKey) {
    return { key: stateKey, ...EMPTY_STATE }
  }

  return state
}
