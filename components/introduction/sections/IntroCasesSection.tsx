import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { INTRO_CASE_VIDEOS, INTRO_CASES_PATH, type IntroVideo } from "@/lib/introduction/content"

import { Emphasis } from "../Emphasis"
import { IntroCaseGrid } from "../IntroCaseGrid"
import { IntroVideoPlayer } from "../IntroVideoPlayer"
import { IntroChapter, IntroChapterHead, IntroLeadNote, IntroSubsection } from "./primitives"

/**
 * 03 고객 사례 — 강의 녹화(영상 2) · 화판 수업(가로 2 + 세로 2) · 스마트 교실 구성(사례 카드 그리드 + 전체 보기).
 */
export function IntroCasesSection() {
  const section = INTRO_CASE_VIDEOS
  return (
    <IntroChapter id={section.id}>
      <IntroChapterHead id={section.id} folio="03" kicker={section.kicker} title={section.title} />

      {section.groups.map((group) => (
        <IntroSubsection key={group.id} id={`cases-${group.id}`} title={group.title}>
          <IntroLeadNote>
            <Emphasis text={group.quote} />
          </IntroLeadNote>
          <CaseVideos videos={group.videos} />
        </IntroSubsection>
      ))}

      <IntroSubsection id={section.gallery.id} title={section.gallery.title}>
        <IntroLeadNote>
          <Emphasis text={section.gallery.quote} />
        </IntroLeadNote>
        <div className="mt-8 md:mt-10">
          <IntroCaseGrid />
        </div>
        <TrackedLink
          href={INTRO_CASES_PATH}
          ctaId="introduction_gallery_all_cases"
          tracking={{ source: "introduction" }}
          className="mt-10 inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent underline-offset-4 hover:underline"
        >
          고객 사례 전체 보기
          <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
        </TrackedLink>
      </IntroSubsection>
    </IntroChapter>
  )
}

/**
 * 가로 영상은 두 단, 세로 영상은 따로 모아 좁은 두 단(64rem 이상 한 칸이 3/12)으로 둔다 —
 * 세로 영상이 가로 영상 칸 폭을 그대로 받으면 화면 높이를 넘는다.
 */
function CaseVideos({ videos }: { videos: IntroVideo[] }) {
  const landscape = videos.filter((video) => !isPortrait(video))
  const portrait = videos.filter(isPortrait)
  return (
    <div className="mt-8 space-y-10 md:mt-10">
      {landscape.length ? (
        <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2">
          {landscape.map((video) => (
            <IntroVideoPlayer key={videoKey(video)} video={video} source="introduction" />
          ))}
        </div>
      ) : null}
      {portrait.length ? (
        <div className="grid max-w-xl grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:max-w-none lg:grid-cols-4">
          {portrait.map((video) => (
            <IntroVideoPlayer key={videoKey(video)} video={video} source="introduction" />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function isPortrait(video: IntroVideo) {
  return video.kind === "file" && video.orientation === "portrait"
}

function videoKey(video: IntroVideo) {
  return video.kind === "youtube" ? video.youtubeId : video.video
}
