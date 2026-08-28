"use client"

import type { KeyboardEvent, ReactNode } from "react"
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react"

import { cn } from "@/lib/utils"

export interface AdminTabItem<T extends string = string> {
  value: T
  label: string
  /** 탭 아래 보조 설명. 띠가 2줄이 되므로 상시 노출이 필요한 곳에만 쓴다 — 그 외에는 title. */
  description?: string
  /** 호버·포커스 시에만 뜨는 설명. 띠 높이를 늘리지 않는다. */
  title?: string
  icon?: ReactNode
  badge?: ReactNode
}

interface AdminTabsProps<T extends string = string> {
  items: readonly AdminTabItem<T>[]
  value: T
  onValueChange: (value: T) => void
  label: string
  className?: string
  /**
   * segmented(기본)=검은 필 세그먼트, subtle=저채도 세그먼트,
   * underline=밑줄 탭(quotes 등 기존 밑줄형 탭 행과 동일 시각 — 기계만 통일, 2026-08-28 감사 [2]).
   */
  variant?: "segmented" | "subtle" | "underline"
  /**
   * 탭 내용이 렌더되는 단일 tabpanel 컨테이너의 id(2026-08-18 a11y).
   * 소비처가 내용 컨테이너에 role="tabpanel" + 이 id를 달면 탭 버튼의 aria-controls가
   * 그 컨테이너를 가리킨다 — tablist만 절반 구현되던 계약의 나머지 절반.
   */
  panelId?: string
}

export default function AdminTabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
  variant = "segmented",
  panelId,
}: AdminTabsProps<T>) {
  const id = useId()
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [optimisticValue, setOptimisticValue] = useState(value)
  const [isPending, startTransition] = useTransition()
  const buttonIds = useMemo(() => items.map((item) => `${id}-${item.value}`), [id, items])
  const activeValue = items.some((item) => item.value === optimisticValue)
    ? optimisticValue
    : value
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === activeValue))

  useEffect(() => {
    setOptimisticValue(value)
  }, [value])

  function selectTab(nextValue: T) {
    if (nextValue === activeValue) return

    setOptimisticValue(nextValue)
    startTransition(() => {
      onValueChange(nextValue)
    })
  }

  function focusTab(index: number) {
    const nextIndex = (index + items.length) % items.length
    const next = items[nextIndex]
    if (!next) return
    selectTab(next.value)
    buttonRefs.current[nextIndex]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      focusTab(activeIndex + 1)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      focusTab(activeIndex - 1)
    } else if (event.key === "Home") {
      event.preventDefault()
      focusTab(0)
    } else if (event.key === "End") {
      event.preventDefault()
      focusTab(items.length - 1)
    }
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div
        role="tablist"
        aria-label={label}
        aria-busy={isPending || undefined}
        onKeyDown={handleKeyDown}
        className={cn(
          variant === "underline"
            ? "inline-flex min-w-full gap-0.5 sm:min-w-0"
            : "inline-flex min-w-full gap-1 rounded-xl border border-black/[0.08] bg-white p-1 sm:min-w-0",
          variant === "subtle" && "border-transparent bg-[#F6F5F4]"
        )}
      >
        {items.map((item, index) => {
          const active = item.value === activeValue
          return (
            <button
              key={item.value}
              ref={(node) => {
                buttonRefs.current[index] = node
              }}
              id={buttonIds[index]}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={panelId}
              tabIndex={active ? 0 : -1}
              onClick={() => selectTab(item.value)}
              title={item.title}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2",
                variant === "underline"
                  ? cn(
                      "shrink-0 justify-start whitespace-nowrap border-b-2 px-3",
                      active
                        ? "border-[#084734] text-[#111110]"
                        : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
                    )
                  : cn(
                      "flex-1 justify-center rounded-lg px-3 py-2 sm:flex-none",
                      active
                        ? "bg-[#111110] text-white"
                        : "text-[#1a1a1a]/55 hover:bg-[#F6F5F4] hover:text-[#111110]"
                    )
              )}
            >
              {item.icon ? (
                <span
                  aria-hidden="true"
                  className={
                    variant === "underline" ? (active ? "text-[#084734]" : "text-[#1a1a1a]/40") : undefined
                  }
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0">
                <span className="block whitespace-nowrap">{item.label}</span>
                {item.description ? (
                  <span
                    className={cn(
                      "mt-0.5 hidden whitespace-nowrap text-[10.5px] font-medium min-[420px]:block",
                      active ? "text-white/70" : "text-[#615D59]"
                    )}
                  >
                    {item.description}
                  </span>
                ) : null}
              </span>
              {item.badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    active ? "bg-white/15 text-white/85" : "bg-[#ECFDF5] text-[#084734]"
                  )}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
