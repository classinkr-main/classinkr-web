import Image from "next/image"
import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { getIntroAsset, type IntroAssetKey } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { IntroVideoPlayer } from "../IntroVideoPlayer"
import { LANDING_SOFTWARE, type LandingMatKind } from "./landing-copy"
import { LandingPdfLink } from "./LandingPdfLink"
import { LANDING_GRID, LandingChapter, LandingChapterHead, LandingDashList, LandingRailBlock } from "./primitives"

// 매트 안쪽 폭: 카드(1200 − 24×2) / 3 = 384 − 매트 여백 32×2 = 320. sm 2열 · 모바일 1열은 매트 여백 20×2
const MAT_IMAGE_SIZES =
  "(min-width: 1296px) 320px, (min-width: 1024px) calc((100vw - 144px) / 3 - 64px), (min-width: 640px) calc((100vw - 72px) / 2 - 40px), calc(100vw - 72px)"

/**
 * 01 클래스인 — 장 머리 + 숫자 4 → 01.1 특장점 6(sunken 매트 + 제목 + 요점) → 01.2 소개 영상 · 소개서 PDF · 전체 보기.
 */
export function LandingSoftware() {
  const section = LANDING_SOFTWARE
  const { features, more } = section
  return (
    <LandingChapter id={section.id}>
      <LandingChapterHead id={section.id} folio={section.folio} kicker={section.kicker} title={section.title} lead={section.lead} />

      {/* 숫자 4 는 장 머리 본문 칸(4–12) 아래에 선다. 사실은 content.ts 에 있는 것만(landing-copy) */}
      <div className={cn(LANDING_GRID, "mt-12 md:mt-14")}>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 lg:col-span-9 lg:col-start-4 lg:grid-cols-4">
          {section.stats.map((stat) => (
            <li key={stat.label} className="min-w-0 border-l border-line-strong pl-4 sm:pl-5">
              <p className="text-numeral text-fg-ink">
                {stat.value}
                <span className="ml-1 text-body-l font-semibold">{stat.unit}</span>
              </p>
              <p className="mt-3 text-caption text-fg-muted">
                {stat.label}
                {stat.note ? <span className="block">{stat.note}</span> : null}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <LandingRailBlock folio={features.folio} kicker={features.kicker} className="mt-16 md:mt-20">
        <h3 className="max-w-heading text-h3 text-fg-ink">{features.title}</h3>
      </LandingRailBlock>

      <ol className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {features.items.map((feature, index) => (
          <li key={feature.id} className="min-w-0">
            <figure>
              <FeatureMat asset={feature.image.asset} alt={feature.image.alt} kind={feature.mat} />
              <figcaption className="mt-5">
                <div className="flex items-baseline gap-3">
                  <span aria-hidden="true" className="text-folio tabular-nums text-fg-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h4 className="text-body-l font-semibold text-fg-ink">{feature.title}</h4>
                </div>
                <LandingDashList items={feature.points} className="mt-3" />
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>

      <LandingRailBlock folio={more.folio} kicker={more.kicker} className="mt-16 md:mt-20">
        <div className="grid gap-y-10 lg:grid-cols-9 lg:gap-x-6">
          <IntroVideoPlayer video={more.video} source="introduction" className="lg:col-span-5" />
          <div className="min-w-0 lg:col-span-3 lg:col-start-7">
            <p className="text-folio tabular-nums text-fg-muted">PDF · {more.pdf.download.size}</p>
            <h3 className="mt-2 text-body-l font-semibold text-fg-ink">{more.pdf.title}</h3>
            <p className="mt-2 text-body text-fg-body">{more.pdf.body}</p>
            <LandingPdfLink
              download={more.pdf.download}
              ctaId={more.pdf.ctaId}
              label={more.pdf.label}
              className="mt-6"
            />
            <TrackedLink
              href={more.full.href}
              ctaId={more.full.ctaId}
              tracking={{ source: "introduction" }}
              className="mt-3 inline-flex min-h-11 items-center gap-1 text-caption font-medium text-fg-accent underline-offset-4 hover:underline"
            >
              {more.full.label}
              <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>
      </LandingRailBlock>
    </LandingChapter>
  )
}

/**
 * 특장점 화면 한 장을 같은 높이의 sunken 매트(20px, ≥64rem 32px)에 앉힌다 — 카드 그리드에서 아래 글줄이 맞도록.
 * 배경이 투명한 제품 화면(cutout)은 받침 없이 매트에 바로, 흰 바탕 캡처(capture)는 sheet + hair 로 세운다(V16).
 */
function FeatureMat({ asset, alt, kind }: { asset: IntroAssetKey; alt: string; kind: LandingMatKind }) {
  const file = getIntroAsset(asset)
  return (
    <div className="flex h-72 items-center justify-center bg-surface-sunken p-5 lg:p-8">
      <Image
        src={file.src}
        alt={alt}
        width={file.width}
        height={file.height}
        sizes={MAT_IMAGE_SIZES}
        className={cn(
          "h-auto max-h-56 w-auto max-w-full",
          kind === "capture" && "border border-line-hair bg-surface-sheet"
        )}
      />
    </div>
  )
}
