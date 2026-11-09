import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { getIntroAsset } from "@/lib/introduction/assets"
import { getIntroCasePath, type IntroVideo } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { Emphasis } from "../Emphasis"
import { IntroVideoPlayer } from "../IntroVideoPlayer"
import { LANDING_CASES } from "./landing-copy"
import { LandingChapter, LandingChapterHead, LandingRailBlock } from "./primitives"

// 카드 폭: 1200 − 24×2 = 3열 384 / sm 2열 / 모바일 전폭(IntroCaseGrid 와 같은 식)
const COVER_SIZES =
  "(min-width: 1296px) 384px, (min-width: 1024px) calc((100vw - 144px) / 3), (min-width: 640px) calc((100vw - 72px) / 2), calc(100vw - 32px)"

const CASE_LINK =
  "inline-flex min-h-11 items-center gap-1 font-medium text-fg-accent underline-offset-4 hover:underline"

/**
 * 03 고객 사례 — 장 머리 → 수업 영상 두 줄(강의 녹화 · 화판 수업 / 디지털 교과서 · 도입 기관 영상)
 * → 03.1 도입 기관 카드 6 → 03.2 사례 색인(분류별 전체) + 모두 보기.
 * 영상은 IntroVideoPlayer — YouTube 는 누르면 그 자리에서 youtube-nocookie 로, mp4 는 포스터 → 재생.
 */
export function LandingCases() {
  const section = LANDING_CASES
  const { recording, tablet, textbook, institutions, featured, index } = section
  return (
    <LandingChapter id={section.id}>
      <LandingChapterHead id={section.id} folio={section.folio} kicker={section.kicker} title={section.title} lead={section.lead} />

      <div className="mt-12 grid gap-y-14 md:mt-14 lg:grid-cols-12 lg:gap-x-6">
        <VideoGroup title={recording.title} body={recording.body} className="lg:col-span-6">
          <VideoPair videos={recording.videos} />
        </VideoGroup>
        <VideoGroup title={tablet.title} body={tablet.body} className="lg:col-span-6">
          <VideoPair videos={tablet.videos} />
        </VideoGroup>
      </div>

      <div className="mt-14 grid gap-y-14 lg:grid-cols-12 lg:gap-x-6">
        <VideoGroup title={textbook.title} body={textbook.body} className="lg:col-span-4">
          {/* 세로 영상은 좁은 두 단 — 가로 영상 칸 폭을 그대로 받으면 화면 높이를 넘는다 */}
          <div className="grid max-w-xl grid-cols-2 gap-4">
            {textbook.videos.map((video) => (
              <IntroVideoPlayer key={videoKey(video)} video={video} source="introduction" />
            ))}
          </div>
          <Link href={textbook.link.href} className={cn(CASE_LINK, "mt-3 text-caption")}>
            {textbook.link.label}
            <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
          </Link>
        </VideoGroup>
        <VideoGroup title={institutions.title} body={institutions.body} className="lg:col-span-7 lg:col-start-6">
          <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
            {institutions.items.map((item) => (
              <div key={item.href} className="min-w-0">
                <IntroVideoPlayer video={item.video} source="introduction" />
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-fg-muted">
                  <span>{item.name}</span>
                  <Link href={item.href} aria-label={`${item.name} ${institutions.linkLabel}`} className={CASE_LINK}>
                    {institutions.linkLabel}
                    <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
                  </Link>
                </p>
              </div>
            ))}
          </div>
        </VideoGroup>
      </div>

      <LandingRailBlock folio={featured.folio} kicker={featured.kicker} className="mt-16 md:mt-20">
        <h3 className="max-w-heading text-h3 text-fg-ink">{featured.title}</h3>
      </LandingRailBlock>

      {/* 사진 있는 카드: sheet + hair, 반경·그림자 0. hover 는 경계 hair→strong 과 화살표 2px 뿐(cards_motion) */}
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        {featured.items.map((item) => {
          const cover = getIntroAsset(item.cover)
          return (
            <li key={item.slug} className="min-w-0">
              <Link
                href={getIntroCasePath(item.slug)}
                className="group flex h-full flex-col border border-line-hair bg-surface-sheet transition-colors duration-(--motion-base) ease-soft hover:border-line-strong hover:duration-(--motion-fast) focus-visible:border-line-strong active:border-line-strong"
              >
                {/* 사진은 카드 이름이 대신 말한다 — 링크 이름이 길어지지 않게 alt 는 비운다(IntroCaseGrid 와 같다) */}
                <div className="relative aspect-case overflow-hidden bg-surface-skeleton">
                  <Image src={cover.src} alt="" fill sizes={COVER_SIZES} className="object-cover" />
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <p className="text-label text-fg-muted">
                    {item.sector} <span aria-hidden="true">·</span> {item.country}
                  </p>
                  <h4 className="mt-2 text-body-l font-semibold text-fg-ink">{item.name}</h4>
                  <p className="mt-2 text-caption text-fg-body">
                    <Emphasis text={item.summary} />
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-caption font-medium text-fg-accent">
                    {featured.linkLabel}
                    <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>

      <LandingRailBlock folio={index.folio} kicker={index.kicker} note={index.note} className="mt-16 md:mt-20">
        <dl className="border-t border-line-ink">
          {index.groups.map((group) => (
            <div
              key={group.sector}
              className="border-b border-line-hair py-2 sm:grid sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-x-6"
            >
              <dt className="flex min-h-11 items-center gap-2 text-caption font-semibold text-fg-ink">
                {group.sector}
                <span className="font-medium tabular-nums text-fg-muted">{group.count}</span>
              </dt>
              <dd className="flex flex-wrap gap-x-6">
                {group.items.map((item) => (
                  <Link
                    key={item.slug}
                    href={getIntroCasePath(item.slug)}
                    className="inline-flex min-h-11 items-center gap-1.5 text-ui text-fg-body underline decoration-line-strong underline-offset-4 transition-colors duration-(--motion-fast) ease-soft hover:decoration-fg-ink"
                  >
                    {item.name}
                    {item.country === "한국" ? null : <span className="text-note text-fg-muted">{item.country}</span>}
                  </Link>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <TrackedLink
          href={index.all.href}
          ctaId={index.all.ctaId}
          tracking={{ source: "introduction" }}
          className={cn(buttonVariants({ variant: "line", size: "cta" }), "mt-8 w-full sm:w-auto")}
        >
          {index.all.label}
          <ArrowRight aria-hidden="true" className="arrow-nudge" />
        </TrackedLink>
      </LandingRailBlock>
    </LandingChapter>
  )
}

function VideoGroup({
  title,
  body,
  className,
  children,
}: {
  title: string
  body: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <h3 className="text-body-l font-semibold text-fg-ink">{title}</h3>
      <p className="mt-2 max-w-measure text-body text-fg-body">{body}</p>
      <div className="mt-6">{children}</div>
    </div>
  )
}

function VideoPair({ videos }: { videos: IntroVideo[] }) {
  return (
    <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
      {videos.map((video) => (
        <IntroVideoPlayer key={videoKey(video)} video={video} source="introduction" />
      ))}
    </div>
  )
}

function videoKey(video: IntroVideo) {
  return video.kind === "youtube" ? video.youtubeId : video.video
}
