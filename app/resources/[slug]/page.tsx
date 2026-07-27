import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
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

// 콘텐츠 밴드: 흰색 ↔ 웜(#F6F5F4)을 번갈아 깔아 리듬을 만든다.
const WARM_BAND = "border-t border-black/[0.06] bg-[#F6F5F4]"
const WHITE_BAND = "bg-white"
const BAND_INNER = "mx-auto max-w-[1120px] px-5 py-14 sm:px-8 md:py-20"
const BAND_EYEBROW = "text-[13px] font-bold tracking-[0.02em] text-[#084734]"
const BAND_TITLE =
  "mt-3 text-[1.9rem] font-bold tracking-[-0.03em] text-[#111110]"

function addContactAttribution(href: string, leadMagnet: string) {
  if (!href.startsWith("/contact")) return href

  const [pathAndSearch, hash = ""] = href.split("#", 2)
  const [path, search = ""] = pathAndSearch.split("?", 2)
  const params = new URLSearchParams(search)
  params.set("topic", params.get("topic") || "도입 상담")
  params.set("lead_magnet", leadMagnet)

  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`
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
  const expertVoice = magnet.expertVoice
  const worksheet = magnet.worksheet
  const caseCards = magnet.caseCards
  const scriptSamples = magnet.scriptSamples
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

  const heroStats = [
    { k: "문항", v: `${itemCount}` },
    { k: "소요", v: `${magnet.estimatedMinutes}분` },
    { k: "형식", v: "PDF" },
    { k: "분류", v: getLeadMagnetCategoryLabel(magnet.category) },
  ]

  // ── 콘텐츠 밴드 (체크리스트 센터피스 다음, 흰/웜 교차) ────────────
  const storyBand = storyGuide ? (
    <div>
      <p className={BAND_EYEBROW}>{storyGuide.eyebrow}</p>
      <div className="mt-3 grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
        <div>
          <h2 className="text-2xl font-bold leading-tight tracking-[-0.02em] text-[#111110]">
            {storyGuide.title}
          </h2>
          <p className="mt-4 text-[15px] leading-7 text-[#615D59]">{storyGuide.body}</p>
          {storyGuide.takeaway ? (
            <p className="mt-5 border-l-2 border-[#084734] bg-white px-4 py-3 text-[14px] font-semibold leading-7 text-[#31302E]">
              {storyGuide.takeaway}
            </p>
          ) : null}
        </div>
        <ol className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
          {storyGuide.beats.map((beat, index) => (
            <li key={beat} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3 py-4">
              <span className="text-[13px] font-bold tabular-nums text-[#084734]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-[14px] leading-6 text-[#31302E]">{beat}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  ) : null

  const scoreBand = (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-14">
      <div>
        <h2 className={BAND_TITLE.replace("mt-3 ", "")}>점수 해석</h2>
        <p className="mt-3 text-[14px] leading-7 text-[#615D59]">
          총점보다 낮게 나온 구간을 보세요. 그 영역이 먼저 손볼 운영 병목입니다.
        </p>
        <div className="mt-7 space-y-px overflow-hidden rounded-[10px] border border-black/[0.08]">
          {magnet.scoreBands.map((band, i) => (
            <div
              key={band.range}
              className={`grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-4 px-5 py-4 ${
                i === magnet.scoreBands.length - 1 ? "bg-[#ECFDF5]/60" : "bg-white"
              }`}
            >
              <span className="text-[13px] font-bold tabular-nums text-[#084734]">
                {band.range}
              </span>
              <div>
                <p className="text-[15px] font-bold text-[#111110]">{band.label}</p>
                <p className="mt-0.5 text-[13px] leading-6 text-[#615D59]">{band.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {magnet.redFlags && magnet.redFlags.length > 0 ? (
        <aside className="lg:pt-16">
          <div className="rounded-[10px] border border-[#E7D9C9] bg-[#FAF6F0] p-5">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#B85C33]">
              <AlertTriangle className="h-3.5 w-3.5" />
              재검토 신호
            </div>
            <ul className="mt-4 space-y-3">
              {magnet.redFlags.map((item) => (
                <li key={item} className="text-[13px] leading-6 text-[#615D59]">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      ) : null}
    </div>
  )

  const usageBand = pdfGuide ? (
    <div>
      <div className="max-w-2xl">
        <p className={BAND_EYEBROW}>받은 다음</p>
        <h2 className={BAND_TITLE}>PDF를 이렇게 사용하세요</h2>
        <p className="mt-4 text-[15px] leading-7 text-[#615D59]">{pdfGuide.expertNote}</p>
      </div>
      <div className="mt-10 grid gap-x-12 gap-y-8 md:grid-cols-3">
        {[
          { t: "언제 유용한가", items: pdfGuide.bestUsedWhen, ordered: false },
          { t: "사용 순서", items: pdfGuide.howToUse, ordered: true },
          { t: "상담 질문", items: pdfGuide.discussionPrompts, ordered: false },
        ].map((col) => (
          <div key={col.t}>
            <p className="border-b border-black/[0.08] pb-3 text-[13px] font-bold tracking-[0.02em] text-[#111110]">
              {col.t}
            </p>
            <ul className="mt-4 space-y-4">
              {col.items.map((item, i) => (
                <li key={item} className="flex gap-3 text-[14px] leading-6 text-[#615D59]">
                  {col.ordered ? (
                    <span className="text-[13px] font-bold tabular-nums text-[#084734]">
                      {i + 1}
                    </span>
                  ) : (
                    <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[#084734]" />
                  )}
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  ) : null

  const caseBand =
    caseCards && caseCards.length > 0 ? (
      <div>
        <p className={BAND_EYEBROW}>도입 사례</p>
        <h2 className={BAND_TITLE}>우리와 비슷한 학원은 이렇게 바뀌었습니다</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {caseCards.map((card) => (
            <div
              key={card.label}
              className="rounded-[10px] border border-black/[0.08] bg-white p-5"
            >
              <p className="text-sm font-bold text-[#111110]">{card.label}</p>
              <p className="mt-0.5 text-[12px] text-[#A39E98]">{card.profile}</p>
              <p className="mt-3 text-[13px] leading-6 text-[#615D59]">
                <span className="font-semibold text-[#31302E]">고민 </span>
                {card.challenge}
              </p>
              <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
                <span className="font-semibold text-[#084734]">변화 </span>
                {card.change}
              </p>
              {card.quote ? (
                <p className="mt-3 border-l-2 border-[#084734]/25 pl-3 text-[13px] italic leading-6 text-[#31302E]">
                  {card.quote}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12px] leading-6 text-[#A39E98]">
          운영 변화 중심의 익명 사례입니다. 우리 학원과 조건이 가장 가까운 사례는 상담에서 더
          구체적으로 안내해 드립니다.
        </p>
      </div>
    ) : null

  const scriptBand =
    scriptSamples && scriptSamples.length > 0 ? (
      <div>
        <p className={BAND_EYEBROW}>복사해서 쓰는 멘트</p>
        <h2 className={BAND_TITLE}>상황별 메시지 예시</h2>
        <div className="mt-8 space-y-4">
          {scriptSamples.map((sample) => (
            <div
              key={sample.scenario}
              className="rounded-[10px] border border-black/[0.08] bg-white p-5"
            >
              <p className="text-sm font-bold text-[#111110]">{sample.scenario}</p>
              <div className="mt-3 border-l-2 border-[#084734] bg-[#ECFDF5]/50 p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#084734]">
                  권장
                </p>
                <p className="mt-1 text-[13px] leading-6 text-[#31302E]">{sample.good}</p>
              </div>
              {sample.avoid ? (
                <div className="mt-2 border-l-2 border-[#B85C33] bg-[#FAF6F0] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#B85C33]">
                    피하기
                  </p>
                  <p className="mt-1 text-[13px] leading-6 text-[#615D59]">{sample.avoid}</p>
                </div>
              ) : null}
              {sample.why ? (
                <p className="mt-2 text-[12px] leading-6 text-[#A39E98]">{sample.why}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    ) : null

  const expertBand = expertVoice ? (
    <div>
      <p className={BAND_EYEBROW}>현장 한마디</p>
      <blockquote className="mt-4 max-w-3xl border-l-2 border-[#084734]/30 pl-5 text-[17px] leading-8 text-[#31302E] md:text-[19px]">
        {expertVoice.comment}
      </blockquote>
      <p className="mt-4 text-[13px] font-semibold text-[#615D59]">
        — {expertVoice.speaker}
        {expertVoice.role ? (
          <span className="font-normal text-[#A39E98]">, {expertVoice.role}</span>
        ) : null}
      </p>
    </div>
  ) : null

  const worksheetBand = worksheet ? (
    <div>
      <p className={BAND_EYEBROW}>직접 채우는 표</p>
      <h2 className={BAND_TITLE}>{worksheet.title}</h2>
      {worksheet.intro ? (
        <p className="mt-3 max-w-3xl text-[14px] leading-7 text-[#615D59]">{worksheet.intro}</p>
      ) : null}
      <div className="mt-7 overflow-x-auto rounded-[10px] border border-black/[0.08] bg-white">
        <table className="w-full min-w-[520px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-black/[0.12]">
              <th className="px-4 py-3 text-left font-bold text-[#111110]">항목</th>
              {worksheet.columns.map((col) => (
                <th key={col} className="px-3 py-3 text-left font-bold text-[#084734]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {worksheet.rows.map((row) => (
              <tr
                key={row.label}
                className={`border-b border-black/[0.08] ${
                  row.highlight ? "bg-[#F6F5F4] font-bold" : ""
                }`}
              >
                <td className="px-4 py-3 align-top text-[#31302E]">
                  {row.label}
                  {row.hint ? (
                    <span className="ml-1 text-[12px] text-[#A39E98]">({row.hint})</span>
                  ) : null}
                </td>
                {worksheet.columns.map((col) => (
                  <td key={col} className="px-3 py-3">
                    <span className="block h-6 border-b border-dashed border-black/20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {worksheet.formula ? (
        <p className="mt-5 border-l-2 border-[#084734] pl-3 text-[13px] leading-7 text-[#31302E]">
          {worksheet.formula}
        </p>
      ) : null}
      {worksheet.note ? (
        <p className="mt-3 text-[13px] leading-6 text-[#615D59]">{worksheet.note}</p>
      ) : null}
    </div>
  ) : null

  const planBand = (
    <div>
      <div className="max-w-2xl">
        <p className={BAND_EYEBROW}>실행</p>
        <h2 className={BAND_TITLE}>7일 실행 플랜</h2>
      </div>
      <div className="mt-9 grid gap-px overflow-hidden rounded-[12px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2 lg:grid-cols-4">
        {magnet.actionPlan.map((step, i) => (
          <div key={step.day} className="bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#084734] text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-[#084734]">
                {step.day}
              </span>
            </div>
            <h3 className="mt-3 text-[15px] font-bold leading-6 text-[#111110]">{step.title}</h3>
            <ul className="mt-3 space-y-2">
              {step.tasks.map((task) => (
                <li key={task} className="flex gap-2 text-[12.5px] leading-5 text-[#615D59]">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#084734]/70" />
                  <span>{task}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )

  const linksBand =
    magnet.sourceLinks && magnet.sourceLinks.length > 0 ? (
      <div>
        <p className={BAND_EYEBROW}>참고 링크</p>
        <h2 className={BAND_TITLE}>더 확인할 링크</h2>
        <div className="mt-6 grid gap-3">
          {magnet.sourceLinks.map((link) => (
            <TrackedLink
              key={`${link.label}-${link.href}`}
              href={addContactAttribution(link.href, magnet.slug)}
              ctaId="resource_reference_link"
              tracking={{
                source: "resource_reference",
                lead_magnet: magnet.slug,
                gate: magnet.gate,
                destination: link.href,
              }}
              className="group rounded-[10px] border border-black/[0.08] bg-white p-4 transition-colors hover:border-[#084734]/25"
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
      </div>
    ) : null

  const relatedBand =
    relatedMagnets.length > 0 || pdfGuide?.consultationCtas?.length ? (
      <div>
        <h2 className={BAND_TITLE.replace("mt-3 ", "")}>다음에 함께 보면 좋은 자료</h2>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
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
              className="group rounded-[10px] border border-black/[0.08] bg-white p-4 transition-colors hover:border-[#084734]/25"
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
              href={addContactAttribution(cta.href, magnet.slug)}
              ctaId="resource_pdf_consultation_cta"
              tracking={{
                source: "resource_pdf_cta",
                lead_magnet: magnet.slug,
                destination: cta.href,
              }}
              className="group rounded-[10px] border border-[#084734]/20 bg-[#084734] p-4 text-white transition-colors hover:bg-[#065c41]"
            >
              <span className="block text-sm font-bold">{cta.label}</span>
              {cta.description ? (
                <span className="mt-1 block text-[13px] leading-6 text-white/70">
                  {cta.description}
                </span>
              ) : null}
            </TrackedLink>
          ))}
        </div>
      </div>
    ) : null

  const restBands = [
    storyBand,
    worksheetBand,
    scoreBand,
    usageBand,
    caseBand,
    scriptBand,
    expertBand,
    planBand,
    linksBand,
    relatedBand,
  ].filter(Boolean)

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <ResourceViewTracker leadMagnet={magnet} />

      {/* ── HERO (warm) ─────────────────────────────────── */}
      <section className="border-b border-black/[0.08] bg-[#F6F5F4]">
        <div className="mx-auto max-w-[1120px] px-5 pb-14 pt-28 sm:px-8 md:pt-32">
          <Link
            href="/resources"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            자료실로 돌아가기
          </Link>

          {/* 좌(설명)·우(정보 입력) 높이를 한 섹션 높이로 맞춘다. 폼이 넘치면 폼 안에서 스크롤. */}
          <div className="grid gap-10 lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_384px] lg:gap-14">
            <div className="flex max-w-2xl flex-col">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-[#ECFDF5] px-3 py-1 text-[12px] font-semibold tracking-[0.01em] text-[#084734]">
                  {getLeadMagnetCategoryLabel(magnet.category)} · {getLeadMagnetTierLabel(magnet.tier)}
                </span>
                <span className="text-[12px] font-semibold text-[#A39E98]">
                  무료 · {getLeadMagnetPublicGateLabel(magnet.gate)}
                </span>
              </div>

              <h1 className="mt-5 text-[2.35rem] font-bold leading-[1.06] tracking-[-0.035em] text-[#111110] md:text-[3.1rem]">
                {magnet.title}
              </h1>
              <p className="mt-5 max-w-xl text-[17px] leading-8 text-[#615D59] break-keep md:text-[19px]">
                {pdfGuide?.outcome ?? magnet.summary}
              </p>

              <dl className="mt-9 grid max-w-lg grid-cols-4 divide-x divide-black/[0.08] border-y border-black/[0.08]">
                {heroStats.map((s) => (
                  <div key={s.k} className="px-3 py-3 first:pl-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A39E98]">
                      {s.k}
                    </dt>
                    <dd className="mt-1 text-[19px] font-bold tracking-[-0.02em] text-[#111110]">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="mt-8 text-[13px] leading-6 text-[#A39E98] lg:mt-auto lg:pt-8">
                추천 대상 · {magnet.audience}
              </p>
            </div>

            <ResourceDownloadForm resource={downloadResource} />
          </div>
        </div>
      </section>

      {/* ── WHAT'S INSIDE (green accent strip) ──────────── */}
      <section className="border-b border-black/[0.08] bg-[#ECFDF5]/50">
        <div className="mx-auto max-w-[1120px] px-5 py-10 sm:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
            <div className="shrink-0 lg:w-52">
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#084734]">
                이 PDF에 담긴 것
              </p>
              <p className="mt-2 text-[13px] leading-6 text-[#615D59]">{magnet.formatLabel}</p>
            </div>
            <ul className="grid flex-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {magnet.deliverables.map((item) => (
                <li key={item} className="flex gap-2.5 text-[14px] leading-6 text-[#31302E]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#084734]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── CENTERPIECE — checklist (white) ─────────────── */}
      <section
        id="resource-checklist"
        className="scroll-mt-24 border-b border-black/[0.06] bg-white"
      >
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 md:py-20">
          <div className="max-w-2xl">
            <p className={BAND_EYEBROW}>진단 문항</p>
            <h2 className="mt-3 text-[2rem] font-bold tracking-[-0.03em] text-[#111110] md:text-[2.4rem]">
              전체 점검 문항
            </h2>
            <div className="mt-4 space-y-3 text-[15px] leading-7 text-[#615D59]">
              <p>
                각 문항은 현재 상태가 안정적이면 1점, 불안정하거나 확인이 필요하면 0점으로
                표시하세요. 애매한 항목은 억지로 긍정 처리하지 않는 편이 좋습니다.
              </p>
              <p>
                총점보다 <span className="font-semibold text-[#31302E]">낮게 나온 영역</span>을 보세요.
                그 영역이 먼저 손볼 운영 병목이고, ClassIn 상담에서 가장 먼저 검증해야 할 장면입니다.
              </p>
            </div>
          </div>

          <div className="mt-12 space-y-12">
            {magnet.sections.map((section, sectionIndex) => (
              <div
                key={section.title}
                className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-12"
              >
                <div className="lg:sticky lg:top-24 lg:self-start">
                  <div className="flex items-baseline gap-3">
                    <span className="text-[13px] font-bold tabular-nums text-[#084734]">
                      {String(sectionIndex + 1).padStart(2, "0")}
                    </span>
                    <div className="h-px flex-1 bg-black/[0.08]" />
                  </div>
                  <h3 className="mt-3 text-[20px] font-bold leading-tight tracking-[-0.02em] text-[#111110]">
                    {section.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#615D59]">
                    {section.description}
                  </p>
                </div>
                <ol className="divide-y divide-black/[0.06] border-t border-black/[0.08]">
                  {section.items.map((item, itemIndex) => (
                    <li key={item} className="flex items-start gap-4 py-4">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-black/[0.12] text-[10px] font-bold tabular-nums text-[#A39E98]">
                        {itemIndex + 1}
                      </span>
                      <p className="text-[15px] leading-7 text-[#31302E]">{item}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ALTERNATING CONTENT BANDS ───────────────────── */}
      {restBands.map((band, index) => (
        <section key={index} className={index % 2 === 0 ? WARM_BAND : WHITE_BAND}>
          <div className={BAND_INNER}>{band}</div>
        </section>
      ))}

      {/* ── CLOSER CTA (dark) ───────────────────────────── */}
      <section className="bg-[#111110] text-white">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 md:py-24">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center lg:gap-16">
            <div>
              <h2 className="text-[1.7rem] font-semibold tracking-[-0.03em] md:text-[2.2rem]">
                점검 결과를 상담 질문으로 바꿔 드릴까요?
              </h2>
              <p className="mt-4 max-w-xl text-[15px] leading-7 text-white/55">
                낮게 나온 영역을 알려주시면 우리 학원 상황에 맞춰 쇼룸에서 볼 장면, 데모 질문,
                견적 확인 범위를 함께 정리해 드립니다.
              </p>
              <TrackedLink
                href={addContactAttribution("/contact#contact-form", magnet.slug)}
                ctaId="resource_detail_contact"
                tracking={{
                  source: "resource_detail",
                  lead_magnet: magnet.slug,
                  gate: magnet.gate,
                }}
                className="mt-8 inline-flex items-center gap-2 rounded-[6px] bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
              >
                무료 상담 신청하기
                <ArrowRight className="h-4 w-4" />
              </TrackedLink>
            </div>

            <div className="rounded-[12px] border border-white/12 bg-white/[0.04] p-6">
              <div className="flex items-center gap-2 text-[13px] font-bold text-white">
                <CalendarDays className="h-4 w-4 text-[#6EE7B7]" />
                상담 전 준비물
              </div>
              <ul className="mt-4 space-y-2.5">
                {magnet.consultationPrep.map((item) => (
                  <li key={item} className="flex gap-2 text-[13px] leading-6 text-white/60">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#6EE7B7]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
