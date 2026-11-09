"use client"

import Image from "next/image"
import Link from "next/link"
import { useId, useState } from "react"
import { ArrowRight } from "lucide-react"

import { getIntroAsset } from "@/lib/introduction/assets"
import { INTRO_CASE_FILTERS, INTRO_CASES, getIntroCasePath, type IntroCaseSector } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { Emphasis } from "./Emphasis"

type FilterId = "all" | IntroCaseSector

interface IntroCaseGridProps {
  /**
   * 카드 이름의 제목 단계. 기본 4 — 소개서 본문(h2 고객 사례 > h3 스마트 교실 구성) 안에 놓일 때다.
   * 사례 목록(/introduction/cases)처럼 h1 바로 아래면 2 를 넘긴다.
   */
  headingLevel?: 2 | 3 | 4
  className?: string
}

// 카드 폭: max-w-page(1296) − 거터 48×2 = 1200 → 3열(gap 24) 384 / lg 3열 / sm 2열 / 모바일 전폭
const COVER_SIZES =
  "(min-width: 1296px) 384px, (min-width: 1024px) calc((100vw - 144px) / 3), (min-width: 640px) calc((100vw - 72px) / 2), calc(100vw - 32px)"

const COUNTS = INTRO_CASE_FILTERS.reduce<Record<FilterId, number>>(
  (acc, filter) => {
    acc[filter.id] =
      filter.id === "all" ? INTRO_CASES.length : INTRO_CASES.filter((item) => item.sector === filter.id).length
    return acc
  },
  { all: 0, 공교육: 0, 사교육: 0, 기타교육: 0 }
)

/**
 * 스마트 교실 구성 사례 그리드 — 교육 분야 필터 + 사례 카드(사진·분야·국가·이름·한 줄 설명).
 *
 * - 필터는 하나만 고르는 범주 전환이라 칩이 아니라 index-tab + aria-pressed 다(controls §3.4 '칩을 쓰지 않는 곳').
 * - 카드는 사진 있는 카드라 sheet + hair, 반경 0·그림자 0. hover 는 경계 hair→strong 과 화살표 2px 뿐이다(cards_motion).
 * - 거른 카드는 지우지 않고 hidden 으로 숨긴다 — 필터를 오가도 이미 받은 사진을 다시 그리지 않는다.
 */
export function IntroCaseGrid({ headingLevel = 4, className }: IntroCaseGridProps) {
  const [active, setActive] = useState<FilterId>("all")
  const listId = useId()
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4"

  const activeLabel = INTRO_CASE_FILTERS.find((filter) => filter.id === active)?.label ?? "전체"
  const visibleCount = COUNTS[active]

  return (
    <div className={cn("min-w-0", className)}>
      <div className="border-b border-line-hair">
        <div role="group" aria-label="교육 분야로 사례 거르기" className="-mb-px flex flex-wrap gap-x-5 sm:gap-x-6">
          {INTRO_CASE_FILTERS.map((filter) => {
            const pressed = filter.id === active
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={pressed}
                aria-controls={listId}
                onClick={() => setActive(filter.id)}
                className="index-tab gap-1.5"
              >
                {filter.label}
                <span className="text-folio tabular-nums">{COUNTS[filter.id]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p role="status" className="mt-4 text-note text-fg-muted">
        {activeLabel} 사례 {visibleCount}개
      </p>

      <ul id={listId} className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {INTRO_CASES.map((item) => {
          const cover = getIntroAsset(item.cover)
          const hidden = active !== "all" && item.sector !== active
          return (
            <li key={item.slug} hidden={hidden} className="min-w-0">
              <Link
                href={getIntroCasePath(item.slug)}
                className="group flex h-full flex-col border border-line-hair bg-surface-sheet transition-colors duration-(--motion-base) ease-soft hover:border-line-strong hover:duration-(--motion-fast) focus-visible:border-line-strong active:border-line-strong"
              >
                {/* 사진은 카드 이름이 대신 말한다 — 링크 이름이 길어지지 않게 alt 는 비운다 */}
                <div className="relative aspect-[4/3] overflow-hidden bg-surface-skeleton">
                  <Image src={cover.src} alt="" fill sizes={COVER_SIZES} className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <p className="text-label text-fg-muted">
                    {item.sector} <span aria-hidden="true">·</span> {item.country}
                  </p>
                  <Heading className="mt-3 flex items-start justify-between gap-3 text-body-l font-semibold text-fg-ink">
                    <span className="min-w-0">{item.name}</span>
                    <ArrowRight aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-fg-accent arrow-nudge" />
                  </Heading>
                  <p className="mt-2 text-caption text-fg-body">
                    <Emphasis text={item.summary} />
                  </p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
