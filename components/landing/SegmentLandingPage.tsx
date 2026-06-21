import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, CheckCircle2 } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"

type SegmentCta = {
  label: string
  href: string
  ctaId: string
  description?: string
}

type SegmentVisual = {
  src: string
  alt: string
  width: number
  height: number
  objectPosition?: string
}

type SegmentItem = {
  title: string
  body: string
  icon: LucideIcon
}

type SegmentStep = {
  title: string
  body: string
}

type SegmentEvidence = {
  label: string
  value: string
}

export type SegmentLandingPageData = {
  segmentId: string
  themeLabel: string
  hero: {
    title: string
    body: string
    image: SegmentVisual
    primaryCta: SegmentCta
    secondaryCta: SegmentCta
    evidence: SegmentEvidence[]
    visualNotes: string[]
  }
  problem: {
    heading: string
    body: string
    items: SegmentItem[]
  }
  flow: {
    heading: string
    body: string
    steps: SegmentStep[]
  }
  proof: {
    heading: string
    body: string
    items: SegmentItem[]
  }
  decision: {
    heading: string
    body: string
    rows: SegmentStep[]
  }
  finalCta: {
    heading: string
    body: string
    primaryCta: SegmentCta
    secondaryCta: SegmentCta
  }
  carefulNote: string
}

export function SegmentLandingPage({ page }: { page: SegmentLandingPageData }) {
  return (
    <div className="bg-[#FAFAF8] text-[#111110]">
      <section className="px-4 pb-14 pt-32 sm:px-6 md:pb-20 md:pt-36">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
          <div>
            <h1 className="max-w-4xl text-[2.75rem] font-bold leading-[1.02] tracking-display text-[#111110] sm:text-[4rem] lg:text-[4.65rem]">
              {page.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-[17px] leading-8 text-[#615D59] sm:text-[19px]">
              {page.hero.body}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <TrackedLink
                href={page.hero.primaryCta.href}
                ctaId={page.hero.primaryCta.ctaId}
                tracking={{ segment: page.segmentId, surface: "hero_primary" }}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-6 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 active:scale-[0.97]"
              >
                {page.hero.primaryCta.label}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink
                href={page.hero.secondaryCta.href}
                ctaId={page.hero.secondaryCta.ctaId}
                tracking={{ segment: page.segmentId, surface: "hero_secondary" }}
                className="inline-flex min-h-12 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-6 text-[15px] font-semibold text-[#111110] shadow-sm transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
              >
                {page.hero.secondaryCta.label}
              </TrackedLink>
            </div>

            <dl className="mt-8 grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
              {page.hero.evidence.map((item) => (
                <div key={item.label} className="border-t border-black/[0.08] pt-4">
                  <dt className="text-[13px] font-semibold text-[#615D59]">{item.label}</dt>
                  <dd className="mt-1 text-[15px] font-semibold leading-6 text-[#111110]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[16px] border border-black/[0.08] bg-white p-2 shadow-card">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-[#F6F5F4]">
                <Image
                  src={page.hero.image.src}
                  alt={page.hero.image.alt}
                  width={page.hero.image.width}
                  height={page.hero.image.height}
                  priority
                  className="h-full w-full object-cover"
                  style={{ objectPosition: page.hero.image.objectPosition ?? "50% 50%" }}
                  sizes="(min-width: 1024px) 46vw, 92vw"
                />
              </div>
            </div>
            <div className="mt-4 rounded-[12px] border border-black/[0.08] bg-white p-5 shadow-card">
              <p className="text-[13px] font-semibold text-[#084734]">{page.themeLabel}</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#615D59]">
                {page.hero.visualNotes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" aria-hidden="true" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-[1200px]">
          <SectionHeading heading={page.problem.heading} body={page.problem.body} />
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {page.problem.items.map((item) => (
              <InsightCard key={item.title} item={item} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#F6F5F4] px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading heading={page.flow.heading} body={page.flow.body} />
          <ol className="mt-12 grid gap-3 lg:grid-cols-4">
            {page.flow.steps.map((step, index) => (
              <li key={step.title} className="rounded-[8px] border border-black/[0.08] bg-white p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#ECFDF5] text-sm font-bold text-[#084734]">
                  {index + 1}
                </div>
                <h3 className="mt-5 text-xl font-bold leading-snug tracking-card">{step.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#615D59]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-[0.88fr_1.12fr] lg:items-start">
          <div>
            <SectionHeading heading={page.proof.heading} body={page.proof.body} align="left" />
            <p className="mt-6 rounded-[8px] border border-black/[0.08] bg-[#ECFDF5] p-4 text-sm leading-6 text-[#084734]">
              {page.carefulNote}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {page.proof.items.map((item) => (
              <InsightCard key={item.title} item={item} compact />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#ECFDF5] px-4 py-16 sm:px-6 md:py-24">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading heading={page.decision.heading} body={page.decision.body} />
          <ol className="mt-10 overflow-hidden rounded-[12px] border border-black/[0.08] bg-white shadow-card">
            {page.decision.rows.map((row, index) => (
              <li
                key={row.title}
                className="grid gap-3 border-b border-black/[0.08] px-5 py-5 last:border-b-0 md:grid-cols-[220px_1fr] md:px-7"
              >
                <div className="text-sm font-bold text-[#084734]">
                  {String(index + 1).padStart(2, "0")} · {row.title}
                </div>
                <p className="text-sm leading-6 text-[#615D59]">{row.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-[#ECFDF5] px-4 py-16 text-[#111110] sm:px-6 md:py-24">
        <div className="mx-auto grid max-w-[1120px] gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <h2 className="max-w-3xl text-3xl font-bold leading-tight tracking-section sm:text-5xl">
              {page.finalCta.heading}
            </h2>
            <p className="mt-5 max-w-2xl text-[16px] leading-7 text-[#615D59]">
              {page.finalCta.body}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
            <TrackedLink
              href={page.finalCta.primaryCta.href}
              ctaId={page.finalCta.primaryCta.ctaId}
              tracking={{ segment: page.segmentId, surface: "final_primary" }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-6 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              {page.finalCta.primaryCta.label}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </TrackedLink>
            <TrackedLink
              href={page.finalCta.secondaryCta.href}
              ctaId={page.finalCta.secondaryCta.ctaId}
              tracking={{ segment: page.segmentId, surface: "final_secondary" }}
              className="inline-flex min-h-12 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-6 text-[15px] font-semibold text-[#111110] shadow-sm transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
            >
              {page.finalCta.secondaryCta.label}
            </TrackedLink>
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionHeading({
  heading,
  body,
  align = "center",
}: {
  heading: string
  body: string
  align?: "center" | "left"
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <h2 className="text-3xl font-bold leading-tight tracking-section text-[#111110] sm:text-5xl">
        {heading}
      </h2>
      <p className="mt-5 text-[16px] leading-7 text-[#615D59]">{body}</p>
    </div>
  )
}

function InsightCard({ item, compact = false }: { item: SegmentItem; compact?: boolean }) {
  const Icon = item.icon

  return (
    <article className="h-full rounded-[8px] border border-black/[0.08] bg-white p-5 shadow-card">
      <div className="flex h-10 w-10 items-center justify-center rounded-[6px] bg-[#ECFDF5] text-[#084734]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className={`${compact ? "mt-4 text-lg" : "mt-6 text-xl"} font-bold leading-snug tracking-card`}>
        {item.title}
      </h3>
      <p className="mt-3 text-sm leading-6 text-[#615D59]">{item.body}</p>
    </article>
  )
}
