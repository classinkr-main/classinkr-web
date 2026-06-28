import Image from "next/image"
import type { LucideIcon } from "lucide-react"
import { ArrowRight, CheckCircle2 } from "lucide-react"

import { TrackedLink } from "@/components/TrackedLink"
import { Reveal } from "@/components/landing/Reveal"

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
    /** Lead phrase — set in regular weight. */
    title: string
    /** Bolded key phrase rendered in Classin green directly after the lead. */
    titleAccent: string
    /** ONE crisp, pointed line. */
    body: string
    image: SegmentVisual
    primaryCta: SegmentCta
    /** Demoted to a subtle ghost / text link below the primary CTA. */
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
      {/* ───────────────────────── HERO ─────────────────────────
          Concise · pointed · bold · minimal. One primary CTA, a demoted
          ghost link, and the board photo as the single focal visual. */}
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 md:pb-28 md:pt-40">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_70%_60%_at_85%_0%,rgba(8,71,52,0.06),transparent_62%)]"
        />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div>
            <Reveal>
              <p className="inline-flex items-center rounded-full border border-[#084734]/15 bg-[#ECFDF5] px-3.5 py-1.5 text-[12px] font-bold tracking-[0.04em] text-[#084734]">
                {page.themeLabel}
              </p>
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-7 max-w-[16ch] text-[2.85rem] font-bold leading-[1.04] tracking-display text-[#111110] sm:text-[3.9rem] lg:text-[4.4rem]">
                {page.hero.title}{" "}
                <strong className="font-extrabold text-[#084734]">
                  {page.hero.titleAccent}
                </strong>
              </h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-7 max-w-[46ch] text-[18px] leading-8 text-[#615D59] sm:text-[20px]">
                {page.hero.body}
              </p>
            </Reveal>

            <Reveal delay={180}>
              <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-4">
                <TrackedLink
                  href={page.hero.primaryCta.href}
                  ctaId={page.hero.primaryCta.ctaId}
                  tracking={{ segment: page.segmentId, surface: "hero_primary" }}
                  className="group inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-7 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(8,71,52,0.45)] transition-all hover:bg-[#065c41] hover:shadow-[0_14px_38px_-8px_rgba(8,71,52,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 active:scale-[0.97]"
                >
                  {page.hero.primaryCta.label}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </TrackedLink>
                <TrackedLink
                  href={page.hero.secondaryCta.href}
                  ctaId={page.hero.secondaryCta.ctaId}
                  tracking={{ segment: page.segmentId, surface: "hero_secondary" }}
                  className="group inline-flex items-center gap-1.5 border-b border-transparent pb-0.5 text-[15px] font-semibold text-[#615D59] transition-colors hover:border-[#084734] hover:text-[#084734] focus-visible:outline-none focus-visible:text-[#084734]"
                >
                  {page.hero.secondaryCta.label}
                  <ArrowRight
                    className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </TrackedLink>
              </div>
            </Reveal>

            <Reveal delay={240}>
              <dl className="mt-12 grid max-w-2xl grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
                {page.hero.evidence.map((item) => (
                  <div key={item.label} className="border-t border-black/[0.08] pt-4">
                    <dt className="text-[12px] font-bold uppercase tracking-[0.06em] text-[#A39E98]">
                      {item.label}
                    </dt>
                    <dd className="mt-2 text-[15px] font-semibold leading-6 text-[#111110]">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          <Reveal delay={120} className="relative">
            <div className="overflow-hidden rounded-[18px] border border-black/[0.08] bg-white p-2 shadow-deep">
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
            <div className="mt-4 rounded-[14px] border border-black/[0.08] bg-white p-5 shadow-card">
              <ul className="grid gap-2.5 text-[14px] leading-6 text-[#615D59]">
                {page.hero.visualNotes.map((note) => (
                  <li key={note} className="flex gap-2.5">
                    <CheckCircle2
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]"
                      aria-hidden="true"
                    />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── PROBLEM ───────────────────────── */}
      <section className="bg-white px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1180px]">
          <SectionHeading heading={page.problem.heading} body={page.problem.body} />
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {page.problem.items.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <InsightCard item={item} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── FLOW ───────────────────────── */}
      <section className="bg-[#F6F5F4] px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading heading={page.flow.heading} body={page.flow.body} />
          <ol className="mt-16 grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {page.flow.steps.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 80} className="group relative">
                {/* connector line */}
                {index < page.flow.steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-[3.25rem] top-[1.1rem] hidden h-px w-[calc(100%-2rem)] bg-gradient-to-r from-[#084734]/25 to-transparent lg:block"
                  />
                ) : null}
                <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[#084734] text-[13px] font-bold text-white shadow-[0_6px_16px_-6px_rgba(8,71,52,0.6)]">
                  {index + 1}
                </div>
                <h3 className="mt-6 text-[19px] font-bold leading-snug tracking-card text-[#111110]">
                  {step.title}
                </h3>
                <p className="mt-3 text-[14px] leading-7 text-[#615D59]">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────────────────── PROOF ───────────────────────── */}
      <section className="bg-white px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[0.86fr_1.14fr] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <SectionHeading heading={page.proof.heading} body={page.proof.body} align="left" />
            <Reveal delay={120}>
              <p className="mt-7 rounded-[12px] border border-[#084734]/12 bg-[#ECFDF5] p-5 text-[14px] leading-7 text-[#084734]">
                {page.carefulNote}
              </p>
            </Reveal>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {page.proof.items.map((item, index) => (
              <Reveal key={item.title} delay={index * 70}>
                <InsightCard item={item} compact />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────────── DECISION ───────────────────────── */}
      <section className="bg-[#ECFDF5] px-4 py-20 sm:px-6 md:py-28">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading heading={page.decision.heading} body={page.decision.body} />
          <Reveal>
            <ol className="mt-14 overflow-hidden rounded-[16px] border border-black/[0.08] bg-white shadow-card">
              {page.decision.rows.map((row, index) => (
                <li
                  key={row.title}
                  className="group grid gap-3 border-b border-black/[0.08] px-6 py-6 transition-colors last:border-b-0 hover:bg-[#FAFAF8] md:grid-cols-[200px_1fr] md:items-baseline md:gap-8 md:px-8"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-[12px] font-bold text-[#084734]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[15px] font-bold tracking-card text-[#111110]">
                      {row.title}
                    </span>
                  </div>
                  <p className="text-[14px] leading-7 text-[#615D59]">{row.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      {/* ───────────────────────── FINAL CTA ───────────────────────── */}
      <section className="bg-[#ECFDF5] px-4 pb-24 pt-4 text-[#111110] sm:px-6 md:pb-32">
        <Reveal>
          <div className="mx-auto max-w-[1120px] overflow-hidden rounded-[24px] border border-[#084734]/14 bg-gradient-to-br from-white to-[#F6F5F4] p-8 shadow-deep sm:p-12 md:p-14">
            <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <h2 className="max-w-3xl text-[2rem] font-bold leading-[1.1] tracking-section sm:text-[2.85rem]">
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
                  className="group inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-[6px] bg-[#084734] px-7 text-[15px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(8,71,52,0.45)] transition-all hover:bg-[#065c41] hover:shadow-[0_14px_38px_-8px_rgba(8,71,52,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 active:scale-[0.97]"
                >
                  {page.finalCta.primaryCta.label}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </TrackedLink>
                <TrackedLink
                  href={page.finalCta.secondaryCta.href}
                  ctaId={page.finalCta.secondaryCta.ctaId}
                  tracking={{ segment: page.segmentId, surface: "final_secondary" }}
                  className="inline-flex min-h-[3.25rem] items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-7 text-[15px] font-semibold text-[#111110] shadow-sm transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
                >
                  {page.finalCta.secondaryCta.label}
                </TrackedLink>
              </div>
            </div>
          </div>
        </Reveal>
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
    <Reveal className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <h2 className="text-[2rem] font-bold leading-[1.1] tracking-section text-[#111110] sm:text-[2.85rem]">
        {heading}
      </h2>
      <p
        className={`mt-5 text-[16px] leading-8 text-[#615D59] ${
          align === "center" ? "mx-auto" : ""
        }`}
      >
        {body}
      </p>
    </Reveal>
  )
}

function InsightCard({ item, compact = false }: { item: SegmentItem; compact?: boolean }) {
  const Icon = item.icon

  return (
    <article className="group h-full rounded-[14px] border border-black/[0.08] bg-white p-6 shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-[#084734]/15 hover:shadow-deep">
      <div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#ECFDF5] text-[#084734] transition-colors group-hover:bg-[#D1FAE5]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3
        className={`${
          compact ? "mt-5 text-[18px]" : "mt-6 text-[20px]"
        } font-bold leading-snug tracking-card text-[#111110]`}
      >
        {item.title}
      </h3>
      <p className="mt-3 text-[14px] leading-7 text-[#615D59]">{item.body}</p>
    </article>
  )
}
