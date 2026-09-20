"use client"

// 전 품목 고르기 — 빠른 기록 시트의 <select> 를 검색 가능한 목록으로 바꾼다.
//
// 왜: 주요 4종(86"·75" IFP·STD1·T1)은 칩으로 한 번에 고르지만, 그 밖(OPS·케이블·브라켓 등)은
// 전 품목 select 를 훑어야 했다. 입고표는 이미 검색 picker 를 쓴다(감사 2026-09-20 B5).
//
// 여기서는 **있는 품목만** 고른다. 목록에 없는 품목은 기존 "직접 입력"이 그대로 담당한다 —
// 품목 생성 경로를 둘로 늘리지 않는다.
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Check, ChevronDown, Search } from "lucide-react"

import { normalizeHardwareText, type HardwareItem } from "./shared"

/** 검색어로 품목을 거른다 — 공백·대소문자·구두점을 무시한다(입고표 품목 매칭과 같은 기준). */
export function filterHardwareItems(items: readonly HardwareItem[], query: string): HardwareItem[] {
  const needle = normalizeHardwareText(query.trim())
  if (!needle) return [...items]
  return items.filter((item) => normalizeHardwareText(item.name).includes(needle))
}

export interface ProductPickerProps {
  items: readonly HardwareItem[]
  value: string
  onChange: (itemId: string) => void
  disabled?: boolean
  ariaLabel: string
  placeholder?: string
}

export default function ProductPicker({
  items,
  value,
  onChange,
  disabled,
  ariaLabel,
  placeholder = "품목 검색",
}: ProductPickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlight, setHighlight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  const matches = useMemo(() => filterHardwareItems(items, query), [items, query])
  const activeIndex = matches.length === 0 ? 0 : Math.min(highlight, matches.length - 1)
  const selected = items.find((item) => item.id === value) ?? null

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
    }
  }, [open])

  const commit = (itemId: string) => {
    onChange(itemId)
    setOpen(false)
    setQuery("")
  }

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === "Escape") {
      // 시트까지 닫지 않는다 — document Escape 핸들러가 defaultPrevented 를 본다.
      event.preventDefault()
      setOpen(false)
      return
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (matches.length === 0) return
      event.preventDefault()
      setHighlight(() => {
        const next = event.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1
        return (next + matches.length) % matches.length
      })
      return
    }
    if (event.key === "Enter") {
      const item = matches[activeIndex]
      if (!item) return
      event.preventDefault()
      commit(item.id)
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="mt-2 flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-left text-[13px] font-semibold text-[#111110] outline-none transition hover:bg-[#F6F5F4] focus-visible:border-[#084734] focus-visible:ring-2 focus-visible:ring-[#084734]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="min-w-0 truncate">{selected?.name ?? "품목 선택"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#A39E98]" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <div className="relative border-b border-[rgba(0,0,0,0.06)] p-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setHighlight(0)
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={placeholder}
              aria-label={`${ariaLabel} 검색`}
              aria-controls={listId}
              autoComplete="off"
              className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white pl-7 pr-2.5 text-[13px] text-[#111110] outline-none placeholder:text-[#A39E98] focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
            />
          </div>
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-[12px] font-semibold text-[#A39E98]">
              맞는 품목이 없습니다 — 아래 &quot;직접 입력&quot;으로 새 품목을 적으세요.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-56 overflow-y-auto py-1">
              {matches.map((item, index) => {
                const active = index === activeIndex
                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={item.id === value}
                    onMouseEnter={() => setHighlight(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => commit(item.id)}
                    className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                      active ? "bg-[#F6F5F4] text-[#111110]" : "text-[#31302E]"
                    }`}
                  >
                    <span className="min-w-0 truncate font-semibold">{item.name}</span>
                    {item.id === value ? <Check className="h-3.5 w-3.5 shrink-0 text-[#084734]" /> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
