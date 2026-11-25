"use client"

import { useSyncExternalStore } from "react"

/**
 * 쿠키 배너가 지금 화면에 떠 있는지(첫 방문 자동 노출·푸터에서 다시 연 경우 모두)를 다른 위젯이 알게 한다.
 * 배너는 지연 로드 청크라 배너 컴포넌트가 열림·닫힘을 이 모듈에 알린다(setConsentBannerOpen).
 * 쓰는 곳: 챗봇 티저(배너가 떠 있는 동안 체류 시간을 쌓지 않는다, CX-05).
 */

/** OPEN_CONSENT_EVENT(푸터 '쿠키 설정')의 detail. 배너를 닫으면 returnFocus 로 포커스를 돌려준다(C6) */
export interface ConsentReopenDetail {
  returnFocus?: HTMLElement | null
}

let bannerOpen = false
const listeners = new Set<() => void>()

export function setConsentBannerOpen(open: boolean): void {
  if (bannerOpen === open) return
  bannerOpen = open
  for (const listener of listeners) listener()
}

export function isConsentBannerOpen(): boolean {
  return bannerOpen
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useConsentBannerOpen(): boolean {
  return useSyncExternalStore(subscribe, isConsentBannerOpen, () => false)
}

/**
 * AppChrome 이 챗봇 래퍼에 다는 표지. 배너와 함께 숨길지는 site-base.css 동시 노출 규칙이 정본이라
 * (휴대폰만 숨긴다) 화면 폭을 따로 계산하지 않고 래퍼의 계산된 display 를 본다.
 */
export const CHATBOT_SLOT_ATTRIBUTE = "data-chatbot-slot"

export function isChatbotSlotHidden(): boolean {
  if (typeof document === "undefined") return false
  const slot = document.querySelector(`[${CHATBOT_SLOT_ATTRIBUTE}]`)
  if (!slot) return false
  return window.getComputedStyle(slot).display === "none"
}
