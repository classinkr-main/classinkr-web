"use client"

import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { HOME_COPY } from "./home-copy"

const { hero } = HOME_COPY
// "좋은 수업을, 강사의 개인기에서 학원의 시스템으로" — 쉼표에서 줄을 바꾼다. 뒤 구절은 따로 블록이라야
// text-balance 가 듣는다(<br /> 뒤에서는 Chrome 이 균형을 잡지 않아 "…학원의 / 시스템으로"로 접혔다)
const [h1Lead, h1Rest] = CLASSIN_POSITIONING.heroHeadline.split(", ")

export function HomeHero() {
  return (
    <section className="bg-surface-paper pt-(--header-h)">
      <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-16 sm:px-6 md:pb-32 md:pt-36">
        <div className="mx-auto max-w-[800px] text-center">
          <h1 className="text-h1 text-fg-ink break-keep">
            <span className="block">{h1Lead},</span>{" "}
            <span className="block text-balance">{h1Rest}</span>
          </h1>
          <p className="mt-6 text-body-l text-fg-body break-keep">{hero.lead}</p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
            <DemoModal trackingButton="hero_demo">
              <Button size="cta" className="w-full sm:w-auto">
                {hero.primaryCta}
                <ArrowRight aria-hidden className="arrow-nudge" />
              </Button>
            </DemoModal>
            <TrackedLink
              href={hero.secondaryHref}
              ctaId="hero_lead_magnet"
              tracking={{ lead_magnet: "academy-system-checklist" }}
              className="inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
            >
              {hero.secondaryCta}
              <ArrowRight aria-hidden className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>

        {/* 투명 컷아웃(그림자는 이미지 안) — 액자·테두리·바탕·반경 없음. LCP 는 H1, priority(preload) 는 가드가 막는다 */}
        <Image
          src={hero.image.src}
          alt={hero.image.alt}
          width={hero.image.width}
          height={hero.image.height}
          loading="eager"
          sizes="(min-width: 1040px) 960px, 100vw"
          className="mx-auto mt-16 h-auto w-full max-w-[960px]"
        />

        <dl className="mt-16 grid grid-cols-2 gap-y-10 md:grid-cols-4">
          {hero.stats.map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              {/* dt 가 먼저(HTML 순서), 화면은 숫자가 위(order) */}
              <dt className="order-2 mt-2 text-caption text-fg-muted">{s.label}</dt>
              <dd className="text-numeral tabular-nums text-fg-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-center text-note text-fg-muted">{hero.statsCaption}</p>
      </div>
    </section>
  )
}
