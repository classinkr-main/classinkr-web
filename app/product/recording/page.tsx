import type { Metadata } from "next"
import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DemoModal } from "@/components/sections/DemoModal"
import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"
import { GatewayLink } from "@/components/home/GatewayLink"
import { HomePilotCta } from "@/components/home/HomePilotCta"
import { JsonLd } from "@/components/seo/JsonLd"
import { RECORDING_COPY } from "@/components/recording/recording-copy"
import { createBreadcrumbJsonLd, createPublicMetadata, createWebPageJsonLd } from "@/lib/seo"

const PATH = "/product/recording"
const NAME = "수업 녹화"
const DESCRIPTION =
  "Classin 보드로 수업을 시작하면 칠판 화면과 AI 카메라가 함께 녹화하고, 수업이 끝나면 클라우드에 저장됩니다. 결석 보강과 복습, 시청 확인까지 녹화 하나로 합니다."

export const metadata: Metadata = createPublicMetadata({
  title: "학원 수업 녹화: 수업만 하면 녹화는 저절로",
  description: DESCRIPTION,
  path: PATH,
  keywords: ["학원 수업 녹화", "수업 녹화", "AI 카메라 녹화", "결석 보강 영상", "수업 다시보기", "Classin"],
})

const { hero, how, gains, control, pilot } = RECORDING_COPY
// 홈 이득 3행과 같은 컨테이너·리듬(80/128) — 히어로만 고정 헤더 높이를 더한다(DESIGN §5-A)
const CONTAINER = "mx-auto max-w-[1040px] px-4 sm:px-6"
const KICKER = "text-caption font-medium text-fg-muted"
const ITEM_LABEL = "text-note font-medium text-fg-muted"
const ITEM_TITLE = "mt-1.5 text-body-l font-semibold text-fg-ink break-keep"
const ITEM_BODY = "mt-2 text-body text-fg-body break-keep"
const CAPTION = "mt-3 text-note text-fg-muted break-keep"

