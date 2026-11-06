"use client"

// 사이드바 숫자 배지 — 지금은 CRM 항목의 "응대 전 문의"(전사) 하나다.
// 기획: docs/active/admin-lead-visitor-glance-plan-2026-11-04.md §3.3
//
// 값은 /api/admin/leads?scope=badge(Overview 리드 요약과 같은 30초 서버 캐시)에서 온다.
// 정직 규칙: 조회 실패·권한 없음(403)이면 배지를 달지 않는다 — 0으로 위장하지 않는다. 0이면 숨긴다.
// 화면이 보일 때만 1분마다 다시 읽는다.

import { useEffect, useState } from "react"

import { adminFetchJsonCached } from "@/lib/admin-client"

export const ADMIN_NAV_BADGE_URL = "/api/admin/leads?scope=badge"
const BADGE_POLL_MS = 60_000
const BADGE_TTL_MS = 30_000

interface BadgeResponse {
  badge: { unresponded: number; unresponded24h: number; unconfirmed: number }
}

export interface AdminNavCount {
  count: number
  /** 스크린 리더용 설명 — "응대 전 문의 4건". */
  label: string
}

export function useAdminNavCounts(): Readonly<Record<string, AdminNavCount>> {
  const [counts, setCounts] = useState<Readonly<Record<string, AdminNavCount>>>({})
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const bump = () => {
      if (!document.hidden) setTick((value) => value + 1)
    }
    const timer = window.setInterval(bump, BADGE_POLL_MS)
    document.addEventListener("visibilitychange", bump)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", bump)
    }
  }, [])

  useEffect(() => {
    let ignore = false
    adminFetchJsonCached<BadgeResponse>(ADMIN_NAV_BADGE_URL, undefined, {
      ttlMs: BADGE_TTL_MS,
      persist: false,
      staleIfError: false,
    })
      .then((response) => {
        if (ignore) return
        const unresponded = response?.badge?.unresponded
        setCounts(
          typeof unresponded === "number" && unresponded > 0
            ? { "/admin/crm": { count: unresponded, label: `응대 전 문의 ${unresponded.toLocaleString("ko-KR")}건` } }
            : {}
        )
      })
      .catch(() => {
        if (!ignore) setCounts({})
      })
    return () => {
      ignore = true
    }
  }, [tick])

  return counts
}

/** 배지 표시 문자열 — 세 자리를 넘기면 99+ 로 줄인다(사이드바 폭). */
export function formatNavCount(count: number) {
  return count > 99 ? "99+" : String(count)
}
