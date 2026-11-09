import { ArrowRight } from "lucide-react"

import { IntroFigure } from "@/components/introduction/IntroFigure"
import { TrackedLink } from "@/components/TrackedLink"

import { Lines, STORY_LINE, STORY_PRIMARY, StoryChapter, StoryChapterHead, StoryMat, folio } from "./primitives"
import { STORY_CLASSROOM, STORY_SOURCE } from "./story-copy"
import { StoryPdfLink } from "./StoryPdfLink"

const DIAGRAM_SIZES =
  "(min-width: 1296px) 626px, (min-width: 1024px) 52vw, (min-width: 640px) calc(100vw - 88px), calc(100vw - 72px)"
const PHOTO_SIZES = "(min-width: 1296px) 384px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, calc(100vw - 32px)"

/**
 * 04 교실까지 — 클래스인 X. 구성도(sunken 매트, 7칸) + 주요 스펙 목록(5칸) → 스마트 교실 사진 3단 → 제안서·쇼룸.
 * 스펙 숫자는 content.ts 「기술 스펙 요약」·하드웨어 상세에 있는 값만 쓴다.
 */
export function StoryClassroom() {
  const { id, kicker, title, lead, diagram, specsLabel, specs, photos, ctaLead, pdf, showroom } = STORY_CLASSROOM
  return (
    <StoryChapter id={id}>
      <StoryChapterHead id={id} folio={folio(4)} kicker={kicker} title={title} lead={lead} />

      <div className="mt-10 grid gap-10 md:mt-12 lg:grid-cols-12 lg:items-center lg:gap-x-6">
        <StoryMat className="lg:col-span-7">
          <IntroFigure asset={diagram.asset} alt={diagram.alt} sizes={DIAGRAM_SIZES} />
        </StoryMat>
        <div className="lg:col-span-5">
          <h3 className="sr-only">{specsLabel}</h3>
          <dl className="border-b border-line-hair">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line-hair py-4"
              >
                <dt className="text-body text-fg-body">{spec.label}</dt>
                <dd className="text-h3 tabular-nums text-fg-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <ul className="mt-14 grid gap-x-6 gap-y-10 sm:grid-cols-2 md:mt-20 lg:grid-cols-3">
        {photos.map((photo) => (
          <li key={photo.id} className="min-w-0">
            <IntroFigure
              asset={photo.asset}
              alt={photo.alt}
              sizes={PHOTO_SIZES}
              imageClassName="aspect-video object-cover"
            />
            <p className="mt-4 text-body-l font-semibold text-fg-ink">
              <Lines lines={photo.title} />
            </p>
          </li>
        ))}
      </ul>

      <div className="mt-14 flex flex-col gap-6 border-t border-line-hair pt-8 md:mt-20 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-deck text-body-l font-semibold text-fg-ink">{ctaLead}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <StoryPdfLink pdf={pdf} ctaId={pdf.ctaId} className={STORY_LINE} />
          <TrackedLink
            href={showroom.href}
            ctaId={showroom.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={STORY_PRIMARY}
          >
            {showroom.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
        </div>
      </div>
    </StoryChapter>
  )
}
