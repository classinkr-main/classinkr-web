"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { adminFetchJsonCached, seedAdminRequestCache } from "@/lib/admin-client"
import type { MarketingPerfResponse, PerfPeriodKey } from "@/lib/marketing/perf"

// perf 단일 응답(/api/admin/marketing/perf) 조회 훅 — 한눈에·상세·데이터 세 층이 같은 훅과 같은
// cacheKey 를 써서, 탭을 오가도 한 응답을 재사용한다(층마다 따로 세면 같은 말에 다른 숫자가 생긴다).
// SummaryTab 안에 있던 usePerf 를 그대로 승격했다(2026-09-14) — 레이스 가드·fresh 규약 동일.

/** 서버 Data Cache(60초)와 어울리는 클라이언트 TTL. 명시 새로고침은 force + fresh=1 로 양쪽 다 우회한다. */
export const PERF_TTL_MS = 45_000

export function perfCacheKey(period: PerfPeriodKey): string {
  return `marketing-perf:${period}`
}

export function perfUrl(period: PerfPeriodKey, fresh = false): string {
  return `/api/admin/marketing/perf?period=${period}${fresh ? "&fresh=1" : ""}`
}

export interface UsePerfOptions {
  /**
   * 서버 프리페치(RSC)가 첫 HTML 에 실어 보낸 응답 — 있으면 스켈레톤 없이 그 값으로 시작하고
   * 클라이언트 캐시에도 심는다. 마운트 조회는 그대로 돈다: 캐시가 신선하면 네트워크 없이 같은
   * 값을 되받고, 낡았으면 새로 받는다(신선도 판단은 admin-client 캐시 규약에 맡긴다).
   */
  initialData?: MarketingPerfResponse | null
  /** initialData 가 서버에서 만들어진 시각(ms epoch) — 캐시 항목의 저장 시각으로 쓴다. */
  initialGeneratedAt?: number
}

export function usePerf(period: PerfPeriodKey, refreshNonce: number, options: UsePerfOptions = {}) {
  // 시드는 상태 지연 초기화(첫 렌더 1회) 안에서 — effect 로 미루면 첫 load() 가 시드보다 먼저
  // 네트워크를 탄다. 렌더 본문에서 ref 를 읽지 않는 것은 react-hooks/refs 규칙 때문이다.
  const [data, setData] = useState<MarketingPerfResponse | null>(() => {
    const seed = options.initialData && options.initialData.period.key === period ? options.initialData : null
    if (seed) {
      seedAdminRequestCache(perfUrl(period), seed, {
        cacheKey: perfCacheKey(period),
        ttlMs: PERF_TTL_MS,
        generatedAt: options.initialGeneratedAt,
      })
    }
    return seed
  })
  const [loading, setLoading] = useState(data == null)
  const [error, setError] = useState<string | null>(null)
  // 기간 연타 시 늦게 온 이전 기간 응답이 화면을 덮지 않도록 시퀀스로 "마지막 요청"만 반영한다.
  const seqRef = useRef(0)

  const load = useCallback(
    async ({ fresh = false }: { fresh?: boolean } = {}) => {
      const seq = ++seqRef.current
      setLoading(true)
      setError(null)
      try {
        // fresh=1 은 서버 Data Cache 를 우회 — cacheKey 를 고정해 fresh 응답이 같은 클라이언트
        // 캐시 슬롯을 갱신하게 한다(URL 이 달라 캐시가 갈라지는 것 방지).
        const response = await adminFetchJsonCached<MarketingPerfResponse>(perfUrl(period, fresh), undefined, {
          ttlMs: PERF_TTL_MS,
          cacheKey: perfCacheKey(period),
          force: fresh,
          staleIfError: !fresh,
        })
        if (seq !== seqRef.current) return
        setData(response)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "퍼포먼스 집계 로딩 실패")
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [period]
  )

  useEffect(() => {
    void load()
  }, [load])

  // 헤더 "동기화" 버튼 — 페이지가 nonce 를 올리면 캐시를 우회해 새로 받는다(마운트 직후 값은 무시).
  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, loading, error, reload: load }
}
