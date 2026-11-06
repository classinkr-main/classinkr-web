import Image from "next/image"

import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { LANDING_SMART_CLASSROOM } from "./landing-copy"
import { LandingPdfLink } from "./LandingPdfLink"
import { LANDING_GRID, LandingChapter, LandingChapterHead, LandingRailBlock } from "./primitives"

// 구성도: 1–8칸(8×78 + 7×24 = 792) − 매트 여백 32×2. 64rem 아래는 전폭 − 매트 여백 20×2
const DIAGRAM_SIZES =
  "(min-width: 1296px) 728px, (min-width: 1024px) calc((100vw - 96px) * 2 / 3 - 64px), (min-width: 640px) calc(100vw - 88px), calc(100vw - 72px)"
const PHOTO_SIZES =
  "(min-width: 1296px) 384px, (min-width: 1024px) calc((100vw - 144px) / 3), (min-width: 640px) calc((100vw - 72px) / 2), calc(100vw - 32px)"

/**
 * 02 클래스인 X — 장 머리 → 구성도(sunken 매트) + 교실 구성 목록 → 02.1 스마트 교실 3단 → 02.2 전자칠판 사양 표 + 제안서 PDF.
 */
export function LandingSmartClassroom() {
  const section = LANDING_SMART_CLASSROOM
  const { diagram, setup, features, spec } = section
  const diagramFile = getIntroAsset(diagram.asset)
  return (
    <LandingChapter id={section.id}>
      <LandingChapterHead id={section.id} folio={section.folio} kicker={section.kicker} title={section.title} lead={section.lead} />

      <div className={cn(LANDING_GRID, "mt-12 md:mt-14")}>
        {/* 흰 바탕 도해는 sunken 매트 위에 r0 + hair 로 세운다(V16) */}
        <figure className="min-w-0 lg:col-span-8">
          <div className="bg-surface-sunken p-5 lg:p-8">
            <Image
              src={diagramFile.src}
              alt={diagram.alt}
              width={diagramFile.width}
              height={diagramFile.height}
              sizes={DIAGRAM_SIZES}
              className="h-auto w-full border border-line-hair bg-surface-sheet"
            />
          </div>
          <figcaption className="mt-3 text-note text-fg-muted">{diagram.caption}</figcaption>
        </figure>

        <div className="mt-10 min-w-0 lg:col-span-4 lg:mt-0">
          <p className="text-label text-fg-ink">{setup.label}</p>
          <dl className="mt-3 border-t border-line-ink">
            {setup.items.map((item) => (
              <div key={item.term} className="border-b border-line-hair py-4">
                <dt className="text-body font-semibold text-fg-ink">{item.term}</dt>
                <dd className="mt-1 text-caption text-fg-muted">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <LandingRailBlock folio={features.folio} kicker={features.kicker} className="mt-16 md:mt-20">
        <h3 className="max-w-heading text-h3 text-fg-ink">{features.title}</h3>
      </LandingRailBlock>

      <ul className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {features.items.map((feature) => {
          const photo = getIntroAsset(feature.image.asset)
          return (
            <li key={feature.id} className="min-w-0">
              <Image
                src={photo.src}
                alt={feature.image.alt}
                width={photo.width}
                height={photo.height}
                sizes={PHOTO_SIZES}
                className="aspect-case h-auto w-full object-cover"
              />
              <h4 className="mt-5 text-body-l font-semibold text-fg-ink">
                {feature.titleLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </h4>
              <p className="mt-2 text-body text-fg-body">{feature.body}</p>
            </li>
          )
        })}
      </ul>

      <LandingRailBlock folio={spec.folio} kicker={spec.kicker} note={spec.note} className="mt-16 md:mt-20">
        <h3 className="max-w-heading text-h3 text-fg-ink">{spec.title}</h3>

        {/* 표는 sheet 위 먹 윗선. 좁은 화면에서는 표만 가로로 스크롤한다(페이지 가로 스크롤 0) */}
        <div
          role="region"
          aria-label={spec.tableLabel}
          tabIndex={0}
          className="mt-8 overflow-x-auto border-t border-line-ink bg-surface-sheet"
        >
          <table className="w-full min-w-[40rem] border-collapse text-left text-caption text-fg-body">
            <thead>
              <tr className="border-b border-line-strong">
                {spec.columns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      "px-5 py-3.5 text-label text-fg-muted",
                      index === 0 && "w-[24%]",
                      index === 1 && "w-[32%]"
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-hair">
              {spec.rows.map(([item, value, use]) => (
                <tr key={item}>
                  <th scope="row" className="px-5 py-4 align-top font-medium text-fg-ink">
                    {item}
                  </th>
                  <td className="px-5 py-4 align-top font-semibold tabular-nums text-fg-ink">{value}</td>
                  <td className="px-5 py-4 align-top">{use}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="max-w-deck">
            <p className="text-body font-semibold text-fg-ink">{spec.proposal.title}</p>
            <p className="mt-1 text-caption text-fg-muted">{spec.proposal.body}</p>
          </div>
          <LandingPdfLink download={spec.proposal.download} ctaId={spec.proposal.ctaId} label={spec.proposal.label} />
        </div>
      </LandingRailBlock>
    </LandingChapter>
  )
}