// 녹화 수업 랜딩: 히어로(실제 다시보기 화면) → 작동 방식(3단계 + 앱 수업 목록) → 달라지는 것(시청 기록) → 시청 설정 → 홈 파일럿 띠
export default function RecordingPage() {
  return (
    <>
      <JsonLd
        data={[
          createWebPageJsonLd({ path: PATH, name: NAME, description: DESCRIPTION }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "제품 소개", path: "/product" },
            { name: NAME, path: PATH },
          ]),
        ]}
      />

      <section className="bg-surface-paper pb-20 pt-[calc(var(--header-h)+48px)] md:pb-24 md:pt-[calc(var(--header-h)+80px)]">
        <div className={CONTAINER}>
          <p className={KICKER}>{hero.kicker}</p>
          <h1 className="mt-4 text-h1 text-fg-ink break-keep">
            <span className="block">{hero.title[0]}</span>{" "}
            <span className="block">{hero.title[1]}</span>
          </h1>
          <p className="mt-6 max-w-measure text-body-l text-fg-body break-keep">{hero.lead}</p>
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
          {/* 실제 창 캡처는 홈과 같은 plate-window(창 모양 그림자 하나) */}
          <figure className="mt-12 max-w-[880px] md:mt-14">
            <Image
              src={hero.image.src}
              alt={hero.image.alt}
              width={hero.image.width}
              height={hero.image.height}
              sizes="(min-width: 1040px) 880px, 100vw"
              className="plate-window h-auto w-full"
            />
            <figcaption className={CAPTION}>{hero.caption}</figcaption>
          </figure>
        </div>
      </section>

      <section className="bg-surface-sunken py-20 md:py-32">
        <Reveal className={CONTAINER}>
          <p className={KICKER}>{how.kicker}</p>
          <h2 className="mt-3 text-h2 text-fg-ink break-keep">{how.heading}</h2>
          <div className="mt-10 flex flex-col gap-10 lg:mt-12 lg:flex-row lg:items-center lg:gap-14">
            <figure className="lg:w-[52%] lg:shrink-0">
              <Image
                src={how.image.src}
                alt={how.image.alt}
                width={how.image.width}
                height={how.image.height}
                sizes="(min-width: 1040px) 516px, (min-width: 1024px) 52vw, 100vw"
                className="h-auto w-full"
              />
              <figcaption className={CAPTION}>{how.caption}</figcaption>
            </figure>
            <div className="lg:flex-1">
              <ol className="border-b border-line-strong">
                {how.steps.map((step) => (
                  <li key={step.label} className="border-t border-line-strong py-5 md:py-6">
                    <p className={`${ITEM_LABEL} tabular-nums`}>{step.label}</p>
                    <h3 className={ITEM_TITLE}>{step.title}</h3>
                    <p className={ITEM_BODY}>{step.body}</p>
                  </li>
                ))}
              </ol>
              <GatewayLink href={how.boardLink.href} className="mt-6">
                {how.boardLink.label}
              </GatewayLink>
            </div>
          </div>

          {/* 수업 후의 실제 모습 — 휴대폰은 캡처 → 글, lg 부터 글 왼쪽·캡처 오른쪽 */}
          <div className="mt-16 flex flex-col gap-6 md:mt-20 lg:flex-row-reverse lg:items-start lg:gap-10">
            <figure className="lg:min-w-0 lg:flex-1">
              <Image
                src={how.list.image.src}
                alt={how.list.image.alt}
                width={how.list.image.width}
                height={how.list.image.height}
                sizes="(min-width: 1040px) 712px, (min-width: 1024px) 70vw, 100vw"
                className="plate-window h-auto w-full"
              />
              <figcaption className={CAPTION}>{how.list.caption}</figcaption>
            </figure>
            <div className="border-t border-line-strong pt-5 lg:w-60 lg:shrink-0">
              <p className={ITEM_LABEL}>{how.list.kicker}</p>
              <h3 className={ITEM_TITLE}>{how.list.title}</h3>
              <p className={ITEM_BODY}>{how.list.body}</p>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-surface-paper py-20 md:py-32">
        <Reveal className={CONTAINER}>
          <p className={KICKER}>{gains.kicker}</p>
          <h2 className="mt-3 text-h2 text-fg-ink break-keep">{gains.heading}</h2>
          <div className="mt-10 flex flex-col gap-10 lg:mt-12 lg:flex-row-reverse lg:items-start lg:gap-14">
            <figure className="lg:w-[52%] lg:shrink-0">
              <Image
                src={gains.image.src}
                alt={gains.image.alt}
                width={gains.image.width}
                height={gains.image.height}
                sizes="(min-width: 1040px) 516px, (min-width: 1024px) 52vw, 100vw"
                className="plate-window h-auto w-full"
              />
              <figcaption className={CAPTION}>{gains.caption}</figcaption>
            </figure>
            <ul className="flex flex-col gap-6 lg:flex-1">
              {gains.roles.map((item) => (
                <li key={item.role} className="border-t border-line-strong pt-5">
                  <p className={ITEM_LABEL}>{item.role}</p>
                  <h3 className={ITEM_TITLE}>{item.title}</h3>
                  <p className={ITEM_BODY}>{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </section>

      <section className="bg-surface-sunken py-20 md:py-24">
        <Reveal className={CONTAINER}>
          <p className={KICKER}>{control.kicker}</p>
          <h2 className="mt-3 text-h2 text-fg-ink break-keep">{control.heading}</h2>
          {/* 글만 있는 단은 상자 없이 열린 단 — 위 괘선 + 단 사이 세로 hair(DESIGN §4 카드) */}
          <ul className="mt-10 grid divide-y divide-line-hair border-t border-line-strong md:mt-12 md:grid-cols-3 md:divide-x md:divide-y-0">
            {control.items.map((item) => (
              <li key={item.title} className="py-5 md:px-6 md:pb-0 md:pt-6 md:first:pl-0 md:last:pr-0">
                <h3 className="text-body-l font-semibold text-fg-ink break-keep">{item.title}</h3>
                <p className={ITEM_BODY}>{item.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-caption text-fg-muted break-keep">{control.note}</p>
          <div className="mt-8 flex flex-col items-start gap-1 border-t border-line-hair pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
            <p className="text-body text-fg-body break-keep">{control.ai.text}</p>
            <GatewayLink href={control.ai.href} className="min-h-11">
              {control.ai.label}
            </GatewayLink>
          </div>
        </Reveal>
      </section>

      <HomePilotCta source="recording_final_cta" heading={pilot.heading} />
    </>
  )
}
