import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileText,
} from "lucide-react"
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
import { ResourceDownloadForm } from "./ResourceDownloadForm"
import { ResourceViewTracker } from "./ResourceViewTracker"

// 자료 다운로드 랜딩 — PDF 파일이 연결되면 같은 폼 흐름에서 서명 URL로 전환된다.
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
  const pdfGuide = magnet.pdfGuide
  const storyGuide = magnet.storyGuide
  const relatedMagnets = pdfGuide?.relatedMagnets?.length
    ? (await getPublishedLeadMagnets()).filter((item) =>
        pdfGuide.relatedMagnets.includes(item.slug)
      )
    : []
  const downloadResource = {
    slug: magnet.slug,
    title: magnet.title,
    gate: magnet.gate,
    estimatedMinutes: magnet.estimatedMinutes,
    itemCount,
    hasPdfFile: Boolean(magnet.storagePath?.trim() || magnet.resourceUrl?.endsWith(".pdf")),
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <ResourceViewTracker leadMagnet={magnet} />
      <section className="px-4 pb-16 pt-28 sm:px-6 md:pt-36">
        <div className="mx-auto max-w-[1120px]">
          <Link
            href="/resources"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            자료실로 돌아가기
          </Link>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            {/* 헤더 카드 */}
            <div className="overflow-hidden border border-black/[0.08] bg-white shadow-[0_10px_28px_rgba(17,17,16,0.04)]">
              <div className="h-1 w-full bg-[#084734]" />
              <div className="p-6 md:p-10">
                <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.12] tracking-[-0.04em] text-[#111110] md:text-[2.6rem]">
                  {magnet.title}
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#615D59] md:text-[17px]">
                  {pdfGuide?.subtitle ?? magnet.summary}
                </p>
                <p className="mt-3 max-w-2xl text-[14px] leading-7 text-[#31302E]">
                  {pdfGuide?.outcome ?? magnet.summary}
                </p>
                <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-semibold text-[#615D59]">
                  <span>
                    {getLeadMagnetPublicGateLabel(magnet.gate)}
                  </span>
                  <span>
                    {getLeadMagnetTierLabel(magnet.tier)} 자료
                  </span>
                  <span>
                    {getLeadMagnetCategoryLabel(magnet.category)}
                  </span>
                  <span>
                    {itemCount}문항
                  </span>
                  <span>
                    PDF 자료
                  </span>
                </div>
                <div className="mt-6 grid gap-4 border-t border-black/[0.08] pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A39E98]">
                      자료 구성
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#31302E]">
                      {magnet.formatLabel}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#A39E98]">
                      추천 대상
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-[#31302E]">
                      {magnet.audience}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <ResourceDownloadForm resource={downloadResource} />
          </div>

          {storyGuide ? (
            <section className="mt-8 border border-black/[0.08] bg-white p-6 md:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                {storyGuide.eyebrow}
              </p>
              <div className="mt-3 grid gap-7 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
                <div>
                  <h2 className="text-2xl font-bold leading-tight text-[#111110]">
                    {storyGuide.title}
                  </h2>
                  <p className="mt-4 text-[15px] leading-7 text-[#615D59]">
                    {storyGuide.body}
                  </p>
                  {storyGuide.takeaway ? (
                    <p className="mt-5 border-l-2 border-[#084734] bg-[#F6F5F4] px-4 py-3 text-[14px] font-semibold leading-7 text-[#31302E]">
                      {storyGuide.takeaway}
                    </p>
                  ) : null}
                </div>
                <ol className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
                  {storyGuide.beats.map((beat, index) => (
                    <li key={beat} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 py-4">
                      <span className="text-[13px] font-bold text-[#084734]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[14px] leading-6 text-[#31302E]">
                        {beat}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          ) : null}

          {pdfGuide ? (
            <section className="mt-8 border border-black/[0.08] bg-white p-6 md:p-8">
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-[#111110]">
                PDF를 이렇게 사용하세요
              </h2>
              <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[#615D59]">
                {pdfGuide.expertNote}
              </p>
              <div className="mt-7 grid gap-6 lg:grid-cols-3">
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
                    언제 유용한가
                  </p>
                  <ul className="mt-3 space-y-3">
                    {pdfGuide.bestUsedWhen.map((item) => (
                      <li key={item} className="border-l border-black/[0.08] pl-3 text-[14px] leading-6 text-[#615D59]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
                    사용 순서
                  </p>
                  <ol className="mt-3 space-y-3">
                    {pdfGuide.howToUse.map((item, index) => (
                      <li key={item} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 text-[14px] leading-6 text-[#615D59]">
                        <span className="font-bold text-[#111110]">{index + 1}</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
                    상담에서 확인할 질문
                  </p>
                  <ul className="mt-3 space-y-3">
                    {pdfGuide.discussionPrompts.map((item) => (
                      <li key={item} className="text-[14px] leading-6 text-[#615D59]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          ) : null}

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <section className="border border-black/[0.08] bg-white p-6">
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

            <section className="border border-black/[0.08] bg-white p-6">
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

          <section
            id="resource-checklist"
            className="mt-8 scroll-mt-28 border border-black/[0.08] bg-white p-6 md:p-8"
          >
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
              전체 문항
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              전체 점검 문항
            </h2>
            <div className="mt-3 max-w-3xl space-y-2 text-[14px] leading-7 text-[#615D59]">
              <p>
                각 문항은 지금 기준이 분명하면 1점, 아직 확인이 필요하면 0점으로 표시하세요.
                0점은 부족하다는 뜻이 아니라 상담과 데모에서 확인해야 할 질문이 남아 있다는
                뜻입니다.
              </p>
              <p>
                총점 자체보다 낮게 나온 영역을 보세요. 그 영역이 우리 학원이 먼저 확인해야 할
                운영 리스크이고, ClassIn 상담에서 가장 먼저 검증해야 할 장면입니다.
              </p>
            </div>

            <div className="mt-8 space-y-8">
              {magnet.sections.map((section, sectionIndex) => (
                <div key={section.title}>
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 border-l-2 border-[#084734] pl-2 pt-0.5 text-sm font-bold text-[#084734]">
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
            <section className="border border-black/[0.08] bg-white p-6 md:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                점수 해석
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
              <section className="border border-black/[0.08] bg-[#F6F5F4] p-6">
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
            <section className="mt-8 border border-black/[0.08] bg-white p-6 md:p-8">
              <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
                참고 링크
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
                    className="group border border-black/[0.08] p-4 transition-colors hover:bg-[#F6F5F4]"
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

          {relatedMagnets.length > 0 || pdfGuide?.consultationCtas?.length ? (
            <section className="mt-8 border border-black/[0.08] bg-white p-6 md:p-8">
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-[#111110]">
                다음에 함께 보면 좋은 자료
              </h2>
              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {relatedMagnets.map((item) => (
                  <TrackedLink
                    key={item.slug}
                    href={`/resources/${item.slug}#download`}
                    ctaId="resource_related_magnet"
                    tracking={{
                      source: "resource_related",
                      lead_magnet: magnet.slug,
                      destination: item.slug,
                    }}
                    className="group border border-black/[0.08] p-4 transition-colors hover:border-[#084734]/25"
                  >
                    <span className="block text-sm font-bold text-[#111110] group-hover:text-[#084734]">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-[13px] leading-6 text-[#615D59]">
                      {item.pdfGuide?.outcome ?? item.summary}
                    </span>
                  </TrackedLink>
                ))}
                {pdfGuide?.consultationCtas.map((cta) => (
                  <TrackedLink
                    key={`${cta.label}-${cta.href}`}
                    href={cta.href}
                    ctaId="resource_pdf_consultation_cta"
                    tracking={{
                      source: "resource_pdf_cta",
                      lead_magnet: magnet.slug,
                      destination: cta.href,
                    }}
                    className="group border border-[#084734]/20 bg-[#084734] p-4 text-white transition-colors hover:bg-[#065c41]"
                  >
                    <span className="block text-sm font-bold">
                      {cta.label}
                    </span>
                    {cta.description ? (
                      <span className="mt-1 block text-[13px] leading-6 text-white/70">
                        {cta.description}
                      </span>
                    ) : null}
                  </TrackedLink>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-8 border border-black/[0.08] bg-white p-6 md:p-8">
            <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#084734]/60">
              실행 플랜
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-[#111110]">
              실행 플랜
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {magnet.actionPlan.map((step) => (
                <div key={step.day} className="border border-black/[0.08] bg-[#FAFAF8] p-5">
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
          <div className="mt-8 border border-black/[0.08] bg-[#111110] p-6 text-white md:p-10">
            <h2 className="text-[1.6rem] font-semibold tracking-[-0.03em] md:text-[2rem]">
              점검 결과를 상담 질문으로 바꿔 드릴까요?
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/60">
              체크리스트에서 낮게 나온 영역을 알려주시면 우리 학원 상황에 맞춰 쇼룸에서 볼
              장면, 데모 질문, 견적 확인 범위를 함께 정리해 드립니다.
            </p>
            <TrackedLink
              href="/contact#contact-form"
              ctaId="resource_detail_contact"
              tracking={{
                source: "resource_detail",
                lead_magnet: magnet.slug,
                gate: magnet.gate,
              }}
              className="mt-6 inline-flex items-center gap-2 rounded-[6px] bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
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
