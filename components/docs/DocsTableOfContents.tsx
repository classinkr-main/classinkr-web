"use client"

import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { ChevronDown, ListOrdered } from "lucide-react"

import type { DocsTocItem } from "./types"
import { cn } from "./utils"

/** 고정 헤더 아래 이만큼 내려온 지점을 지난 섹션을 "지금 읽는 섹션"으로 본다(px). */
const READING_LINE = 132

/**
 * 스크롤 위치로 지금 읽는 섹션을 찾는다.
 * 섹션이 길어 제목이 화면 위로 사라져도 그 섹션이 계속 강조되도록, 교차 관찰 대신
 * "읽는 선을 지난 마지막 섹션"을 고른다. 미리보기처럼 안쪽 상자가 스크롤되는 경우도 잡도록
 * 캡처 단계에서 모든 scroll 이벤트를 듣는다.
 */
function useActiveSection(ids: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const key = ids.join("|")

  useEffect(() => {
    const sectionIds = key ? key.split("|") : []
    if (sectionIds.length === 0) return

    let frame = 0
    const update = () => {
      frame = 0
      let next: string | null = null

      for (const id of sectionIds) {
        const element = document.getElementById(id)
        if (!element) continue
        if (element.getBoundingClientRect().top - READING_LINE <= 0) {
          next = id
        } else {
          break
        }
      }

      // 맨 아래까지 내렸는데 마지막 섹션이 짧아 읽는 선에 못 닿으면 마지막 섹션을 강조한다.
      const scrolledToBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (scrolledToBottom && next) {
        const lastElement = document.getElementById(sectionIds[sectionIds.length - 1])
        if (lastElement && lastElement.getBoundingClientRect().top < window.innerHeight) {
          next = sectionIds[sectionIds.length - 1]
        }
      }

      // 아직 첫 섹션에 닿기 전(머리말을 읽는 중)에는 첫 항목을 강조해 둔다.
      const resolved = next ?? sectionIds[0]
      setActiveId((previous) => (previous === resolved ? previous : resolved))
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }

    schedule()
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule, { passive: true })
    window.addEventListener("hashchange", schedule)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      document.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
      window.removeEventListener("hashchange", schedule)
    }
  }, [key])

  return [activeId, setActiveId] as const
}

export interface DocsTableOfContentsProps {
  items: DocsTocItem[]
  title?: string
  className?: string
  /** 목차 아래에 붙일 보조 동작(예: PDF로 저장). */
  footer?: ReactNode
}

/** 데스크톱 오른쪽 목차 — 지금 읽는 섹션을 왼쪽 2px 막대로 표시한다. */
export function DocsTableOfContents({
  items,
  title = "목차",
  className,
  footer,
}: DocsTableOfContentsProps) {
  const [activeId, setActiveId] = useActiveSection(items.map((item) => item.id))

  if (items.length === 0) {
    return null
  }

  return (
    <aside className={cn("relative z-10 bg-[#FAFAF8] pb-4", className)}>
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#084734]">{title}</p>
      <nav className="mt-3" aria-label="문서 목차">
        <ol className="border-l border-black/[0.08]">
          {items.map((item) => {
            const isActive = item.id === activeId

            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={isActive ? "location" : undefined}
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    "-ml-px block break-keep border-l-2 py-1.5 pl-3 text-sm leading-5 transition-colors duration-150 [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]",
                    isActive
                      ? "border-[#084734] font-semibold text-[#111110]"
                      : "border-transparent text-[#615D59] hover:border-black/[0.16] hover:text-[#111110]"
                  )}
                >
                  {item.title}
                </a>
              </li>
            )
          })}
        </ol>
      </nav>
      {footer ? <div className="mt-5 border-t border-black/[0.08] pt-4">{footer}</div> : null}
    </aside>
  )
}

export interface DocsInlineTocProps {
  items: DocsTocItem[]
  title?: string
  className?: string
}

/**
 * 오른쪽 목차가 없는 화면(1280px 미만)에서 본문 위에 두는 접힌 목차.
 * JS 가 없어도 <details> 로 열고 닫히며, 항목을 고르면 닫고 그 섹션으로 이동한다.
 */
export function DocsInlineToc({ items, title = "이 문서의 순서", className }: DocsInlineTocProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)

  if (items.length < 2) {
    return null
  }

  return (
    <details
      ref={detailsRef}
      className={cn(
        "group/toc rounded-lg border border-black/[0.08] bg-white print:hidden",
        className
      )}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2.5 text-sm font-bold text-[#111110]">
          <ListOrdered className="h-4 w-4 shrink-0 text-[#084734]" aria-hidden />
          {title}
          <span className="font-medium tabular-nums text-[#615D59]">{items.length}개</span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-[#615D59] transition-transform duration-150 group-open/toc:rotate-180"
          aria-hidden
        />
      </summary>
      <nav aria-label={title} className="border-t border-black/[0.08] px-2 py-2">
        <ol>
          {items.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false
                }}
                className="flex gap-3 rounded-md px-2 py-2.5 text-[15px] leading-6 text-[#31302E] transition-colors duration-150 hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
              >
                <span className="w-6 shrink-0 text-[13px] font-semibold leading-6 tabular-nums text-[#615D59]">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 break-keep [overflow-wrap:anywhere]">{item.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  )
}
