"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import {
  CONSENT_CHANGE_EVENT,
  DENIED_CHOICE,
  type ConsentChoice,
  type ConsentRecord,
  parseConsent,
  readConsentRaw,
  saveConsent,
} from "@/lib/consent/consent"

export interface UseConsentResult {
  /** 동의 기록 (미결정 시 null) */
  record: ConsentRecord | null
  /** 현재 유효 선택 (미결정 시 모두 거부) */
  choice: ConsentChoice
  /** 사용자가 동의/거부 결정을 내렸는지 */
  decided: boolean
  save: (choice: ConsentChoice) => Promise<ConsentRecord>
}

interface CookieStoreLike {
  addEventListener: (type: "change", listener: () => void) => void
  removeEventListener: (type: "change", listener: () => void) => void
}

function getCookieStore(): CookieStoreLike | null {
  const store = (window as unknown as { cookieStore?: CookieStoreLike }).cookieStore
  return typeof store?.addEventListener === "function" ? store : null
}

/**
 * 동의 쿠키는 같은 탭의 `saveConsent` 외에도 바뀔 수 있다 — 다른 탭에서의 동의/철회,
 * 쿠키 만료, Safari ITP의 삭제. 커스텀 이벤트만 구독하면 그 탭은 새로고침 전까지
 * 낡은 상태로 픽셀을 계속 돌리거나 배너를 계속 띄운다. 그래서 포커스 복귀와
 * (지원 시) cookieStore 변경에서도 스냅샷을 다시 읽는다.
 * 스냅샷이 같은 문자열이면 React가 리렌더를 건너뛰므로 비용은 사실상 없다.
 */
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}

  const cookieStore = getCookieStore()
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  window.addEventListener("focus", onChange)
  document.addEventListener("visibilitychange", onChange)
  cookieStore?.addEventListener("change", onChange)

  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
    window.removeEventListener("focus", onChange)
    document.removeEventListener("visibilitychange", onChange)
    cookieStore?.removeEventListener("change", onChange)
  }
}

/**
 * 동의 상태를 구독하는 클라이언트 훅.
 * 쿠키는 외부 스토어이므로 useSyncExternalStore로 읽어 SSR/CSR 일관성과
 * 참조 안정성(원문 문자열 스냅샷)을 확보한다. 서버 스냅샷은 항상 "미결정".
 */
export function useConsent(): UseConsentResult {
  const raw = useSyncExternalStore(
    subscribe,
    readConsentRaw,
    () => "" // 서버: 쿠키 없음 → 미결정
  )
  const record = useMemo(() => parseConsent(raw || null), [raw])

  const save = useCallback((choice: ConsentChoice) => {
    return saveConsent(choice)
  }, [])

  return {
    record,
    choice: record ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE,
    decided: record !== null,
    save,
  }
}
