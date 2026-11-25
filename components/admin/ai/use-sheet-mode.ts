"use client"

import { useSyncExternalStore } from "react"

// 패널이 하단 시트(모달)인 폭 — Tailwind lg(1024px) 미만. 패널의 lg: 클래스와 같은 경계다.
const WIDE_QUERY = "(min-width: 1024px)"

function subscribe(listener: () => void) {
  const query = window.matchMedia?.(WIDE_QUERY)
  query?.addEventListener?.("change", listener)
  return () => query?.removeEventListener?.("change", listener)
}

function getSnapshot() {
  // matchMedia 가 없는 환경은 넓은 화면으로 본다(스토어의 열림 복원과 같은 기준).
  return !(window.matchMedia?.(WIDE_QUERY).matches ?? true)
}

/** 좁은 화면(하단 시트)인지. 시트일 때만 모달로 다룬다 — 포커스 가두기·aria-modal. */
export function useSheetMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
