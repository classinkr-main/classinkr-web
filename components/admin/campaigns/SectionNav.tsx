"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { HubSectionDef } from "@/lib/marketing/hub-tabs"

// 상세·데이터 층의 섹션 내비 — 스티키 앵커 행. 탭이 아니라 같은 문서 안의 위치 이동이라
// tablist 가 아닌 <nav>+<a href="#id"> 로 만든다(AdminTabs 는 패널을 교체하는 탭에만 쓴다).
//
// 활성 표시는 IntersectionObserver 로 "지금 화면 상단에 걸린 섹션"을 따른다 — 클릭한 앵커가
// 아니라 실제 스크롤 위치가 정답이다(클릭 뒤 스크롤을 올리면 표시가 따라와야 한다).

export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element != null)
    if (elements.length === 0) return
    // 뷰포트 상단 1/3 띠 안에 들어온 섹션 중 가장 위의 것을 활성으로 본다.
    const visible = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top)
          else visible.delete(entry.target.id)
        }
        if (visible.size === 0) return
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]
        setActive(top[0])
      },
      { rootMargin: "-8% 0px -60% 0px", threshold: [0, 0.2] }
    )
    for (const element of elements) observer.observe(element)
    return () => observer.disconnect()
  }, [ids])
  return active
}

/**
 * 해시(#id)로 진입했을 때 그 섹션으로 스크롤한다 — 레거시 탭 매핑(?tab=meta → detail#campaigns)과
 * 코드 안 딥링크(data#budgets)의 착지 동작. ready 가 참이 된 뒤 한 번만 시도한다(섹션이 데이터
 * 로딩 뒤에 렌더되므로 마운트 직후에는 대상이 없을 수 있다).
 */
export function useScrollToHash(ready: boolean, ids: readonly string[]) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return
    const id = window.location.hash.replace(/^#/, "")
    if (!id || !ids.includes(id)) return
    const element = document.getElementById(id)
    if (!element) return
    // 스티키 내비 높이만큼 여유를 둔다 — scroll-mt 가 각 섹션에 있어 block:"start" 로 충분하다.
    element.scrollIntoView({ block: "start" })
  }, [ready, ids])
}

export function SectionNav({
  sections,
  label,
  className,
}: {
  sections: readonly HubSectionDef[]
  label: string
  className?: string
}) {
  const ids = sections.map((section) => section.id)
  const active = useActiveSection(ids)
  return (
    <nav
      aria-label={label}
      className={cn(
        // 어드민 셸의 main 이 스크롤 컨테이너라 top-0 으로 붙는다. 배경을 살짝 투명하게 두어
        // 아래 내용이 비치되 글자는 읽히게 한다.
        "sticky top-0 z-10 -mx-4 mb-4 border-b border-[#e8e8e4] bg-[#FAFAF8]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-9 lg:px-9",
        className
      )}
    >
      <div className="flex gap-0.5 overflow-x-auto">
        {sections.map((section) => {
          const on = section.id === active
          return (
            <a
              key={section.id}
              href={`#${section.id}`}
              aria-current={on ? "location" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-3 py-1.5 text-[12.5px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2",
                on ? "border-[#084734] text-[#111110]" : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
              )}
            >
              {section.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

/** 섹션 껍데기 — 앵커 id + 스티키 내비 아래 여백(scroll-mt) + 제목 한 줄. */
export function HubSection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id={`${id}-title`} className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-[12px] text-[#615D59]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
