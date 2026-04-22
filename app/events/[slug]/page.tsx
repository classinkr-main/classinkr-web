import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Calendar, MapPin, Tag } from "lucide-react"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { getPublicEventBySlug } from "@/lib/repositories/public-events"

export const dynamic = "force-dynamic"

interface EventDetailPageProps {
  params: Promise<{ slug: string }>
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)
  if (!event) return { title: "행사를 찾을 수 없습니다" }
  return {
    title: event.title,
    description: event.description ?? undefined,
    openGraph: {
      title: event.title,
      description: event.description ?? undefined,
      ...(event.imageUrl ? { images: [{ url: event.imageUrl }] } : {}),
    },
  }
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { slug } = await params
  const event = await getPublicEventBySlug(slug)

  if (!event) notFound()

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      {/* Header */}
      <section className="px-6 pb-10 pt-32 md:pt-40">
        <div className="mx-auto max-w-[1100px]">
          <Link
            href="/events"
            className="mb-8 inline-flex items-center gap-2 text-sm text-[#1a1a1a]/45 transition-colors hover:text-[#084734]"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            행사·프로모션으로 돌아가기
          </Link>

          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-[#111110] px-3 py-1 font-medium text-white">
                  {event.category}
                </span>
                {event.tag && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                    <Tag className="h-3 w-3" />
                    {event.tag}
                  </span>
                )}
              </div>

              <h1 className="max-w-2xl text-[2.2rem] font-bold leading-[1.1] tracking-[-0.04em] text-[#111110] md:text-[3.5rem]">
                {event.title}
              </h1>

              {event.description && (
                <p className="mt-5 max-w-xl text-[17px] leading-8 text-[#1a1a1a]/55">
                  {event.description}
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4 text-[13px] text-[#1a1a1a]/40">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {formatKoreanDate(event.startsAt)}
                  {event.endsAt ? ` ~ ${formatKoreanDate(event.endsAt)}` : ""}
                </span>
                {event.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </span>
                )}
              </div>

              {event.ctaHref && event.status !== "마감" && (
                <Link
                  href={event.ctaHref}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#111110] px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  {event.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            {event.imageUrl && (
              <div className="overflow-hidden rounded-[28px] border border-[#e8e8e4] shadow-sm">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={event.imageUrl}
                    alt={event.title}
                    fill
                    className="object-cover"
                    priority
                    unoptimized
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      {event.contentMarkdown && (
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-[1100px]">
            <div className="rounded-[36px] border border-[#e8e8e4] bg-white px-6 py-8 shadow-sm md:px-10 md:py-12">
              <BlogMarkdownRenderer markdown={event.contentMarkdown} />
            </div>

            {event.ctaHref && event.status !== "마감" && (
              <div className="mt-8 overflow-hidden rounded-[32px] bg-[#111110] p-8 text-white shadow-sm md:p-10">
                <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">
                  {event.category}
                </p>
                <h2 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.03em] text-white">
                  {event.title}
                </h2>
                <div className="mt-6">
                  <Link
                    href={event.ctaHref}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
                  >
                    {event.ctaLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
