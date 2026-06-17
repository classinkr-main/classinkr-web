import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ExternalLink, FileText, Sparkles } from "lucide-react"
import { TrackedLink } from "@/components/TrackedLink"
import {
  getLeadMagnetCategoryLabel,
  getLeadMagnetItemCount,
  getLeadMagnetPublicGateLabel,
  getLeadMagnetTierLabel,
} from "@/lib/lead-magnets"
import {
  getLeadMagnetBySlugFromStore,
  getPublishedLeadMagnets,
} from "@/lib/repositories/lead-magnets"
import { ResourceViewTracker } from "./ResourceViewTracker"

// 구독 완료 후 열람하는 자료 — 검색 노출 대신 게이트 블록 링크로만 접근.
export const revalidate = 86400

interface ResourcePageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  const magnets = await getPublishedLeadMagnets()
  return magnets.map((magnet) => ({ slug: magnet.slug }))
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { slug } = await params
  const magnet = await getLeadMagnetBySlugFromStore(slug)
  if (!magnet || !magnet.published) {
    return { title: "자료를 찾을 수 없습니다", robots: { index: false, follow: false } }
  }
  return {
    title: `${magnet.title} | Classin 자료`,
    description: magnet.summary,
    robots: { index: false, follow: false },
  }
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { slug } = await params
  const magnet = await getLeadMagnetBySlugFromStore(slug)

  if (!magnet || !magnet.published) {
    notFound()
  }

  const itemCount = getLeadMagnetItemCount(magnet)

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <ResourceViewTracker leadMagnet={magnet} />
      <section className="px-4 pb-16 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[920px]">
          <Link
            href="/resources"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            자료실로 돌아가기
          </Link>

          {/* 헤더 카드 */}
          <div className="overflow-hidden rounded-[24px] border border-[#dcebd9] bg-[#ECFDF5] shadow-sm md:rounded-[32px]">
            <div className="h-1 w-full bg-gradient-to-r from-[#084734] via-[#6EE7B7] to-[#084734]" />
            <div className="p-6 md:p-10">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#084734]/10 bg-white px-3.5 py-1 text-[11px] font-bold tracking-[0.04em] text-[#084734]">
                <Sparkles className="h-3 w-3" />
                {magnet.ctaCopy.eyebrow}
              </span>
              <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.12] tracking-[-0.04em] text-[#111110] md:text-[2.6rem]">
                {magnet.title}
              </h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#1a1a1a]/65 md:text-[17px]">
                {magnet.summary}
              </p>
              <div className="mt-5 flex flex-wrap gap-2 text-[12px] font-semibold text-[#084734]">
                <span className="rounded-full border border-[#084734]/10 bg-white px-3 py-1">
                  {getLeadMagnetPublicGateLabel(magnet.gate)}
                </span>
                <span className="rounded-full border border-[#084734]/10 bg-white px-3 py-1">
                  {getLeadMagnetTierLabel(magnet.tier)} 자료
                </span>
                <span className="rounded-full border border-[#084734]/10 bg-white px-3 py-1">
                  {getLeadMagnetCategoryLabel(magnet.category)}
                </span>
                <span className="rounded-full border border-[#084734]/10 bg-white px-3 py-1">
                  {itemCount}문항
                </span>
                <span className="rounded-full border border-[#084734]/10 bg-white px-3 py-1">
                  약 {magnet.estimatedMinutes}분
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#084734]/70">
                {magnet.formatLabel}
              </p>
              <p className="mt-2 text-sm text-[#084734]/70">추천 대상: {magnet.audience}</p>
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#111110]">
                <FileText className="h-4 w-4 text-[#084734]" />
                이 자료에 포함된 것
              </div>
              <ul className="space-y-3">
                {magnet.deliverables.map((item) => (
                  <li key={item} className="flex gap-2 text-[14px] leading-6 text-[#615D59]">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#111110]">
                <CalendarDays className="h-4 w-4 text-[#084734]" />
                상담 전에 준비하면 좋은 자료
              </div>
              <ul className="space-y-3">
                {magnet.consultationPrep.map((item) => (
                  <li key={item} className="flex gap-2 text-[14px] leading-6 text-[#615D59]">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="mt-8 rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm md:p-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
              Checklist
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              전체 점검 문항
            </h2>
            <p className="mt-2 text-[14px] leading-6 text-[#615D59]">
              각 문항에 대해 현재 상태가 안정적이면 1점, 아니면 0점으로 표시하세요.
              총점보다 낮게 나온 영역이 먼저 손볼 운영 병목입니다.
            </p>

            <div className="mt-8 space-y-8">
              {magnet.sections.map((section, sectionIndex) => (
                <div key={section.title}>
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ECFDF5] text-sm font-bold text-[#084734]">
                      {sectionIndex + 1}
                    </span>
                    <div>
                      <h3 className="text-[18px] font-bold leading-6 text-[#111110]">
                        {section.title}
                      </h3>
                      <p className="mt-1 text-[13px] leading-6 text-[#615D59]">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <ol className="mt-4 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                    {section.items.map((item, itemIndex) => (
                      <li key={item} className="grid gap-3 py-3 sm:grid-cols-[44px_minmax(0,1fr)]">
                        <span className="text-[12px] font-bold text-[#084734]/65">
                          {sectionIndex + 1}-{itemIndex + 1}
                        </span>
                        <p className="text-[14px] leading-6 text-[#31302E]">{item}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm md:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                Score
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
                점수 해석
              </h2>
              <div className="mt-6 divide-y divide-black/[0.08] border-y border-black/[0.08]">
                {magnet.scoreBands.map((band) => (
                  <div key={band.range} className="grid gap-2 py-4 sm:grid-cols-[96px_minmax(0,1fr)]">
                    <span className="text-sm font-bold text-[#084734]">{band.range}</span>
                    <div>
                      <p className="font-bold text-[#111110]">{band.label}</p>
                      <p className="mt-1 text-[13px] leading-6 text-[#615D59]">
                        {band.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {magnet.redFlags && magnet.redFlags.length > 0 ? (
              <section className="rounded-[16px] border border-black/[0.08] bg-[#F6F5F4] p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-[#111110]">
                  <AlertTriangle className="h-4 w-4 text-[#B85C33]" />
                  재검토 신호
                </div>
                <ul className="space-y-3">
                  {magnet.redFlags.map((item) => (
                    <li key={item} className="text-[13px] leading-6 text-[#615D59]">
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {magnet.sourceLinks && magnet.sourceLinks.length > 0 ? (
            <section className="mt-8 rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm md:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                Reference Links
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
                더 확인할 링크
              </h2>
              <div className="mt-5 grid gap-3">
                {magnet.sourceLinks.map((link) => (
                  <TrackedLink
                    key={`${link.label}-${link.href}`}
                    href={link.href}
                    ctaId="resource_reference_link"
                    tracking={{
                      source: "resource_reference",
                      lead_magnet: magnet.slug,
                      gate: magnet.gate,
                      destination: link.href,
                    }}
                    className="group rounded-[12px] border border-black/[0.08] p-4 transition-colors hover:bg-[#F6F5F4]"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold text-[#111110] group-hover:text-[#084734]">
                          {link.label}
                        </span>
                        {link.description ? (
                          <span className="mt-1 block text-[13px] leading-6 text-[#615D59]">
                            {link.description}
                          </span>
                        ) : null}
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-[#084734]" />
                    </span>
                  </TrackedLink>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8 rounded-[16px] border border-black/[0.08] bg-white p-6 shadow-sm md:p-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
              Action Plan
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              7일 실행 플랜
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {magnet.actionPlan.map((step) => (
                <div key={step.day} className="rounded-[12px] border border-black/[0.08] p-5">
                  <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#084734]/65">
                    {step.day}
                  </p>
                  <h3 className="mt-2 font-bold text-[#111110]">{step.title}</h3>
                  <ul className="mt-3 space-y-2">
                    {step.tasks.map((task) => (
                      <li key={task} className="flex gap-2 text-[13px] leading-6 text-[#615D59]">
                        <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* 상담 CTA */}
          <div className="mt-8 overflow-hidden rounded-[16px] bg-[#111110] p-6 text-white shadow-sm md:p-10">
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.03em] md:text-[2rem]">
              점검 결과, 함께 보완해 드릴까요?
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/60">
              체크리스트에서 막히는 항목이 있다면 우리 학원 상황에 맞춰 무료로 진단해
              드립니다.
            </p>
            <TrackedLink
              href="/contact#contact-form"
              ctaId="resource_detail_contact"
              tracking={{
                source: "resource_detail",
                lead_magnet: magnet.slug,
                gate: magnet.gate,
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
            >
              무료 상담 신청하기
              <ArrowRight className="h-4 w-4" />
            </TrackedLink>
          </div>
        </div>
      </section>
    </div>
  )
}
