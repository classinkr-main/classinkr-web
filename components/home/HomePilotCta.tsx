"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "./GatewayLink"
import { HOME_COPY } from "./home-copy"

const { pilot } = HOME_COPY

// 먹 지면 — surface-ink 가 글자·선 토큰을 다시 정의하고 강조색은 민트가 된다. 채움 버튼 금지(C14) → line
export function HomePilotCta() {
  return (
    <section className="surface-ink py-20 md:py-32">
      <Reveal className="mx-auto max-w-[1040px] px-4 sm:px-6">
        <h2 className="text-h2 text-fg-ink break-keep text-balance">{pilot.heading}</h2>
        <ol className="mt-10 grid gap-8 md:grid-cols-3">
          {pilot.steps.map((step) => (
            <li key={step.title}>
              <h3 className="text-body-l font-semibold text-fg-ink break-keep">{step.title}</h3>
              <p className="mt-2 text-body text-fg-body break-keep">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-caption text-fg-muted break-keep">{pilot.honest}</p>

        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <DemoModal trackingButton="final_consultation">
            <Button variant="line" size="cta" className="w-full sm:w-auto">
              {pilot.primaryCta}
              <ArrowRight aria-hidden className="arrow-nudge" />
            </Button>
          </DemoModal>
          <TrackedLink
            href={pilot.secondaryHref}
            ctaId="final_lead_magnet"
            tracking={{ source: "home_final_cta", lead_magnet: "academy-system-checklist" }}
            className="inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
          >
            {pilot.secondaryCta}
            <ArrowRight aria-hidden className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>
        <p className="mt-4 text-caption text-fg-muted break-keep">{pilot.trust}</p>

        <nav aria-label={pilot.pagesLabel} className="mt-10 flex flex-wrap gap-x-8 gap-y-3">
          {pilot.pages.map((page) => (
            <GatewayLink key={page.href} href={page.href}>
              {page.label}
            </GatewayLink>
          ))}
        </nav>
      </Reveal>
    </section>
  )
}
