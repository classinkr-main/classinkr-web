import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { LANDING_FINAL } from "./landing-copy"
import { LandingPdfLink } from "./LandingPdfLink"
import { LANDING_CONTAINER, LANDING_GRID, LandingKicker } from "./primitives"

const TRACKING = { source: "introduction" }

/**
 * 04 도입 문의(V5-A FinalCTA) — sunken 띠 + 이중 괘선(먹 1px · 3px · hair), 왼쪽 정렬.
 * 세 갈래(상담 · 쇼룸 · 자료)는 위 strong 선 하나로 나눈 열린 단이고, 그린 채움은 도입 상담 primary 하나다.
 */
export function LandingFinalCta() {
  const { id, folio, kicker, title, lead, contact, showroom, materials } = LANDING_FINAL
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="bg-surface-sunken py-20 md:py-32">
      <div className={LANDING_CONTAINER}>
        <div className={cn("rule-double pt-6", LANDING_GRID)}>
          <LandingKicker folio={folio} label={kicker} className="lg:col-span-3 lg:pt-3" />
          <div className="mt-3 min-w-0 lg:col-span-9 lg:mt-0">
            <h2 id={`${id}-title`} className="max-w-heading text-h2 text-fg-ink">
              {title}
            </h2>
            <p className="mt-5 max-w-deck text-body-l text-fg-body md:mt-6">{lead}</p>

            <ul className="mt-12 grid gap-x-6 gap-y-10 md:grid-cols-3">
              <Column title={contact.title} body={contact.body}>
                <TrackedLink
                  href={contact.href}
                  ctaId={contact.ctaId}
                  tracking={TRACKING}
                  className={cn(buttonVariants({ size: "cta" }), "w-full shadow-none sm:w-auto")}
                >
                  {contact.label}
                  <ArrowRight aria-hidden="true" className="arrow-nudge" />
                </TrackedLink>
              </Column>
              <Column title={showroom.title} body={showroom.body}>
                <TrackedLink
                  href={showroom.href}
                  ctaId={showroom.ctaId}
                  tracking={TRACKING}
                  className={cn(buttonVariants({ variant: "line", size: "cta" }), "w-full sm:w-auto")}
                >
                  {showroom.label}
                  <ArrowRight aria-hidden="true" className="arrow-nudge" />
                </TrackedLink>
              </Column>
              <Column title={materials.title} body={materials.body}>
                <div className="-mt-2 flex flex-col items-start">
                  {materials.links.map((link) => (
                    <LandingPdfLink
                      key={link.ctaId}
                      download={link.download}
                      ctaId={link.ctaId}
                      label={link.label}
                      variant="text"
                    />
                  ))}
                </div>
              </Column>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Column({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col border-t border-line-strong pt-5">
      <h3 className="text-body-l font-semibold text-fg-ink">{title}</h3>
      <p className="mt-2 text-body text-fg-body">{body}</p>
      <div className="mt-auto pt-6">{children}</div>
    </li>
  )
}
