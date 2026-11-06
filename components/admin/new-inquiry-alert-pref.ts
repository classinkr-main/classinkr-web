"use client"

// 화면 안 "새 문의" 알림의 개인 켬/끔 — 이 브라우저에만 저장한다(사람별 편의 설정, 서버 상태 아님).
// 기본은 켬(기획 2026-11-04 D8). 저장소 접근이 막힌 환경(사생활 보호 창 등)에서는 기본값으로 동작한다.

import { useSyncExternalStore } from "react"

const STORAGE_KEY = "admin:new-inquiry-alert"
const CHANGE_EVENT = "admin:new-inquiry-alert-change"

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

export function setNewInquiryAlertEnabled(enabled: boolean) {
  try {
    if (enabled) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, "off")
  } catch {
    // 저장이 막히면 이번 화면에서만 바뀐다.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange)
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange)
    window.removeEventListener("storage", onChange)
  }
}

export function useNewInquiryAlertEnabled(): boolean {
  return useSyncExternalStore(subscribe, read, () => true)
}
