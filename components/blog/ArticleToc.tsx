"use client"

import { useEffect, useState } from "react"

import type { BlogHeading } from "@/lib/blog-markdown"

/** 데스크톱 좌측 목차 — 지금 읽고 있는 제목을 그린 막대로 표시한다. */
export function ArticleToc({ headings }: { headings: BlogHeading[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id)

  useEffect(() => {
    const targets = headings
      .map((heading) => document.getElementById(heading.id))
      .filter((el): el is HTMLElement => el !== null)
    if (targets.length === 0) return

    // 헤더 바로 아래 띠(상단 ~30%)에 들어온 제목 중 가장 위의 것을 현재 위치로 본다.
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActiveId(top.target.id)
      },
      { rootMargin: "-96px 0px -70% 0px" },
    )
    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [headings])

  return (
    <nav aria-label="목차">
      <p className="mb-3 text-[12px] font-semibold text-[#615D59]">목차</p>
      <ol className="border-l border-black/[0.08]">
        {headings.map((heading) => {
          const active = heading.id === activeId
          return (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                aria-current={active ? "location" : undefined}
                className={`-ml-px block border-l-2 py-1.5 text-[13px] leading-5 transition-colors ${
                  heading.level === 3 ? "pl-6" : "pl-4"
                } ${
                  active
                    ? "border-[#084734] font-medium text-[#111110]"
                    : "border-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                {heading.text}
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
