"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

import { cn } from "./utils"

interface ZoomItem {
  src: string
  alt: string
  caption: string
  width?: number
  height?: number
}

const ZOOM_SELECTOR = "a[data-docs-zoom]"
/** 높이/폭이 이 값 이상이면 화면에 억지로 맞추지 않고 폭에 맞춰 세로로 스크롤한다. */
const SCROLL_RATIO = 1.9
const SWIPE_DISTANCE = 56

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function toNumber(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function toItem(anchor: HTMLAnchorElement): ZoomItem {
  const image = anchor.querySelector("img")
  return {
    src: anchor.getAttribute("href") || image?.currentSrc || image?.src || "",
    alt: anchor.dataset.zoomAlt ?? image?.alt ?? "",
    caption: anchor.dataset.zoomCaption ?? "",
    width: toNumber(anchor.dataset.zoomWidth),
    height: toNumber(anchor.dataset.zoomHeight),
  }
}

function isTall(item: ZoomItem) {
  return Boolean(item.width && item.height && item.height / item.width >= SCROLL_RATIO)
}

const CONTROL_CLASS =
  "inline-flex items-center justify-center rounded-[6px] text-white/85 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6EE7B7]"

/**
 * 문서 본문의 사진(`a[data-docs-zoom]`)을 눌렀을 때 여는 크게 보기 창.
 *
 * - 네이티브 <dialog> 의 showModal 을 써서 헤더·챗봇 위에 뜨고, 뒤 화면은 조작되지 않는다.
 * - ESC 로 닫고, ←/→ 로 같은 문서의 앞뒤 사진으로 옮긴다. Tab 은 창 안에서만 돈다.
 * - 휴대폰에서는 화면을 꽉 채우고, 좌우로 밀어 넘긴다.
 * - 닫으면 눌렀던 사진으로 포커스를 돌려준다.
 */
export function DocsMediaLightbox({
  rootSelector = "[data-docs-article]",
}: {
  /** 이 범위 안의 사진만 모은다. */
  rootSelector?: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const [items, setItems] = useState<ZoomItem[]>([])
  const [index, setIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const current = items[index]
  const total = items.length
  const hasMany = total > 1

  // 본문 사진 클릭을 위임 방식으로 가로챈다(서버에서 그린 사진에 핸들러를 붙이지 않아도 된다).
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const target = event.target instanceof Element ? event.target : null
      const anchor = target?.closest<HTMLAnchorElement>(ZOOM_SELECTOR)
      if (!anchor) return

      const root = document.querySelector(rootSelector) ?? document.body
      if (!root.contains(anchor)) return

      const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>(ZOOM_SELECTOR))
      const nextIndex = anchors.indexOf(anchor)
      if (nextIndex < 0) return

      event.preventDefault()
      triggerRef.current = anchor
      setItems(anchors.map(toItem))
      setIndex(nextIndex)
      setIsOpen(true)

      const dialog = dialogRef.current
      if (dialog && !dialog.open) {
        dialog.showModal()
      }
    }

    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [rootSelector])

  // 열려 있는 동안 뒤 페이지가 스크롤되지 않게 한다.
  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = "hidden"
    return () => {
      root.style.overflow = previous
    }
  }, [isOpen])

  // 앞뒤 사진을 미리 받아 넘길 때 기다리지 않게 한다.
  useEffect(() => {
    if (!isOpen || total < 2) return
    for (const offset of [1, -1]) {
      const neighbor = items[(index + offset + total) % total]
      if (neighbor?.src) {
        const preload = new window.Image()
        preload.src = neighbor.src
      }
    }
  }, [index, isOpen, items, total])

  const close = useCallback(() => {
    dialogRef.current?.close()
  }, [])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger && document.contains(trigger)) {
      trigger.focus({ preventScroll: true })
    }
  }, [])

  const go = useCallback(
    (step: number) => {
      if (total < 2) return
      setIndex((value) => (value + step + total) % total)
    },
    [total]
  )

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      go(1)
      return
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      go(-1)
      return
    }
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

  // 사진·버튼 바깥의 빈 곳을 누르면 닫는다.
  const handleStageClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLElement && event.target.dataset.lightboxBackdrop !== undefined) {
      close()
    }
  }

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null
      return
    }
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start || !hasMany) return
    // 손가락으로 확대한 상태에서는 넘기지 않는다.
    if ((window.visualViewport?.scale ?? 1) > 1.01) return

    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return
    go(dx < 0 ? 1 : -1)
  }

  const tall = current ? isTall(current) : false
  const description = current ? current.caption || current.alt : ""

  return (
    <dialog
      ref={dialogRef}
      aria-label="사진 크게 보기"
      aria-describedby={description ? "docs-lightbox-caption" : undefined}
      onClose={handleClose}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none overflow-hidden border-0 bg-[#111110]/[0.97] p-0 text-white backdrop:bg-transparent open:flex open:flex-col print:hidden"
    >
      {isOpen && current ? (
        <>
          <div className="flex shrink-0 items-center justify-between gap-3 px-2 py-2 sm:px-4 sm:py-3">
            <p className="pl-2 text-sm font-semibold tabular-nums text-white/75" aria-live="polite">
              {hasMany ? `${index + 1} / ${total}` : "사진 1장"}
            </p>
            <button
              type="button"
              autoFocus
              onClick={close}
              aria-label="닫기"
              className={cn(CONTROL_CLASS, "h-11 w-11")}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <div
            className="relative min-h-0 flex-1"
            onClick={handleStageClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {tall ? (
              <div
                data-lightbox-backdrop=""
                tabIndex={0}
                aria-label="사진을 위아래로 스크롤해 보세요"
                className="h-full overflow-y-auto overscroll-contain px-0 focus-visible:outline-none sm:px-16"
              >
                {/* 원본 해상도 그대로 보여 주는 확대 보기 — next/image 최적화 대상이 아니다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.src}
                  src={current.src}
                  alt={current.alt}
                  decoding="async"
                  className="mx-auto block h-auto w-full max-w-[1100px] bg-white"
                />
              </div>
            ) : (
              <div
                data-lightbox-backdrop=""
                className="flex h-full items-center justify-center px-0 sm:px-16"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.src}
                  src={current.src}
                  alt={current.alt}
                  decoding="async"
                  className="block max-h-full max-w-full bg-white object-contain"
                />
              </div>
            )}

            {hasMany ? (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="이전 사진"
                  className={cn(
                    CONTROL_CLASS,
                    "absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 border border-white/15 bg-black/40 sm:inline-flex"
                  )}
                >
                  <ChevronLeft className="h-6 w-6" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="다음 사진"
                  className={cn(
                    CONTROL_CLASS,
                    "absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 border border-white/15 bg-black/40 sm:inline-flex"
                  )}
                >
                  <ChevronRight className="h-6 w-6" aria-hidden />
                </button>
              </>
            ) : null}
          </div>

          <div className="shrink-0 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
            {description ? (
              <p
                id="docs-lightbox-caption"
                className="mx-auto max-w-3xl break-keep text-center text-sm leading-6 text-white/85 [overflow-wrap:anywhere]"
              >
                {description}
              </p>
            ) : null}
            {hasMany ? (
              <div className="mt-2 flex items-center justify-between gap-3 sm:hidden">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className={cn(CONTROL_CLASS, "h-11 gap-1 px-3 text-sm font-semibold")}
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                  이전
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className={cn(CONTROL_CLASS, "h-11 gap-1 px-3 text-sm font-semibold")}
                >
                  다음
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </dialog>
  )
}
