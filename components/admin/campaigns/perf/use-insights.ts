"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { adminFetchJsonCached, seedAdminRequestCache } from "@/lib/admin-client"
import type { MarketingInsightsResponse } from "@/lib/marketing/glance-initial-data"

// 주간 AI 브리핑 + 현재 이상 신호(/api/admin/marketing/insights) 조회 훅 — SummaryTab 에서 승격.

// 응답 타입은 서버 프리페치와 공유하는 계약 모듈에 있다.
export type { MarketingInsightRecord, MarketingInsightsResponse } from "@/lib/marketing/glance-initial-data"

export const INSIGHTS_URL = "/api/admin/marketing/insights"
export const INSIGHTS_CACHE_KEY = "marketing-insights"
// 브리핑은 주 1회 크론이 만든다 — perf(45초)보다 훨씬 길게 잡아도 신선도가 상하지 않는다.
export const INSIGHTS_TTL_MS = 5 * 60_000

export interface UseInsightsOptions {
  initialData?: MarketingInsightsResponse | null
  initialGeneratedAt?: number
}

export function useInsights(refreshNonce: number, options: UseInsightsOptions = {}) {
  // 시드는 상태 지연 초기화(첫 렌더 1회) 안에서(use-perf 와 같은 규약).
  const [data, setData] = useState<MarketingInsightsResponse | null>(() => {
    if (options.initialData) {
      seedAdminRequestCache(INSIGHTS_URL, options.initialData, {
        cacheKey: INSIGHTS_CACHE_KEY,
        ttlMs: INSIGHTS_TTL_MS,
        generatedAt: options.initialGeneratedAt,
      })
    }
    return options.initialData ?? null
  })
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const seqRef = useRef(0)
  // 재생성 연타 방지 — setState 는 비동기라 regenerating 상태만으로는 두 번째 클릭을 못 막는다.
  // ?force=1 만 Gemini 를 부르는 유료 경로라 이 경로만 잠근다 — 저장분 재조회(fresh)는 값싸고 seqRef 가 이미 레이스를 막는다.
  const regeneratingRef = useRef(false)

  const load = useCallback(
    async ({ fresh = false, regenerate = false }: { fresh?: boolean; regenerate?: boolean } = {}) => {
      if (regenerate) {
        if (regeneratingRef.current) return
        regeneratingRef.current = true
      }
      const seq = ++seqRef.current
      if (regenerate) setRegenerating(true)
      try {
        // ?force=1 만 Gemini 를 부른다. fresh 는 클라이언트 캐시만 우회(저장된 브리핑 재조회).
        const url = `${INSIGHTS_URL}${regenerate ? "?force=1" : ""}`
        const response = await adminFetchJsonCached<MarketingInsightsResponse>(url, undefined, {
          ttlMs: INSIGHTS_TTL_MS,
          cacheKey: INSIGHTS_CACHE_KEY,
          force: fresh || regenerate,
          staleIfError: !regenerate,
        })
        if (seq !== seqRef.current) return
        setData(response)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        // 브리핑은 보조 정보 — 실패해도 대시보드는 그대로 두고 카드만 규칙 기반으로 폴백한다.
        setError(e instanceof Error ? e.message : "브리핑 조회 실패")
      } finally {
        // seq 와 무관하게 잠금을 푼다 — 늦게 온 응답 때문에 버튼이 영구히 잠기면 안 된다.
        if (regenerate) {
          regeneratingRef.current = false
          setRegenerating(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    void load()
  }, [load])

  // 헤더 "동기화" — 저장된 브리핑만 다시 읽는다(재생성은 카드의 명시 버튼으로만).
  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, error, regenerating, reload: load }
}
