import Image from "next/image"
import { ArrowRight, ChevronRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { getIntroAsset } from "@/lib/introduction/assets"
import { cn } from "@/lib/utils"

import { LANDING_FLOW, LANDING_HERO } from "./landing-copy"
import { LandingPdfLink } from "./LandingPdfLink"
import { LANDING_CONTAINER, LANDING_GRID, LandingRailBlock } from "./primitives"

const TRACKING = { source: "introduction" }

// 콘텐츠 폭 plate(1200). 휴대폰은 가로로 긴 배너가 너무 얇아져 4:3 으로 가운데(강사·칠판)를 잘라 보여 준다
const PLATE_SIZES =
  "(min-width: 1296px) 1200px, (min-width: 1024px) calc(100vw - 96px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"

/**
 * 표지(V11-A 비대칭): 라벨 + H1(1–9칸) → 덱·CTA(8–12칸, H1 아래 40px) → 콘텐츠 폭 사진 plate → 수업 운영 흐름 띠.
 * 정지한 지면이다(진입 애니메이션 0). LCP 는 H1 — 사진에 priority 를 두지 않는다.
 */
export function LandingHero() {
  const { eyebrow, title, lead, image, primary, pdf, showroom } = LANDING_HERO
  const plate = getIntroAsset(image.asset)
  return (
    <section aria-labelledby="introduction-title" className="bg-surface-paper pt-(--header-h)">
      <div className={cn(LANDING_CONTAINER, "pb-16 pt-12 md:pb-24 md:pt-20")}>
        <div className={LANDING_GRID}>
          <div className="lg:col-span-9">
            <p className="text-label text-fg-ink">{eyebrow}</p>
            <h1 id="introduction-title" className="mt-4 max-w-display text-h1 text-fg-ink md:mt-5">
              {title}
            </h1>
          </div>

          <div className="mt-8 lg:col-span-5 lg:col-start-8 lg:mt-10">
            <p className="max-w-deck text-body-l text-fg-body">{lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <TrackedLink
                href={primary.href}
                ctaId={primary.ctaId}
                tracking={TRACKING}
                className={cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")}
              >
                {primary.label}
                <ArrowRight aria-hidden="true" className="arrow-nudge" />
              </TrackedLink>
              <LandingPdfLink download={pdf.download} ctaId={pdf.ctaId} label={pdf.label} />
            </div>
            <p className="mt-5 text-caption text-fg-muted">
              {showroom.before}{" "}
              <TrackedLink
                href={showroom.href}
                ctaId={showroom.ctaId}
                tracking={TRACKING}
                className="link-body font-medium"
              >
                {showroom.label}
              </TrackedLink>
            </p>
          </div>
        </div>

        <Image
          src={plate.src}
          alt={image.alt}
          width={plate.width}
          height={plate.height}
          sizes={PLATE_SIZES}
          className="mt-12 aspect-[4/3] h-auto w-full object-cover md:mt-16 md:aspect-auto"
        />

        <LandingRailBlock kicker={LANDING_FLOW.label} note={LANDING_FLOW.note} className="mt-12 md:mt-16">
          <ol className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {LANDING_FLOW.steps.map((step, index) => {
              const last = index === LANDING_FLOW.steps.length - 1
              return (
                <li key={step.title} className="min-w-0">
                  <div aria-hidden="true" className="flex items-center gap-2.5">
                    <span className="text-folio tabular-nums text-fg-muted">{String(index + 1).padStart(2, "0")}</span>
                    <span className="h-px flex-1 bg-line-control" />
                    {last ? null : <ChevronRight className="-ml-2 size-3.5 shrink-0 text-line-control" />}
                  </div>
                  <p className="mt-3 text-body-l font-semibold text-fg-ink">{step.title}</p>
                  <p className="mt-1 text-caption text-fg-muted">{step.body}</p>
                </li>
              )
            })}
          </ol>
        </LandingRailBlock>
      </div>
    </section>
  )
}
