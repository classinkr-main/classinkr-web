import Link from "next/link"
import { Fragment } from "react"
import { ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"

import { PROOF_TEXT_LINK, ProofFigure, ProofSection, ProofSectionHead } from "./ProofParts"
import { PROOF_STORIES, type ProofStory } from "./proof-copy"

// 사진 폭(64rem 이상 기준 max-w-page 1296 − 거터 96 = 1200)
const SPLIT_LEAD_SIZES = "(min-width: 1296px) 690px, (min-width: 1024px) 56vw, calc(100vw - 32px)"
const SPLIT_SMALL_SIZES = "(min-width: 1296px) 340px, (min-width: 1024px) 28vw, 50vw"
const PAIR_SIZES = "(min-width: 1296px) 280px, (min-width: 1024px) 22vw, 50vw"

/**
 * 01 현장 사례 — 네 기관. 앞의 둘은 큰 사진 + 작은 사진 둘과 글을 7 : 4 로 엇갈려 놓고(둘째는 좌우 반전),
 * 뒤의 둘은 두 단으로 나란히 둔다. 휴대폰에서는 모두 사진 → 글 순서다.
 * 사례 링크는 사례 상세(/introduction/cases/<slug>)로 가는 일반 링크다.
 */
export function ProofStories() {
  const { id, folio, kicker, title, lead, split, pair } = PROOF_STORIES
  return (
    <ProofSection id={id}>
      <ProofSectionHead id={id} folio={folio} kicker={kicker} title={title} lead={lead} />

      {split.map((story, index) => {
        const flipped = index % 2 === 1
        const [leadPhoto, ...smallPhotos] = story.photos
        return (
          <article
            key={story.slug}
            aria-labelledby={`proof-story-${story.slug}`}
            className={cn(
              "lg:grid lg:grid-cols-12 lg:gap-x-6",
              index === 0 ? "mt-12 md:mt-16" : "mt-16 border-t border-line-hair pt-16 md:mt-20 md:pt-20"
            )}
          >
            <div
              className={cn(
                "flex flex-col gap-3 lg:row-start-1",
                flipped ? "lg:col-span-7 lg:col-start-6" : "lg:col-span-7 lg:col-start-1"
              )}
            >
              {leadPhoto ? (
                <ProofFigure photo={leadPhoto} sizes={SPLIT_LEAD_SIZES} frameClassName="aspect-case" />
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {smallPhotos.map((photo) => (
                  <ProofFigure key={photo.asset} photo={photo} sizes={SPLIT_SMALL_SIZES} frameClassName="aspect-case" />
                ))}
              </div>
            </div>
            <StoryText
              story={story}
              className={cn(
                "mt-8 lg:row-start-1 lg:mt-0 lg:pt-2",
                flipped ? "lg:col-span-4 lg:col-start-1" : "lg:col-span-4 lg:col-start-9"
              )}
            />
          </article>
        )
      })}

      <div className="mt-16 grid gap-16 border-t border-line-hair pt-16 md:mt-20 md:pt-20 lg:grid-cols-2 lg:gap-x-16">
        {pair.map((story) => (
          <article key={story.slug} aria-labelledby={`proof-story-${story.slug}`} className="min-w-0">
            <div className="grid grid-cols-2 gap-3">
              {story.photos.map((photo) => (
                <ProofFigure key={photo.asset} photo={photo} sizes={PAIR_SIZES} frameClassName="aspect-[4/3]" />
              ))}
            </div>
            <StoryText story={story} className="mt-8" />
          </article>
        ))}
      </div>
    </ProofSection>
  )
}

/** 이야기 글 — 라벨 → 기관 이름(h3) → 한 줄 요지 → 본문 → 구성·운영 표(dl) → 사례 보기 */
function StoryText({ story, className }: { story: ProofStory; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col items-start", className)}>
      <p className="text-label text-fg-muted">{story.label}</p>
      <h3 id={`proof-story-${story.slug}`} className="mt-3 text-h3 text-fg-ink">
        {story.name}
      </h3>
      <p className="mt-4 text-body-l font-medium text-fg-ink">{story.pull}</p>
      <p className="mt-4 max-w-measure text-body text-fg-body">{story.body}</p>
      <dl className="mt-6 grid w-full grid-cols-[4.75rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-line-hair pt-4 text-caption">
        {story.facts.map((fact) => (
          <Fragment key={fact.term}>
            <dt className="text-fg-muted">{fact.term}</dt>
            <dd className="text-fg-ink">{fact.detail}</dd>
          </Fragment>
        ))}
      </dl>
      <Link
        href={story.href}
        aria-label={`${story.name} 사례 보기`}
        className={cn(PROOF_TEXT_LINK, "mt-4")}
      >
        {PROOF_STORIES.linkLabel}
        <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
      </Link>
    </div>
  )
}
