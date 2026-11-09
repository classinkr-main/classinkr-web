import { ArrowRight } from "lucide-react"

import { IntroFigure } from "@/components/introduction/IntroFigure"
import { IntroVideoPlayer } from "@/components/introduction/IntroVideoPlayer"
import { TrackedLink } from "@/components/TrackedLink"
import { getIntroCasePath, type IntroCase } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { Lines, STORY_TEXT_LINK, StoryChapter, StoryChapterHead, folio } from "./primitives"
import { STORY_CASES, STORY_CTA, STORY_HREF, STORY_SOURCE, storyVideoKey, type StoryCaseStory } from "./story-copy"

const FEATURE_SIZES =
  "(min-width: 1296px) 690px, (min-width: 1024px) 56vw, (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
const PAIR_SIZES =
  "(min-width: 1296px) 588px, (min-width: 768px) 46vw, (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"

/**
 * 05 고객 사례 — 대표 사례 1(사진 7칸 · 글 5칸) → 두 사례 → 영상으로 보는 현장(화판 수업 · 디지털 교과서 · 교실 둘러보기)
 * → 도입 기관 17곳 전체 링크. 분류 표지는 알약 대신 글자(비상호작용 pill 0). 사례 링크는 /introduction/cases/<slug>.
 */
export function StoryCases() {
  const { id, kicker, title, lead, featured, pair, videos, tour, list } = STORY_CASES
  return (
    <StoryChapter id={id}>
      <StoryChapterHead id={id} folio={folio(5)} kicker={kicker} title={title} lead={lead} />

      <article
        aria-labelledby="story-case-featured"
        className="mt-10 grid gap-8 md:mt-12 lg:grid-cols-12 lg:items-center lg:gap-x-6"
      >
        <IntroFigure
          asset={featured.image.asset}
          alt={featured.image.alt}
          sizes={FEATURE_SIZES}
          className="lg:col-span-7"
        />
        <div className="lg:col-span-5">
          <CaseTags story={featured} />
          <h3 id="story-case-featured" className="mt-3 text-h3 text-fg-ink">
            <Lines lines={featured.title} />
          </h3>
          <p className="mt-5 text-body-l text-fg-body">{featured.body}</p>
          <p className="mt-5 text-label text-fg-ink">{featured.item.name}</p>
          <CaseDetailLink item={featured.item} className="mt-2" />
        </div>
      </article>

      <div className="mt-16 grid gap-x-6 gap-y-14 md:mt-20 md:grid-cols-2">
        {pair.map((story) => (
          <article key={story.item.slug} aria-labelledby={`story-case-${story.item.slug}`} className="min-w-0">
            <IntroFigure
              asset={story.image.asset}
              alt={story.image.alt}
              sizes={PAIR_SIZES}
              imageClassName="aspect-case object-cover"
            />
            <CaseTags story={story} className="mt-6" />
            <h3 id={`story-case-${story.item.slug}`} className="mt-3 text-h3 text-fg-ink">
              <Lines lines={story.title} />
            </h3>
            <p className="mt-4 text-body-l text-fg-body">{story.body}</p>
            <p className="mt-4 text-label text-fg-ink">{story.item.name}</p>
            <CaseDetailLink item={story.item} className="mt-1" />
          </article>
        ))}
      </div>

      {/* 영상으로 보는 현장 — 화판 수업 */}
      <div className="mt-20 border-t border-line-hair pt-8 md:mt-28">
        <div className="lg:grid lg:grid-cols-12 lg:items-end lg:gap-x-6">
          <div className="lg:col-span-7">
            <p className="text-label text-fg-muted">{videos.kicker}</p>
            <h3 className="mt-3 text-h3 text-fg-ink">
              <Lines lines={videos.title} />
            </h3>
          </div>
          <p className="mt-5 text-body text-fg-body lg:col-span-5 lg:mt-0">{videos.body}</p>
        </div>

        <div className="mt-10 grid gap-x-6 gap-y-10 md:grid-cols-2">
          {videos.lead.map((video) => (
            <IntroVideoPlayer key={storyVideoKey(video)} video={video} source={STORY_SOURCE} />
          ))}
        </div>

        <div className="mt-14 grid gap-8 md:mt-16 lg:grid-cols-12 lg:items-center lg:gap-x-6">
          <div className="lg:col-span-4">
            <p className="text-label text-fg-muted">
              {videos.digital.item.sector} · {videos.digital.method}
            </p>
            <h4 className="mt-3 text-h3 text-fg-ink">
              <Lines lines={videos.digital.title} />
            </h4>
            <p className="mt-4 text-body text-fg-body">{videos.digital.item.summary}</p>
            <CaseDetailLink item={videos.digital.item} className="mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:col-span-8">
            {videos.digital.videos.map((video) => (
              <IntroVideoPlayer key={storyVideoKey(video)} video={video} source={STORY_SOURCE} />
            ))}
          </div>
        </div>
      </div>

      {/* 교실을 직접 둘러보세요 */}
      <div className="mt-20 border-t border-line-hair pt-8 md:mt-28">
        <h3 className="text-h3 text-fg-ink">{tour.title}</h3>
        <div className="mt-8 grid gap-x-6 gap-y-10 md:grid-cols-2">
          {tour.items.map(({ item, video }) => (
            <div key={item.slug} className="min-w-0">
              <IntroVideoPlayer video={video} source={STORY_SOURCE} hideCaption />
              <p className="mt-3 text-caption text-fg-muted">
                <span className="text-fg-body">{video.title}</span>
                {" · "}
                <CaseNameLink item={item} ctaId={STORY_CTA.caseDetail} />
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 도입 기관 17곳 */}
      <div className="mt-20 border-t border-line-hair pt-8 md:mt-28">
        <h3 className="text-h3 text-fg-ink">{list.title}</h3>
        <div className="mt-8 grid gap-x-6 gap-y-8 lg:grid-cols-3">
          {list.groups.map((group) => (
            <div key={group.sector} className="min-w-0">
              <p className="text-label text-fg-muted">
                {group.sector} · <span className="tabular-nums">{group.items.length}</span>
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {group.items.map((item) => (
                  <li key={item.slug}>
                    <TrackedLink
                      href={getIntroCasePath(item.slug)}
                      ctaId={STORY_CTA.caseList}
                      tracking={{ source: STORY_SOURCE, slug: item.slug }}
                      className="inline-flex min-h-11 items-center rounded-(--radius-control) border border-line-control px-3.5 text-ui text-fg-ink transition-colors duration-(--motion-fast) ease-soft hover:border-line-ink"
                    >
                      {item.name}
                    </TrackedLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <TrackedLink
          href={STORY_HREF.cases}
          ctaId={STORY_CTA.casesAll}
          tracking={{ source: STORY_SOURCE }}
          className={cn(STORY_TEXT_LINK, "mt-8")}
        >
          {list.allLabel}
          <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
        </TrackedLink>
      </div>
    </StoryChapter>
  )
}

/** 분류 · 수업 방식 — 알약 대신 회색 라벨 글자 */
function CaseTags({ story, className }: { story: StoryCaseStory; className?: string }) {
  return (
    <p className={cn("text-label text-fg-muted", className)}>
      {story.item.sector} · {story.method}
    </p>
  )
}

/** '사례 자세히 보기' — 같은 문구가 여러 번 나오므로 읽기 도구에는 기관 이름을 덧붙인다 */
function CaseDetailLink({ item, className }: { item: IntroCase; className?: string }) {
  return (
    <TrackedLink
      href={getIntroCasePath(item.slug)}
      ctaId={STORY_CTA.caseDetail}
      tracking={{ source: STORY_SOURCE, slug: item.slug }}
      className={cn(STORY_TEXT_LINK, className)}
    >
      {STORY_CASES.detailLabel}
      <span className="sr-only">: {item.name}</span>
      <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
    </TrackedLink>
  )
}

function CaseNameLink({ item, ctaId }: { item: IntroCase; ctaId: string }) {
  return (
    <TrackedLink
      href={getIntroCasePath(item.slug)}
      ctaId={ctaId}
      tracking={{ source: STORY_SOURCE, slug: item.slug }}
      className="link-body"
    >
      {item.name}
    </TrackedLink>
  )
}
