"use client"

// 고객사 고르기 — 자유 텍스트 + datalist 를 대체한다.
//
// 왜: 출고 기록에서 고객사는 매번 손으로 치는 유일한 칸이었다(감사 2026-09-20). datalist 는 모바일에서
// 제안이 사실상 뜨지 않아 창고·현장에서는 전체 타이핑이었고, 표기가 흔들리면 고객 집계(customerLabel)와
// 360 링크가 갈라진다. 목록은 제안일 뿐이라 **새 고객사는 그대로 입력해 저장된다** — 현장을 막지 않는다.
//
// Escape 는 preventDefault 로 삼켜 목록만 닫는다. 시트(빠른 기록)의 document Escape 핸들러는
// defaultPrevented 를 보고 넘어간다 — 입고표 품목 검색과 같은 규약이다.
import { useEffect, useId, useMemo, useRef, useState } from "react"
import type { KeyboardEvent as ReactKeyboardEvent } from "react"
import { Check, Search } from "lucide-react"

import { normalizeHardwareText } from "./shared"

const MAX_VISIBLE = 8

export type CustomerPickerKeyIntent = "commit" | "close" | "next" | "previous" | null

/**
 * 키 하나가 목록에 무엇을 시키는지 — 순수 판정이라 따로 테스트한다.
 *
 * Enter 가 커밋이 되려면 **사용자가 위아래로 고른 뒤**여야 한다. 포커스만으로 목록이 열리고 첫 줄이
 * 강조되기 때문에, 그 조건이 없으면 빈 고객사 칸에서 저장하려고 누른 Enter 가 최근 고객사를 조용히
 * 적어 넣는다(리뷰 2026-09-21). 고르지 않은 Enter 는 null 을 돌려 폼으로 흘려보낸다.
 */
export function customerPickerKeyIntent(input: {
  key: string
  open: boolean
  navigated: boolean
  rowCount: number
  isComposing: boolean
}): CustomerPickerKeyIntent {
  if (input.isComposing) return null
  if (input.key === "Escape") return input.open ? "close" : null
  if (input.key === "ArrowDown" || input.key === "ArrowUp") {
    if (input.rowCount === 0) return null
    return input.key === "ArrowDown" ? "next" : "previous"
  }
  if (input.key === "Enter") {
    if (!input.open || !input.navigated || input.rowCount === 0) return null
    return "commit"
  }
  return null
}

export interface CustomerPickerRow {
  key: string
  label: string
  isNew: boolean
}

/**
 * 보여 줄 줄 목록 — 순수 계산이라 따로 테스트한다(입고표 모델과 같은 관례).
 *
 * 매칭은 normalizeHardwareText(공백·대소문자·구두점 무시)로 본다. 목록에 없는 이름이면 마지막에
 * "새 고객사로 기록" 줄을 붙인다 — 목록에 없다고 입력을 막지 않는다.
 */
export function buildCustomerPickerRows(options: readonly string[], value: string): CustomerPickerRow[] {
  const query = value.trim()
  const needle = normalizeHardwareText(query)
  const matched = (needle ? options.filter((option) => normalizeHardwareText(option).includes(needle)) : options)
    .slice(0, MAX_VISIBLE)
  const exact = options.some((option) => normalizeHardwareText(option) === needle)

  const rows: CustomerPickerRow[] = matched.map((option) => ({ key: option, label: option, isNew: false }))
  if (query.length > 0 && !exact) rows.push({ key: `__new__${query}`, label: query, isNew: true })
  return rows
}

export interface CustomerPickerProps {
  value: string
  onChange: (value: string) => void
  /** 제안 목록 — 최근 출고 고객사 순. */
  options: readonly string[]
  placeholder?: string
  ariaLabel: string
  className?: string
  disabled?: boolean
}

export default function CustomerPicker({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className,
  disabled,
}: CustomerPickerProps) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  // Enter 로 목록 값을 넣는 것은 **사용자가 위아래로 골랐을 때만**이다.
  // 포커스만으로 목록이 열리고 첫 줄이 강조되므로, 빈 칸에서 Enter(=저장)가 최근 고객사를 조용히
  // 적어 넣는 사고가 났다(리뷰 2026-09-21). 그 Enter 는 폼으로 그대로 흘려보낸다.
  const [navigated, setNavigated] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(() => buildCustomerPickerRows(options, value), [options, value])
  // 목록이 줄어들면 저장된 하이라이트가 범위를 넘는다 — state 를 되돌리는 대신 그릴 때 잘라 쓴다.
  const activeIndex = rows.length === 0 ? 0 : Math.min(highlight, rows.length - 1)

  // 바깥을 누르면 닫는다 — 시트 안에서 열리므로 백드롭 클릭까지 가기 전에 목록만 정리한다.
  useEffect(() => {
    if (!open) return
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

  const commit = (label: string) => {
    onChange(label)
    setOpen(false)
    setNavigated(false)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    const intent = customerPickerKeyIntent({
      key: event.key,
      open,
      navigated,
      rowCount: rows.length,
      isComposing: event.nativeEvent.isComposing,
    })
    if (!intent) return

    if (intent === "close") {
      // 시트가 함께 닫히지 않게 한다(document 핸들러가 defaultPrevented 를 본다).
      event.preventDefault()
      setOpen(false)
      setNavigated(false)
      return
    }
    if (intent === "next" || intent === "previous") {
      event.preventDefault()
      setNavigated(true)
      if (!open) {
        setOpen(true)
        setHighlight(0)
        return
      }
      setHighlight(() => {
        const next = intent === "next" ? activeIndex + 1 : activeIndex - 1
        return (next + rows.length) % rows.length
      })
      return
    }
    const row = rows[activeIndex]
    if (!row) return
    // 목록에서 고르는 Enter 는 폼 제출로 새지 않는다.
    event.preventDefault()
    commit(row.label)
  }

  const activeRowId = open && rows[activeIndex] ? `${listId}-${activeIndex}` : undefined

  return (
    <div ref={wrapperRef} className="relative">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setOpen(true)
          setHighlight(0)
          setNavigated(false)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeRowId}
        autoComplete="off"
        className={className}
      />
      {open && rows.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-[rgba(0,0,0,0.08)] bg-white py-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        >
          {rows.map((row, index) => {
            const selected = index === activeIndex
            return (
              <li
                key={row.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlight(index)}
                // mousedown 기본동작(포커스 이동)을 막아야 click 이 오기 전에 목록이 닫히지 않는다.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit(row.label)}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] ${
                  selected ? "bg-[#F6F5F4] text-[#111110]" : "text-[#31302E]"
                }`}
              >
                <span className="min-w-0 truncate font-semibold">{row.label}</span>
                {row.isNew ? (
                  <span className="shrink-0 text-[11px] font-bold text-[#084734]">새 고객사로 기록</span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-[#A39E98]">
                    {value.trim() === row.label ? <Check className="h-3 w-3 text-[#084734]" /> : <Search className="h-3 w-3" />}
                    최근 출고
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
