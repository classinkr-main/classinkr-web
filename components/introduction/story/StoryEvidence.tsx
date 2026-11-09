import { ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { cn } from "@/lib/utils"

import { STORY_LINE, STORY_PRIMARY, StoryChapter, StoryChapterHead, folio } from "./primitives"
import { STORY_EVIDENCE, STORY_SOURCE } from "./story-copy"
import { StoryPdfLink } from "./StoryPdfLink"

/**
 * 02 근거 — 원문 「올인원 학습의 이점」 요약. 부록 역할이라 sunken 지면(연속 배치 아님).
 * 근거 셋은 글만 있는 단이라 상자 없이 먹선 + hair 로 연다. 다섯 칸 눈금은 장식(aria-hidden) — 값은 글자가 말한다.
 */
export function StoryEvidence() {
  const { id, kicker, title, lead, note, callouts, meterSize, ctaLead, pdf, contact } = STORY_EVIDENCE
  return (
    <StoryChapter id={id} surface="sunken">
      <StoryChapterHead id={id} folio={folio(2)} kicker={kicker} title={title} lead={lead}>
        <p className="mt-5 max-w-deck text-note text-fg-muted">{note}</p>
      </StoryChapterHead>

      <div className="mt-10 md:mt-12 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <ol className="divide-y divide-line-hair border-t border-line-ink lg:col-span-9 lg:col-start-4">
          {callouts.map((callout) => (
            <li
              key={callout.title}
              className="grid gap-x-8 gap-y-4 py-6 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)] md:py-8"
            >
              <div>
                <p className="text-caption text-fg-muted">{callout.context}</p>
                <p className="mt-1.5 text-numeral text-fg-ink">{callout.value}</p>
                <span aria-hidden="true" className="mt-4 flex gap-1.5">
                  {Array.from({ length: meterSize }, (_, index) => (
                    <span
                      key={index}
                      className={cn(
                        "size-2.5",
                        index >= callout.filled
                          ? "border border-line-control"
                          : callout.calm
                            ? "bg-fg-accent"
                            : "bg-fg-ink"
                      )}
                    />
                  ))}
                </span>
              </div>
              <div>
                <h3 className="text-h3 text-fg-ink">{callout.title}</h3>
                <p className="mt-2 max-w-measure text-body-l text-fg-body">{callout.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-12 flex flex-col gap-6 border-t border-line-strong pt-8 md:mt-16 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-deck text-body-l font-semibold text-fg-ink">{ctaLead}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <StoryPdfLink pdf={pdf} ctaId={pdf.ctaId} className={STORY_LINE} />
          <TrackedLink
            href={contact.href}
            ctaId={contact.ctaId}
            tracking={{ source: STORY_SOURCE }}
            className={STORY_PRIMARY}
          >
            {contact.label}
            <ArrowRight aria-hidden="true" className="arrow-nudge" />
          </TrackedLink>
        </div>
      </div>
    </StoryChapter>
  )
}
