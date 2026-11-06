"use client"

import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { RECORDING_COPY } from "./recording-copy"

const { hero } = RECORDING_COPY

// 상담 버튼은 클라이언트 컴포넌트 안에서 만든다. 서버 페이지가 DemoModal 에 버튼을 넘기면 클라이언트에서
// lazy 요소로 도착해 Radix asChild(Slot)가 버리고, 하이드레이션 불일치 뒤 히어로 버튼이 사라진다(홈 HomeHero 와 같은 구조)
export function RecordingHeroCta() {
  return (
    <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-7">
      <DemoModal trackingButton="recording_hero_demo">
        <Button size="cta" className="w-full shadow-none sm:w-auto">
          {hero.primaryCta}
          <ArrowRight aria-hidden className="arrow-nudge" />
        </Button>
      </DemoModal>
      <TrackedLink
        href={hero.secondaryHref}
        ctaId="recording_hero_lead_magnet"
        tracking={{ source: "recording_hero", lead_magnet: "academy-system-checklist" }}
        className="inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-accent hover:underline underline-offset-4"
      >
        {hero.secondaryCta}
        <ArrowRight aria-hidden className="size-4 arrow-nudge" />
      </TrackedLink>
    </div>
  )
}
