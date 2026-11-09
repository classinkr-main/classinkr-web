import { ArrowDown, ArrowRight } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { cn } from "@/lib/utils"

import { STORY_CONTAINER, STORY_LINE, STORY_PRIMARY, ToolChip } from "./primitives"
import { STORY_CASES, STORY_HERO, STORY_SOURCE } from "./story-copy"
import { StoryPdfLink } from "./StoryPdfLink"

/**
 * 표지 — 문제부터 말한다. H1 두 줄(≥64rem 에서 줄마다 nowrap, 휴대폰에서는 접힌다)이 콘텐츠 폭을 쓰고,
 * 그 아래 왼쪽(1–6칸) 답·덱·CTA, 오른쪽(8–12칸) '흩어진 도구 → 클래스인 하나' 도해. LCP 는 H1(사진 없음).
 * 진입 애니메이션 0.
 */
export function StoryHero() {
  const { eyebrow, title, answer, lead, primary, pdf, casesNote, device } = STORY_HERO
  return (
    <section aria-labelledby="story-title" className="bg-surface-paper pt-(--header-h)">
      <div className={cn(STORY_CONTAINER, "pb-16 pt-12 md:pb-24 md:pt-20")}>
        <p className="text-label text-fg-ink">{eyebrow}</p>
        <h1 id="story-title" className="mt-3 text-h1 text-fg-ink lg:mt-4">
          <span className="block lg:whitespace-nowrap">
            {title.lead}{" "}
            {/* 운영자 예외(2026-11-06): 제목 속 강조색 + 형광펜 띠는 이 구절 하나뿐 — app/styles/utilities.css marker-accent.
                구절 안에서는 줄을 바꾸지 않는다(휴대폰에서 “너무 / 많은” 으로 갈리지 않게) */}
            <em className="whitespace-nowrap text-fg-accent marker-accent">{title.marked}</em>
          </span>{" "}
          <span className="block lg:whitespace-nowrap">{title.second}</span>
        </h1>

        <div className="mt-10 grid gap-12 md:mt-12 lg:grid-cols-12 lg:items-start lg:gap-x-6">
          <div className="lg:col-span-6">
            <p className="text-h3 text-fg-ink">{answer}</p>
            <p className="mt-5 max-w-measure text-body-l text-fg-body">{lead}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <TrackedLink
                href={primary.href}
                ctaId={primary.ctaId}
                tracking={{ source: STORY_SOURCE }}
                className={STORY_PRIMARY}
              >
                {primary.label}
                <ArrowRight aria-hidden="true" className="arrow-nudge" />
              </TrackedLink>
              <StoryPdfLink pdf={pdf} ctaId={pdf.ctaId} className={STORY_LINE} />
            </div>
            <p className="mt-6 text-caption text-fg-muted">
              <a href={`#${STORY_CASES.id}`} className="link-quiet">
                {casesNote}
              </a>
            </p>
          </div>

          {/* 도해(sunken): 선생님 A–D 의 도구 23개가 흩어져 있다가 '하나로' 아래 클래스인 한 칸으로 모인다 */}
          <figure className="min-w-0 bg-surface-sunken p-5 sm:p-6 lg:col-span-5 lg:col-start-8 lg:p-8">
            <figcaption className="text-label text-fg-muted">{device.label}</figcaption>
            <ul aria-label={device.listLabel} className="mt-5 flex flex-wrap gap-x-2 gap-y-2.5">
              {device.tools.map((tool, index) => (
                <ToolChip key={tool} tool={tool} index={index} />
              ))}
            </ul>
            <p className="my-6 flex items-center gap-3 text-label text-fg-muted">
              <span aria-hidden="true" className="flex-1 border-t border-line-strong" />
              <span className="inline-flex items-center gap-1.5">
                {device.converge}
                <ArrowDown aria-hidden="true" className="size-4" />
              </span>
              <span aria-hidden="true" className="flex-1 border-t border-line-strong" />
            </p>
            {/* 운영자 지정 장치: 클래스인 한 칸만 그린 채움(r0 — 누를 수 있는 것이 아니라 둥글리지 않는다) */}
            <p className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-fg-accent px-5 py-4 text-fg-on-accent sm:px-6 sm:py-5">
              <span className="text-h3">{device.result}</span>
              <span className="text-caption">
                {device.resultLines.map((line, index) => (
                  <span key={line} className="sm:block">
                    {index > 0 ? " " : null}
                    {line}
                  </span>
                ))}
              </span>
            </p>
          </figure>
        </div>
      </div>
    </section>
  )
}
