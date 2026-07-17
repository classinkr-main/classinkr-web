"use client"

import { useEffect } from "react"
import type { RefObject } from "react"

/**
 * 다이얼로그류(모달/드로어/커맨드 팔레트) 접근성 공용 훅 — 품질 웨이브 3, 항목 4.
 * 기존 DealModal(components/admin/branch/sections/DealModal.tsx)의 포커스 캡처/복귀·Escape
 * 로직을 그대로 추출한 것 — 동작은 원본과 동일하다. AdminSidebar 모바일 드로어(항목 5),
 * AdminCommandPalette(항목 6)도 이 훅을 재사용한다.
 *
 * - openKey: 다이얼로그가 열려 있는지("truthy"인지)를 나타내는 값. boolean(열림 플래그)
 *   또는 string|number(현재 열려 있는 대상의 id — 다른 대상으로 바뀌면 포커스 캡처/이동을
 *   다시 수행)를 넘길 수 있다. null/undefined/false면 닫힘으로 간주.
 * - onClose: Escape 키를 누르면 호출된다.
 * - focusRef: 열릴 때 포커스를 이동시킬 대상(보통 닫기 버튼). 생략하면 포커스 이동은
 *   하지 않고 Escape 닫기 + 이전 포커스 복귀만 수행한다.
 */
export function useDialogFocus<T extends HTMLElement>(
  openKey: string | number | boolean | null | undefined,
  onClose: () => void,
  focusRef?: RefObject<T | null>
) {
  const isOpen = openKey != null && openKey !== false

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    focusRef?.current?.focus()

    return () => {
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the open target identity changes, not on every unrelated re-render (matches prior DealModal `dealId`-keyed effect)
  }, [openKey])
}
