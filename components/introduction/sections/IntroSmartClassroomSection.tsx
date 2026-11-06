import { INTRO_SMART_CLASSROOM } from "@/lib/introduction/content"

import { IntroFigure } from "../IntroFigure"
import { IntroChapter, IntroChapterHead, IntroDetails, IntroPlate, IntroSubsection } from "./primitives"

const PHOTO_SIZES = "(min-width: 1296px) 384px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, calc(100vw - 32px)"

/**
 * 02 클래스인 X : AI 스마트 교실 — 구성도 → 특징 3단(두 줄 제목 + 사진 2) → 활용 환경 → 더 자세히(PDF + HW 토글 5).
 * 3단은 64rem 이상에서 subgrid 로 제목 줄 높이를 맞춰 사진 윗선이 한 줄에 선다.
 */
export function IntroSmartClassroomSection() {
  const section = INTRO_SMART_CLASSROOM
  return (
    <IntroChapter id={section.id}>
      <IntroChapterHead
        id={section.id}
        folio="02"
        kicker={section.kicker}
        title={section.title}
        lead={section.lead}
      />

      <IntroPlate asset={section.hero.asset} alt={section.hero.alt} className="mt-8 md:mt-10" />

      <IntroSubsection title={section.featuresTitle}>
        <ul className="grid gap-y-14 lg:grid-cols-3 lg:grid-rows-[auto_auto] lg:gap-x-6 lg:gap-y-0">
          {section.features.map((feature) => (
            <li key={feature.id} className="min-w-0 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-y-6">
              <h4 className="text-h3 text-fg-ink">
                {feature.title.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h4>
              <div className="mt-6 grid content-start gap-4 sm:grid-cols-2 sm:gap-6 lg:mt-0 lg:grid-cols-1">
                {feature.images.map((image) => (
                  <IntroFigure
                    key={image.asset}
                    asset={image.asset}
                    alt={image.alt}
                    caption={"caption" in image ? image.caption : undefined}
                    sizes={PHOTO_SIZES}
                    imageClassName="aspect-video object-cover"
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>

        <IntroPlate asset={section.overview.asset} alt={section.overview.alt} className="mt-14 md:mt-20" />
      </IntroSubsection>

      <IntroDetails
        title={section.moreTitle}
        lead={section.moreLead}
        download={section.download}
        blocks={section.details}
      />
    </IntroChapter>
  )
}
