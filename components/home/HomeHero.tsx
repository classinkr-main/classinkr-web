"use client"

import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { HOME_COPY } from "./home-copy"

const { hero } = HOME_COPY
// "좋은 수업을, 강사의 개인기에서 학원의 시스템으로" — 쉼표에서 두 줄
const [h1Lead, h1Rest] = CLASSIN_POSITIONING.heroHeadline.split(", ")

export function HomeHero() {
  return (
    <section className="bg-surface-paper pt-(--header-h)">
      <div className="mx-auto max-w-[1040px] px-5 pb-14 pt-14 md:pb-20 md:pt-20">
        <div className="mx-auto max-w-[800px] text-center">
          <p className="text-label text-fg-muted">{hero.kicker}</p>
          <h1 className="mt-4 text-h1 text-fg-ink break-keep">
            {h1Lead},<br />{h1Rest}
          </h1>
          <p className="mt-5 text-body-l text-fg-body break-keep">{CLASSIN_POSITIONING.oneLine}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-5">
            <DemoModal trackingButton="hero_demo">
              <Button size="cta" className="w-full rounded-lg sm:w-auto">
                {hero.primaryCta}
                <ArrowRight aria-hidden className="arrow-nudge" />
              </Button>
            </DemoModal>
            <TrackedLink
              href={hero.secondaryHref}
              ctaId="hero_lead_magnet"
              tracking={{ lead_magnet: "academy-system-checklist" }}
              className="inline-flex items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
            >
              {hero.secondaryCta}
              <ArrowRight aria-hidden className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>

        {/* LCP 는 H1. priority(preload) 는 가드가 막는다 — eager 로드만 */}
        <div className="mx-auto mt-12 max-w-[960px] overflow-hidden rounded-xl border border-line-hair bg-surface-sheet md:mt-14">
          <Image
            src="/images/hero-dashboard.webp"
            alt={hero.imageAlt}
            width={1536}
            height={1024}
            loading="eager"
            sizes="(min-width: 1040px) 960px, 100vw"
            className="h-auto w-full"
          />
        </div>

        <dl className="mx-auto mt-10 grid max-w-[960px] grid-cols-2 gap-y-6 border-y border-line-hair py-6 md:mt-12 md:grid-cols-4">
          {hero.stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              {/* dt 가 먼저(HTML 순서), 화면은 숫자가 위(order) */}
              <dt className="order-2 mt-1 text-note text-fg-muted">{s.label}</dt>
              <dd className="text-h3 tabular-nums text-fg-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-center text-note text-fg-muted">{hero.statsCaption}</p>
      </div>
    </section>
  )
}
