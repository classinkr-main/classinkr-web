import { Fragment } from "react"
import { ArrowDown, ArrowRight, Check } from "lucide-react"

import { Emphasis } from "@/components/introduction/Emphasis"
import { IntroFigure } from "@/components/introduction/IntroFigure"
import { IntroVideoPlayer } from "@/components/introduction/IntroVideoPlayer"
import { TrackedLink } from "@/components/TrackedLink"
import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import {
  Lines,
  STORY_LINE,
  STORY_PRIMARY,
  StoryChapter,
  StoryChapterHead,
  StoryMat,
  folio,
} from "./primitives"
import { STORY_SOLUTION, STORY_SOURCE, storyVideoKey, type StoryStep, type StoryStepMedia } from "./story-copy"

// 7칸 매트 안 캡처 폭: 1296 → 690 − 64, 그 아래는 화면 폭 기준
const CAPTURE_SIZES =
  "(min-width: 1296px) 626px, (min-width: 1024px) 52vw, (min-width: 640px) calc(100vw - 88px), calc(100vw - 72px)"

/**
 * 03 해결 — 수업 전부터 후까지 하나의 흐름. 장 머리 + 소개 영상 → 6단계 요약(앵커) → 단계 6개(글 5칸 · 화면 7칸, 좌우 교차)
 * 사이사이 '다음 단계로' 한 줄 → 흐름 끝: 어디서나(사진 카드) + 쇼룸 CTA(sunken 패널).
 * 화면 캡처는 sunken 매트 위 r0 + hair(V16). 강의 녹화 단계는 사진 대신 실제 녹화 영상 두 편.
 */
export function StorySolution() {
  const { id, kicker, title, lead, video, flowLabel, steps, anywhere, showroom } = STORY_SOLUTION
  return (
    <StoryChapter id={id}>
      <StoryChapterHead id={id} folio={folio(3)} kicker={kicker} title={title} lead={lead}>
        <IntroVideoPlayer video={video} source={STORY_SOURCE} className="mt-8 max-w-article md:mt-10" />
      </StoryChapterHead>

      <nav aria-label={flowLabel} className="mt-14 md:mt-20">
        <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-x-6">
          {steps.map((step, index) => (
            <li key={step.id} className="border-t border-line-ink">
              <a href={`#${step.id}`} className="group block min-h-11 pt-3">
                <span className="block text-folio tabular-nums text-fg-muted">{folio(index + 1)}</span>
                <span className="mt-1 block text-ui font-semibold text-fg-ink underline-offset-4 group-hover:underline">
                  {step.short}
                </span>
                <span className="block text-caption text-fg-muted">{step.sub}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-16 md:mt-24">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            <StepArticle step={step} index={index} total={steps.length} />
            {step.bridge ? <Bridge text={step.bridge} /> : null}
          </Fragment>
        ))}
      </div>

      <div className="mt-16 grid gap-6 md:mt-24 lg:grid-cols-2">
        <div className="flex flex-col gap-6 border border-line-hair bg-surface-sheet p-6 sm:flex-row sm:items-center lg:p-8">
          <IntroFigure
            asset={anywhere.image.asset}
            alt={anywhere.image.alt}
            sizes="192px"
            className="w-40 shrink-0 sm:w-48"
            imageClassName="border-0"
          />
          <div className="min-w-0">
            <p className="text-label text-fg-muted">{anywhere.kicker}</p>
            <h3 className="mt-2 text-h3 text-fg-ink">{anywhere.title}</h3>
            <p className="mt-3 text-body text-fg-body">{anywhere.body}</p>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-8 bg-surface-sunken p-6 lg:p-8">
          <div>
            <p className="text-label text-fg-muted">{showroom.kicker}</p>
            <h3 className="mt-2 text-h3 text-fg-ink">{showroom.title}</h3>
            <p className="mt-3 text-body text-fg-body">{showroom.body}</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <TrackedLink
              href={showroom.primary.href}
              ctaId={showroom.primary.ctaId}
              tracking={{ source: STORY_SOURCE }}
              className={STORY_PRIMARY}
            >
              {showroom.primary.label}
              <ArrowRight aria-hidden="true" className="arrow-nudge" />
            </TrackedLink>
            <TrackedLink
              href={showroom.secondary.href}
              ctaId={showroom.secondary.ctaId}
              tracking={{ source: STORY_SOURCE }}
              className={STORY_LINE}
            >
              {showroom.secondary.label}
            </TrackedLink>
          </div>
        </div>
      </div>
    </StoryChapter>
  )
}

function StepArticle({ step, index, total }: { step: StoryStep; index: number; total: number }) {
  const mirrored = index % 2 === 1
  return (
    <article
      id={step.id}
      aria-labelledby={`${step.id}-title`}
      className="grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-x-6"
    >
      <div className={cn("lg:col-span-5 lg:row-start-1", mirrored ? "lg:col-start-8" : "lg:col-start-1")}>
        <p className="text-caption text-fg-muted">
          <span className="font-semibold tabular-nums text-fg-ink">
            {folio(index + 1)} / {folio(total)}
          </span>
          {" · "}
          {step.meta}
        </p>
        <h3 id={`${step.id}-title`} className="mt-3 text-h3 text-fg-ink">
          <Lines lines={step.title} />
        </h3>
        <ul className="mt-6 space-y-3.5">
          {step.points.map((point) => (
            <li key={point} className="flex gap-3 text-body-l text-fg-body">
              <Check aria-hidden="true" className="mt-1.5 size-4 shrink-0 text-fg-ink" />
              <span>
                <Emphasis text={point} />
              </span>
            </li>
          ))}
        </ul>
        {step.quote ? (
          <blockquote className="mt-8 border-t border-line-hair pt-5">
            <p className="-indent-[0.45em] text-quote text-fg-ink">{step.quote}</p>
          </blockquote>
        ) : null}
      </div>
      <div
        className={cn("min-w-0 lg:col-span-7 lg:row-start-1", mirrored ? "lg:col-start-1" : "lg:col-start-6")}
      >
        <StepMedia media={step.media} />
      </div>
    </article>
  )
}

function StepMedia({ media }: { media: StoryStepMedia }) {
  if (media.kind === "videos") {
    const [main, ...rest] = media.videos
    return (
      <div className="space-y-8">
        {main ? <IntroVideoPlayer video={main} source={STORY_SOURCE} /> : null}
        {rest.map((video) => (
          <IntroVideoPlayer
            key={storyVideoKey(video)}
            video={video}
            source={STORY_SOURCE}
            className="sm:w-1/2"
          />
        ))}
      </div>
    )
  }
  // 원본이 작은 캡처(드라이브 586px)는 늘리지 않고 제 폭에서 멈춘다
  const { width } = getIntroAsset(media.asset)
  return (
    <StoryMat>
      <div className="mx-auto" style={{ maxWidth: `${width}px` }}>
        <IntroFigure asset={media.asset} alt={media.alt} sizes={CAPTURE_SIZES} />
      </div>
    </StoryMat>
  )
}

/** 단계와 단계 사이 한 줄 — r0 아이콘 틀(물건은 둥글리지 않는다) + 문장 + hair */
function Bridge({ text }: { text: string }) {
  return (
    <p className="my-12 flex items-center gap-4 text-body text-fg-body md:my-16">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center border border-line-ink text-fg-ink"
      >
        <ArrowDown className="size-4" />
      </span>
      <span className="min-w-0">{text}</span>
      <span aria-hidden="true" className="hidden flex-1 border-t border-line-hair sm:block" />
    </p>
  )
}
