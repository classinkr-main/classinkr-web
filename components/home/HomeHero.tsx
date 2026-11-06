"use client"

import { useState } from "react"
import Image, { getImageProps } from "next/image"
import { ArrowRight, Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"
import { HeroVideoBackdrop } from "@/components/media/HeroVideoBackdrop"
import { CLASSIN_POSITIONING } from "@/lib/classin-positioning"
import { HOME_COPY } from "./home-copy"

const { hero } = HOME_COPY
// "칠판은 지워져도, 수업은 남습니다" — 쉼표에서 줄을 바꾼다. 뒤 구절은 따로 블록이라야
// text-balance 가 듣는다(<br /> 뒤에서는 Chrome 이 균형을 잡지 않는다)
const [h1Lead, h1Rest] = CLASSIN_POSITIONING.heroHeadline.split(", ")

// 포스터는 기기에 맞는 한 장만 받는다(<picture> 아트 디렉션): 휴대폰 세로, md 이상 가로.
// eager 지만 priority·fetchPriority 는 쓰지 않는다(가드 img-priority)
const POSTER = { alt: "", fill: true, sizes: "100vw", loading: "eager" } as const
const { props: { srcSet: posterWide } } = getImageProps({ ...POSTER, src: hero.video.poster })
const { props: { srcSet: posterTall, ...posterImg } } = getImageProps({ ...POSTER, src: hero.video.posterMobile })
// 영상은 데스크톱 + 움직임 허용일 때만, 첫 화면이 뜬 뒤(idle) 받는다. 멈춤 버튼도 같은 조건(motion-safe:lg)에서만 보인다
const VIDEO_MEDIA = "(min-width: 64rem) and (prefers-reduced-motion: no-preference)"
// 높이가 낮은 화면(가로 휴대폰 등)에서 붙이면 무대 아래쪽 CTA 가 시트에 가려 닿지 않는다 → 높이 40rem 이상에서만 sticky
const STICKY = "[@media(min-height:40rem)]:sticky [@media(min-height:40rem)]:top-(--header-h)"

export function HomeHero() {
  const [paused, setPaused] = useState(false)

  return (
    // 무대(sticky)와 시트를 한 래퍼에 둔다 — sticky 는 이 래퍼 안에서만 붙고, 시트가 무대를 덮은 뒤 함께 올라간다(V23-A)
    <div className="pt-(--header-h)">
      <section
        className={`surface-ink relative flex min-h-[calc(100svh-var(--header-h))] flex-col items-center justify-center overflow-hidden px-4 py-20 text-center sm:px-6 ${STICKY}`}
      >
        {/* 먹 바탕 위에 포스터·영상을 40% 로 — 덮개·그라데이션 없이 단색 스크림과 같은 효과(가드 gradient) */}
        <div aria-hidden="true" className="absolute inset-0 opacity-40">
          <picture>
            <source media="(min-width: 48rem)" srcSet={posterWide} sizes={POSTER.sizes} />
            {/* eslint-disable-next-line jsx-a11y/alt-text -- getImageProps 아트 디렉션은 <picture> 안 원시 img 다. alt="" 는 posterImg 에 들어 있다 */}
            <img {...posterImg} srcSet={posterTall} className="object-cover" />
          </picture>
          <HeroVideoBackdrop
            src={hero.video.src}
            className="absolute inset-0"
            mediaQuery={VIDEO_MEDIA}
            loadStrategy="idle"
            preload="auto"
            paused={paused}
          />
        </div>

        <div className="relative max-w-[800px]">
          <h1 className="text-display text-fg-ink break-keep">
            <span className="block">{h1Lead},</span>{" "}
            <span className="block text-balance">{h1Rest}</span>
          </h1>
          {/* 영상 위라 본문 회색(fg-body 72%) 대신 흰 글자 — 밝은 장면에서도 대비를 지킨다 */}
          <p className="mx-auto mt-6 max-w-[680px] text-body-l text-fg-ink break-keep">
            <span className="md:block">{hero.lead[0]}</span> <span className="md:block">{hero.lead[1]}</span>
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
            <DemoModal trackingButton="hero_demo">
              {/* 먹 지면 위 채움 버튼 0(C14) → line */}
              <Button variant="line" size="cta" className="w-full sm:w-auto">
                {hero.primaryCta}
                <ArrowRight aria-hidden className="arrow-nudge" />
              </Button>
            </DemoModal>
            {/* 먹 지면 링크는 보통 민트지만, 장면이 바뀌는 영상 위라 흰 글자가 대비가 안정적이다 */}
            <TrackedLink
              href={hero.secondaryHref}
              ctaId="hero_lead_magnet"
              tracking={{ lead_magnet: "academy-system-checklist" }}
              className="inline-flex min-h-11 items-center gap-1 text-ui font-semibold text-fg-ink hover:underline underline-offset-4"
            >
              {hero.secondaryCta}
              <ArrowRight aria-hidden className="size-4 arrow-nudge" />
            </TrackedLink>
          </div>
        </div>

        {/* WCAG 2.2.2 — 5초 넘게 움직이는 영상은 멈출 수 있어야 한다. 이름이 상태를 말하므로 aria-pressed 는 쓰지 않는다 */}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? hero.video.playLabel : hero.video.pauseLabel}
          className="hit-area absolute bottom-12 right-6 hidden size-6 items-center justify-center text-fg-muted hover:text-fg-ink motion-safe:lg:inline-flex"
        >
          {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
      </section>

      {/* 시트 — 무대 위로 24px 겹쳐 올라와 덮는다. 위 모서리 12px, 그림자 없음(V23-A) */}
      <div className="relative z-10 -mt-6 rounded-t-xl bg-surface-paper">
        <div className="mx-auto max-w-[1040px] px-4 pb-20 pt-20 sm:px-6 md:pb-32 md:pt-28">
          {/* 전자칠판 = 틀(빈 검은 화면) + 화면 두 장, 둘 다 투명 컷아웃(그림자는 이미지 안) — 액자·테두리·바탕·반경 없음.
              시트가 칠판을 화면에 들여오면 화면 층만 240ms 뒤 켜진다(Reveal bare → data-moment="hero-screen", site-base.css).
              화면 사각형 = 틀 1408×807 안의 (58,43) 1291×681. 첫 화면 아래라 lazy */}
          <Reveal bare className="relative mx-auto w-full max-w-[960px]">
            <Image
              src={hero.board.frame.src}
              alt={hero.board.alt}
              width={hero.board.frame.width}
              height={hero.board.frame.height}
              sizes="(min-width: 1040px) 960px, 100vw"
              className="h-auto w-full"
            />
            <div data-moment="hero-screen" className="absolute left-[4.119%] top-[5.328%] h-[84.387%] w-[91.69%]">
              <Image src={hero.board.screen.src} alt="" fill sizes="(min-width: 1040px) 880px, 92vw" className="object-cover" />
            </div>
          </Reveal>

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
      </div>
    </div>
  )
}
