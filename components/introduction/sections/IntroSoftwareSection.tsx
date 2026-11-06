import { INTRO_SOFTWARE } from "@/lib/introduction/content"

import { IntroList } from "../IntroBlocks"
import { IntroVideoPlayer } from "../IntroVideoPlayer"
import {
  IntroChapter,
  IntroChapterHead,
  IntroDetails,
  IntroMatFigure,
  IntroSubsection,
  folio,
} from "./primitives"

const FEATURE_IMAGE_SIZES = "(min-width: 1296px) 530px, (min-width: 768px) 42vw, calc(90vw - 32px)"

/** 01 클래스인 — 소개 영상 → 특장점 6(캡처 매트 + 제목 + 요점) → 더 자세히(PDF + 토글 3). */
export function IntroSoftwareSection() {
  const section = INTRO_SOFTWARE
  return (
    <IntroChapter id={section.id}>
      <IntroChapterHead
        id={section.id}
        folio="01"
        kicker={section.kicker}
        title={section.title}
        lead={section.lead}
      />

      <div className="mt-8 md:mt-10 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <IntroVideoPlayer video={section.video} source="introduction" className="lg:col-span-9 lg:col-start-4" />
      </div>

      <IntroSubsection title={section.featuresTitle}>
        <ul className="grid gap-x-6 gap-y-14 md:grid-cols-2 md:gap-y-20">
          {section.features.map((feature, index) => (
            <li key={feature.id} className="min-w-0">
              <IntroMatFigure asset={feature.media.asset} alt={feature.media.alt} sizes={FEATURE_IMAGE_SIZES} />
              <p className="mt-6 text-folio tabular-nums text-fg-muted">No. {folio(index + 1)}</p>
              <h4 className="mt-2 text-h3 text-fg-ink">{feature.title}</h4>
              <div className="mt-5">
                <IntroList items={feature.points} />
              </div>
            </li>
          ))}
        </ul>
      </IntroSubsection>

      <IntroDetails title={section.moreTitle} download={section.download} blocks={section.details} />
    </IntroChapter>
  )
}
