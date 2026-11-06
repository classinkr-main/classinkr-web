import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

import { Lines, STORY_CONTAINER, STORY_PRIMARY, STORY_TEXT_LINK, ToolChip } from "./primitives"
import { STORY_FINAL, STORY_SOURCE } from "./story-copy"
import { StoryPdfLink } from "./StoryPdfLink"

const RESOURCE_LINK =
  "inline-flex min-h-11 items-center text-ui font-medium text-fg-ink underline decoration-line-strong underline-offset-4 transition-colors duration-(--motion-fast) ease-soft hover:decoration-line-ink"

/**
 * 마지막 띠(V5-A) — sunken + 이중 괘선, 왼쪽 정렬, primary 하나 + 텍스트 링크. 시안의 먹 면은 페이지 위쪽 띠로 옮겼다.
 * 첫머리에 표지의 도해를 한 줄로 되풀이한다: 흩어진 도구 일곱 → 클래스인. 여기의 클래스인 칸은 먹선 테두리만 —
 * 이 뷰포트의 그린 채움은 primary 하나로 둔다. 끝에 PDF 두 개와 대표 소개(/introduction) 링크.
 */
export function StoryFinalCta() {
  const { chipsLabel, chips, result, title, lead, primary, secondary, resourcesLabel, pdfs, overview } = STORY_FINAL
  return (
    <section aria-labelledby="story-final-title" className="rule-double bg-surface-sunken py-20 md:py-32">
      <div className={STORY_CONTAINER}>
        <ul aria-label={chipsLabel} className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
          {chips.map((tool, index) => (
            <ToolChip key={tool} tool={tool} index={index} />
          ))}
          <li aria-hidden="true" className="px-1 text-fg-muted">
            <ArrowRight className="size-5" />
          </li>
          <li className="border border-line-ink bg-surface-sheet px-4 py-1.5 text-body-l font-semibold text-fg-ink">
            {result}
          </li>
        </ul>

        <h2 id="story-final-title" className="mt-10 max-w-heading text-h2 text-fg-ink md:mt-12">
          <Lines lines={title} />
        </h2>
        <p className="mt-4 max-w-deck text-body-l text-fg-body md:mt-5">{lead}</p>
        <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
          <TrackedLink
            href={primary.href}
            ctaId={primary.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={STORY_PRIMARY}
          >
            {primary.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
          <TrackedLink
            href={secondary.href}
            ctaId={secondary.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={STORY_TEXT_LINK}
          >
            {secondary.label}
            <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
          </TrackedLink>
        </div>

        <nav
          aria-label={resourcesLabel}
          className="mt-12 flex flex-wrap gap-x-8 gap-y-1 border-t border-line-strong pt-6 md:mt-16"
        >
          {pdfs.map((pdf) => (
            <StoryPdfLink key={pdf.ctaId} pdf={pdf} ctaId={pdf.ctaId} className={RESOURCE_LINK} />
          ))}
          <TrackedLink
            href={overview.href}
            ctaId={overview.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={`${RESOURCE_LINK} gap-1`}
          >
            {overview.label}
            <ArrowRight aria-hidden="true" className="size-4 arrow-nudge" />
          </TrackedLink>
        </nav>
      </div>
    </section>
  )
}
