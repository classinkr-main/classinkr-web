import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { STORY_CONTAINER } from "./primitives"
import { STORY_BAND, STORY_SOURCE } from "./story-copy"

/**
 * 표지 바로 아래 슬림 먹 띠 — 이 페이지의 먹 지면은 여기 한 곳뿐이다(나머지 어두운 면은 paper·sunken 으로 옮겼다).
 * surface-ink 가 글자·선 토큰을 밝은 값으로 다시 정의한다. 먹 위 채움 버튼 0(C14) → line 버튼 + 강조색 텍스트 링크.
 */
export function StoryCtaBand() {
  const { label, lead, body, showroom, contact } = STORY_BAND
  return (
    <section aria-label={label} className="surface-ink">
      <div
        className={cn(
          STORY_CONTAINER,
          "flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between md:gap-10 md:py-5"
        )}
      >
        <p className="max-w-measure text-caption text-fg-body md:text-body">
          <strong className="font-semibold text-fg-ink">{lead}</strong> — {body}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
          <TrackedLink
            href={showroom.href}
            ctaId={showroom.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className="inline-flex min-h-11 items-center text-ui font-medium text-fg-accent underline underline-offset-4"
          >
            {showroom.label}
          </TrackedLink>
          <TrackedLink
            href={contact.href}
            ctaId={contact.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={buttonVariants({ variant: "line", size: "md" })}
          >
            {contact.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
        </div>
      </div>
    </section>
  )
}
