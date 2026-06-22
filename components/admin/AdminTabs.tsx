"use client"

import type { KeyboardEvent, ReactNode } from "react"
import { useId, useMemo, useRef } from "react"

import { cn } from "@/lib/utils"

export interface AdminTabItem<T extends string = string> {
  value: T
  label: string
  description?: string
  icon?: ReactNode
  badge?: ReactNode
}

interface AdminTabsProps<T extends string = string> {
  items: readonly AdminTabItem<T>[]
  value: T
  onValueChange: (value: T) => void
  label: string
  className?: string
  variant?: "segmented" | "subtle"
}

export default function AdminTabs<T extends string>({
  items,
  value,
  onValueChange,
  label,
  className,
  variant = "segmented",
}: AdminTabsProps<T>) {
  const id = useId()
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = Math.max(0, items.findIndex((item) => item.value === value))
  const buttonIds = useMemo(() => items.map((item) => `${id}-${item.value}`), [id, items])

  function focusTab(index: number) {
    const nextIndex = (index + items.length) % items.length
    const next = items[nextIndex]
    if (!next) return
    onValueChange(next.value)
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
        onKeyDown={handleKeyDown}
        className={cn(
          "inline-flex min-w-full gap-1 rounded-xl border border-black/[0.08] bg-white p-1 sm:min-w-0",
          variant === "subtle" && "border-transparent bg-[#F6F5F4]"
        )}
      >
        {items.map((item, index) => {
          const active = item.value === value
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
              tabIndex={active ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              className={cn(
                "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 sm:flex-none",
                active
                  ? "bg-[#111110] text-white"
                  : "text-[#1a1a1a]/55 hover:bg-[#F6F5F4] hover:text-[#111110]"
              )}
            >
              {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
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
