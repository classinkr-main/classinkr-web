import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { INTRO_FINAL_CTA } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { INTRO_CONTAINER } from "./primitives"

/** 마지막 띠(V5-A) — sunken + 이중 괘선, 왼쪽 정렬, primary 하나 + 텍스트 링크. Kicker 없음(장이 아니다). */
export function IntroFinalCta() {
  const { title, lead, primary, secondary } = INTRO_FINAL_CTA
  return (
    <section aria-labelledby="introduction-final-cta" className="rule-double bg-surface-sunken py-20 md:py-32">
      <div className={INTRO_CONTAINER}>
        <h2 id="introduction-final-cta" className="max-w-heading text-h2 text-fg-ink">
          {title}
        </h2>
        <p className="mt-4 max-w-deck text-body-l text-fg-body md:mt-5">{lead}</p>
        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <TrackedLink
            href={primary.href}
            ctaId={primary.ctaId}
            tracking={{ source: "introduction" }}
            className={cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")}
          >
            {primary.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
          <TrackedLink
            href={secondary.href}
            ctaId={secondary.ctaId}
            tracking={{ source: "introduction" }}
            className="inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent underline-offset-4 hover:underline"
          >
            {secondary.label}
            <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}
