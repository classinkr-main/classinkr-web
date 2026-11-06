import { ArrowDown } from "lucide-react"

import { INTRO_DOWNLOADS, INTRO_HERO } from "@/lib/introduction/content"
import { cn } from "@/lib/utils"

import { IntroDownloadLink } from "../IntroDownloadLink"
import { IntroFigure } from "../IntroFigure"
import { INTRO_CONTAINER, folio } from "./primitives"

// 이 페이지의 잉크 밑줄 한 구절(ink-underline 페이지당 1, typography §3-3). 제목에 없으면 밑줄 없이 그린다
const UNDERLINED_PHRASE = "가장 교실다운"

/**
 * 소개서 표지. 라벨 → H1(1–9칸) → 왼쪽 차례(1–6칸) · 오른쪽 덱 + 소개서 PDF(8–12칸) → 콘텐츠 폭 사진 plate.
 * LCP 는 H1 이다(사진에 priority 없음). 진입 애니메이션 0 — 잉크 밑줄 색만 CSS 로 스민다(동작 줄이기면 정지).
 */
export function IntroHero() {
  const { eyebrow, title, lead, image, nav } = INTRO_HERO
  return (
    <section aria-labelledby="introduction-title" className="bg-surface-paper pt-(--header-h)">
      <div className={cn(INTRO_CONTAINER, "pb-16 pt-12 md:pb-24 md:pt-20")}>
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
          <p className="text-label text-fg-ink lg:col-span-12">{eyebrow}</p>
          <h1
            id="introduction-title"
            data-moment="hero-underline"
            className="mt-3 text-h1 text-fg-ink lg:col-span-9 lg:mt-4"
          >
            <HeroTitle title={title} />
          </h1>

          <div className="mt-8 lg:col-span-5 lg:col-start-8 lg:row-start-3 lg:mt-12">
            <p className="max-w-deck text-body-l text-fg-body">{lead}</p>
            <IntroDownloadLink download={INTRO_DOWNLOADS.introduction} className="mt-6" />
          </div>

          <nav aria-label="소개서 차례" className="mt-10 lg:col-span-6 lg:col-start-1 lg:row-start-3 lg:mt-12">
            <ol className="border-t border-line-ink">
              {nav.map((item, index) => (
                <li key={item.id}>
                  <a
                    href={`#${item.id}`}
                    className="group flex min-h-12 items-center gap-4 border-b border-line-hair py-3"
                  >
                    <span aria-hidden="true" className="w-6 shrink-0 text-folio tabular-nums text-fg-muted">
                      {folio(index + 1)}
                    </span>
                    <span className="min-w-0 text-ui font-medium text-fg-ink underline-offset-4 group-hover:underline">
                      {item.label}
                    </span>
                    <ArrowDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-fg-accent" />
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* 콘텐츠 폭 plate. 휴대폰에서는 가로로 긴 배너가 너무 얇아져 16:9 로 가운데를 잘라 보여 준다 */}
        <IntroFigure
          asset={image.asset}
          alt={image.alt}
          className="mt-12 md:mt-16"
          imageClassName="aspect-video object-cover sm:aspect-auto"
        />
      </div>
    </section>
  )
}

function HeroTitle({ title }: { title: string }) {
  const at = title.indexOf(UNDERLINED_PHRASE)
  if (at < 0) return <>{title}</>
  return (
    <>
      {title.slice(0, at)}
      <span className="inline-block ink-underline">{UNDERLINED_PHRASE}</span>
      {title.slice(at + UNDERLINED_PHRASE.length)}
    </>
  )
}
