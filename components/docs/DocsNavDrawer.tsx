"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from "react"
import { PanelLeftOpen, X } from "lucide-react"

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], summary, input, [tabindex]:not([tabindex="-1"])'

/**
 * 좁은 화면에서 문서 목록을 본문 위에 쌓지 않고 왼쪽 서랍으로 연다.
 * 네이티브 <dialog> 라 ESC 로 닫히고 뒤 화면은 조작되지 않는다. 문서를 고르면 닫힌다.
 */
export function DocsNavDrawer({
  children,
  label = "가이드 목록",
}: {
  children: ReactNode
  label?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  const open = () => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    setIsOpen(true)
    // 지금 보고 있는 문서가 목록 가운데 오게 한다.
    const active = dialog.querySelector<HTMLElement>('[aria-current="page"]')
    active?.scrollIntoView({ block: "center" })
  }

  const close = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = "hidden"
    return () => {
      root.style.overflow = previous
    }
  }, [isOpen])

  const handleClose = () => {
    setIsOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  const handleClick = (event: ReactMouseEvent<HTMLDialogElement>) => {
    // 서랍 바깥(어두운 바탕)을 누르면 닫는다.
    if (event.target === event.currentTarget) {
      close()
      return
    }
    // 문서 링크를 고르면 서랍을 닫고 이동한다.
    if (event.target instanceof Element && event.target.closest("a[href]")) {
      close()
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== "Tab") return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => element.getClientRects().length > 0
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement

    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-black/[0.16] bg-white px-3.5 text-sm font-semibold text-[#111110] transition-colors duration-150 hover:border-[#084734]/40 hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
      >
        <PanelLeftOpen className="h-4 w-4" aria-hidden />
        {label}
      </button>

      <dialog
        ref={dialogRef}
        aria-label={label}
        onClose={handleClose}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-[#111110]/40 p-0 backdrop:bg-transparent open:flex print:hidden"
      >
        <div className="flex h-full w-[min(88vw,360px)] flex-col border-r border-black/[0.08] bg-[#FAFAF8] shadow-[0_24px_52px_rgba(0,0,0,0.12)]">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-black/[0.08] px-4 py-2">
            <p className="text-sm font-bold text-[#111110]">{label}</p>
            <button
              type="button"
              onClick={close}
              aria-label="목록 닫기"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[6px] text-[#615D59] transition-colors duration-150 hover:bg-black/[0.05] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8 pt-4">
            {children}
          </div>
        </div>
      </dialog>
    </>
  )
}
