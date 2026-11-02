"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"
import { HOME_COPY } from "./home-copy"

const { pilot } = HOME_COPY

export function HomePilotCta() {
  return (
    <section className="bg-surface-paper py-14 md:py-20">
      <Reveal className="mx-auto max-w-[1040px] px-5">
        <h2 className="text-h2 text-fg-ink break-keep">{pilot.heading}</h2>
        <ol className="mt-8 grid gap-4 md:mt-10 md:grid-cols-3">
          {pilot.steps.map((step, i) => (
            <li key={step.title} className="rounded-xl border border-line-hair bg-surface-sheet p-6">
              <p className="text-label tabular-nums text-fg-muted">{i + 1}</p>
              <h3 className="mt-2 text-h3 text-fg-ink break-keep">{step.title}</h3>
              <p className="mt-2 text-body text-fg-body break-keep">{step.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-caption text-fg-muted break-keep">{pilot.honest}</p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-5">
          <DemoModal trackingButton="final_consultation">
            <Button size="cta" className="w-full rounded-lg sm:w-auto">
              {pilot.primaryCta}
              <ArrowRight aria-hidden className="arrow-nudge" />
            </Button>
          </DemoModal>
          <TrackedLink
            href={pilot.secondaryHref}
            ctaId="final_lead_magnet"
            tracking={{ source: "home_final_cta", lead_magnet: "academy-system-checklist" }}
            className="inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
          >
            {pilot.secondaryCta}
            <ArrowRight aria-hidden className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>
        <nav aria-label="다음 페이지" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line-hair pt-6">
          {pilot.pages.map((page) => (
            <Link key={page.href} href={page.href} className="text-ui text-fg-muted hover:text-fg-ink">
              {page.label}
            </Link>
          ))}
        </nav>
      </Reveal>
    </section>
  )
}
