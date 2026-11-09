import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { PROOF_CONTAINER, PROOF_TEXT_LINK, ProofFigure } from "./ProofParts"
import { ProofPdfLink } from "./ProofPdfLink"
import { PROOF_FINAL_CTA, PROOF_SOURCE } from "./proof-copy"

const PHOTO_SIZES = "(min-width: 1296px) 588px, (min-width: 1024px) 46vw, calc(100vw - 32px)"

/**
 * 마지막 띠(V5-A) — sunken + 이중 괘선, primary 하나 + 텍스트 링크, 왼쪽 정렬. Kicker 없음(장이 아니다).
 * 64rem 이상은 글(1–6칸) · 교실 사진(7–12칸). 그 아래 hair 한 줄 뒤에 PDF 둘과 서비스 소개 링크.
 */
export function ProofFinalCta() {
  const { id, title, lead, primary, secondary, overview, downloads, photo } = PROOF_FINAL_CTA
  return (
    <section aria-labelledby={`${id}-title`} className="rule-double bg-surface-sunken py-20 md:py-32">
      <div className={cn(PROOF_CONTAINER, "lg:grid lg:grid-cols-12 lg:items-center lg:gap-x-6")}>
        <div className="min-w-0 lg:col-span-6 lg:pr-6">
          <h2 id={`${id}-title`} className="max-w-heading text-h1 text-fg-ink">
            {title}
          </h2>
          <p className="mt-5 max-w-deck text-body-l text-fg-body">{lead}</p>
          <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
            <TrackedLink
              href={primary.href}
              ctaId={primary.ctaId}
              tracking={{ source: PROOF_SOURCE }}
              className={cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")}
            >
              {primary.label}
              <ArrowRight aria-hidden="true" className="arrow-nudge" />
            </TrackedLink>
            <TrackedLink
              href={secondary.href}
              ctaId={secondary.ctaId}
              tracking={{ source: PROOF_SOURCE }}
              className={PROOF_TEXT_LINK}
            >
              {secondary.label}
              <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 border-t border-line-hair pt-3">
            {downloads.map((download) => (
              <ProofPdfLink key={download.id} download={download} source={PROOF_SOURCE} />
            ))}
            <TrackedLink
              href={overview.href}
              ctaId={overview.ctaId}
              tracking={{ source: PROOF_SOURCE }}
              className="link-quiet inline-flex min-h-11 items-center text-caption font-semibold text-fg-body"
            >
              {overview.label}
            </TrackedLink>
          </div>
        </div>

        <ProofFigure
          photo={photo}
          sizes={PHOTO_SIZES}
          className="mt-12 lg:col-span-6 lg:mt-0"
          frameClassName="aspect-case"
        />
      </div>
    </section>
  )
}
