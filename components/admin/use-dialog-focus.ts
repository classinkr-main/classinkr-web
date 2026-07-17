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
 *
 * 품질 웨이브 4 — 항목 1. Tab 캡처(포커스 트랩)를 추가한다. 컨테이너를 별도 인자로 받지
 * 않고 focusRef가 가리키는 요소에서 `closest('[role="dialog"]')`로 다이얼로그 루트를
 * 찾는다 — 현재 세 소비처(DealModal·AdminSidebar 모바일 드로어·AdminCommandPalette) 모두
 * focusRef 대상이 role="dialog" 컨테이너 내부에 있으므로, 그 파일들을 전혀 건드리지 않고도
 * 자동으로 Tab 순환 트랩을 얻는다. focusRef가 없거나 role="dialog" 조상을 못 찾으면
 * 기존과 동일하게 Escape+복귀만 수행(트랩 없음).
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function isVisible(el: HTMLElement) {
  return el.offsetParent !== null || el === document.activeElement
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible)
}

export function useDialogFocus<T extends HTMLElement>(
  openKey: string | number | boolean | null | undefined,
  onClose: () => void,
  focusRef?: RefObject<T | null>
) {
  const isOpen = openKey != null && openKey !== false

  useEffect(() => {
    if (!isOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      if (e.key !== "Tab") return

      // 매 Tab 입력마다 다시 조회 — DealModal 월별 로그처럼 다이얼로그가 열린 채로
      // 콘텐츠가 비동기 로드돼 포커서블 요소 목록이 바뀔 수 있다.
      const container = focusRef?.current?.closest<HTMLElement>('[role="dialog"]') ?? null
      if (!container) return

      const focusable = getFocusableElements(container)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !(active instanceof HTMLElement) || !container.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !(active instanceof HTMLElement) || !container.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose, focusRef])

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
