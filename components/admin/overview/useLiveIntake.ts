"use client"

// "오늘 유입" 라이브 조회 훅 — Overview "지금" 띠와 어드민 전역 새 문의 알림이 같이 쓴다.
//
// 마케팅 허브 카드(TodayIntakeCard)와 같은 URL·캐시 키를 읽는다 — 같은 화면에 둘이 있어도 요청은 하나다.
// 화면이 보일 때만 1분마다 다시 읽고, 숨으면 멈춘다. 서버 캐시가 20초라 이보다 자주 읽어도 값이 같다.
// 주기 조회는 ?fresh=1(서버 캐시 강제 만료)을 쓰지 않는다 — 열어 둔 화면마다 Compass 브리지를
// 1분마다 다시 훑게 되기 때문이다. 수동 재시도만 캐시를 우회한다.

import { useEffect, useRef, useState } from "react"

import { adminFetchJsonCached } from "@/lib/admin-client"
import type { IntakeFeedResult } from "@/lib/marketing/intake-feed"

export const LIVE_INTAKE_URL = "/api/admin/marketing/intake-today"
/** TodayIntakeCard 의 INTAKE_TODAY_CACHE_KEY 와 같은 값 — 캐시 슬롯을 공유한다. */
export const LIVE_INTAKE_CACHE_KEY = "marketing-intake-today"
export const LIVE_INTAKE_POLL_MS = 60_000
const LIVE_INTAKE_TTL_MS = 20_000

export interface LiveIntakeState {
  data: IntakeFeedResult | null
  /** 마지막 조회가 실패했는가 — 이전 값(data)은 그대로 둔다(실패를 0으로 바꾸지 않는다). */
  error: boolean
  retry: () => void
}

export function useLiveIntake({ enabled = true, refreshKey = 0 }: { enabled?: boolean; refreshKey?: number } = {}): LiveIntakeState {
  const [data, setData] = useState<IntakeFeedResult | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const forceNextRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const bump = () => {
      if (!document.hidden) setTick((value) => value + 1)
    }
    const timer = window.setInterval(bump, LIVE_INTAKE_POLL_MS)
    document.addEventListener("visibilitychange", bump)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", bump)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    let ignore = false
    const force = forceNextRef.current
    forceNextRef.current = false
    adminFetchJsonCached<IntakeFeedResult>(`${LIVE_INTAKE_URL}${force ? "?fresh=1" : ""}`, undefined, {
      ttlMs: LIVE_INTAKE_TTL_MS,
      cacheKey: LIVE_INTAKE_CACHE_KEY,
      force,
      persist: false,
      staleIfError: false,
    })
      .then((response) => {
        if (ignore) return
        setData(response)
        setError(false)
      })
      .catch(() => {
        if (!ignore) setError(true)
      })
    return () => {
      ignore = true
    }
  }, [enabled, tick, refreshKey])

  return {
    data,
    error,
    retry: () => {
      forceNextRef.current = true
      setTick((value) => value + 1)
    },
  }
}
