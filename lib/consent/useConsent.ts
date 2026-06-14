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
  save: (choice: ConsentChoice) => void
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
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
    saveConsent(choice)
  }, [])

  return {
    record,
    choice: record ? { analytics: record.analytics, marketing: record.marketing } : DENIED_CHOICE,
    decided: record !== null,
    save,
  }
}
