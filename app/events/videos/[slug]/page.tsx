import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, CalendarDays, CheckCircle2, Clock, LockKeyhole, Sparkles, User } from "lucide-react"

import { JsonLd } from "@/components/seo/JsonLd"
import { SeminarCard } from "@/components/seminars/SeminarCard"
import { SeminarLockedPreview } from "@/components/seminars/SeminarLockedPreview"
import { SeminarPlayer } from "@/components/seminars/SeminarPlayer"
import { getPublicUserContext } from "@/lib/auth/public-user"
import {
  extractYoutubeId,
  getPublishedSeminars,
  getSeminarBySlug,
  isPlaceholderYoutube,
} from "@/lib/seminars/catalog"
import { createBreadcrumbJsonLd, createPublicMetadata } from "@/lib/seo"

export const dynamic = "force-dynamic"

interface EventVideoPageProps {
  params: Promise<{ slug: string }>
}

function formatPublishedAt(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, ".") : value
}

export function generateStaticParams() {
  return getPublishedSeminars().map((seminar) => ({ slug: seminar.slug }))
}

export async function generateMetadata({ params }: EventVideoPageProps): Promise<Metadata> {
  const { slug } = await params
  const seminar = getSeminarBySlug(slug)
  if (!seminar) {
    return { title: "행사 영상을 찾을 수 없습니다", robots: { index: false, follow: false } }
  }
  return createPublicMetadata({
    title: `${seminar.title} | 행사 영상`,
    description: seminar.description,
    path: `/events/videos/${seminar.slug}`,
  })
}

export default async function EventVideoPage({ params }: EventVideoPageProps) {
  const { slug } = await params
  const seminar = getSeminarBySlug(slug)

  if (!seminar) {
    notFound()
  }

  const userContext = await getPublicUserContext()
  const isMember = Boolean(userContext)
  const youtubeId = extractYoutubeId(seminar.youtube)
  const placeholder = isPlaceholderYoutube(seminar.youtube)
  const related = getPublishedSeminars()
    .filter((item) => item.slug !== seminar.slug)
    .slice(0, 3)

  return (
    <>
      <JsonLd
        data={createBreadcrumbJsonLd([
          { name: "홈", path: "/" },
          { name: "행사·프로모션", path: "/events" },
          { name: seminar.title, path: `/events/videos/${seminar.slug}` },
        ])}
      />
      <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
        <section className="px-4 pb-20 pt-28 sm:px-6 md:pt-36">
          <div className="mx-auto max-w-[920px]">
            <Link
              href="/events"
              className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              행사로 돌아가기
            </Link>

            <span
              className={
                isMember
                  ? "inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-3 py-1 text-[12px] font-semibold text-[#084734]"
                  : "inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1 text-[12px] font-semibold text-[#615D59]"
              }
            >
              {isMember ? <Sparkles className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
              {isMember ? "회원 시청 가능" : "회원 전용 영상"}
            </span>

            <h1 className="mt-4 text-[1.85rem] font-bold leading-[1.12] tracking-[-0.04em] text-[#111110] md:text-[2.4rem]">
              {seminar.title}
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#615D59] md:text-[17px]">
              {seminar.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-[#615D59]">
              {seminar.presenter ? (
                <span className="inline-flex items-center gap-1.5">
                  <User className="h-4 w-4 text-[#084734]/60" />
                  {seminar.presenter}
                </span>
              ) : null}
              {seminar.durationLabel ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-[#084734]/60" />
                  {seminar.durationLabel}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-[#084734]/60" />
                {formatPublishedAt(seminar.publishedAt)}
              </span>
            </div>

            <div className="mt-8">
              {isMember ? (
                <SeminarPlayer
                  slug={seminar.slug}
                  youtubeId={youtubeId}
                  title={seminar.title}
                  isPlaceholder={placeholder}
                />
              ) : (
                <SeminarLockedPreview
                  slug={seminar.slug}
                  title={seminar.title}
                  posterUrl={seminar.posterUrl}
                />
              )}
            </div>

            {seminar.highlights && seminar.highlights.length > 0 ? (
              <section className="mt-8 rounded-[16px] border border-black/[0.08] bg-white p-6 md:p-8">
                <h2 className="text-[18px] font-bold tracking-[-0.025em] text-[#111110]">
                  이 영상에서 다루는 내용
                </h2>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {seminar.highlights.map((item) => (
                    <li key={item} className="flex gap-2 text-[14px] leading-6 text-[#615D59]">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#084734]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {related.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-[18px] font-bold tracking-[-0.025em] text-[#111110]">
                  다른 행사 영상
                </h2>
                <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {related.map((item) => (
                    <SeminarCard key={item.slug} seminar={item} />
                  ))}
                </div>
              </section>
            ) : null}

            <div className="mt-10 overflow-hidden rounded-[16px] border border-black/[0.08] bg-[#111110] p-6 text-white md:p-10">
              <h2 className="text-[1.5rem] font-semibold tracking-[-0.03em] md:text-[1.9rem]">
                도입을 더 구체적으로 검토하고 싶다면
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/60">
                우리 학원 상황에 맞춰 쇼룸에서 볼 장면, 데모 질문, 견적 범위를 함께 정리해
                드립니다.
              </p>
              <Link
                href="/contact#contact-form"
                className="mt-6 inline-flex items-center gap-2 rounded-[6px] bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
              >
                무료 상담 신청하기
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
