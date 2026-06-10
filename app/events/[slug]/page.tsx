import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cache } from "react"
import { ArrowRight, Calendar, MapPin, Tag } from "lucide-react"
import BlogMarkdownRenderer from "@/components/blog/BlogMarkdownRenderer"
import { TrackedLink } from "@/components/TrackedLink"
import { sanitizePublicUrl } from "@/lib/safe-public-url"
import {
  getCachedPublicEventBySlug,
  listCachedPublicEventSlugs,
} from "@/lib/repositories/public-events"
import { JsonLd } from "@/components/seo/JsonLd"
import { createBreadcrumbJsonLd, createEventJsonLd, toAbsoluteUrl } from "@/lib/seo"

export const revalidate = 3600

interface EventDetailPageProps {
  params: Promise<{ slug: string }>
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

const readPublicEventBySlug = cache((slug: string) => getCachedPublicEventBySlug(slug))

function decodeEventSlugParam(slug: string): string {
  try {
    return decodeURIComponent(slug)
  } catch {
    return slug
  }
}

export async function generateStaticParams() {
  const slugs = await listCachedPublicEventSlugs()
  return slugs.map((slug) => ({ slug }))
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeEventSlugParam(rawSlug)
  const event = await readPublicEventBySlug(slug)
  if (!event) return { title: "행사를 찾을 수 없습니다" }
  const canonical = toAbsoluteUrl(`/events/${event.slug ?? slug}`)
  return {
    title: event.title,
    description: event.description ?? undefined,
    alternates: { canonical },
    openGraph: {
      title: event.title,
      description: event.description ?? undefined,
      url: canonical,
      ...(event.imageUrl ? { images: [{ url: event.imageUrl }] } : {}),
    },
  }
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { slug: rawSlug } = await params
  const slug = decodeEventSlugParam(rawSlug)
  const event = await readPublicEventBySlug(slug)

  if (!event) notFound()
  const defaultEventCtaHref = `/contact?source=event&event=${encodeURIComponent(
    event.slug ?? event.id
  )}#contact-form`
  const sanitizedCtaHref = sanitizePublicUrl(event.ctaHref || defaultEventCtaHref, "")
  const ctaHref =
    sanitizedCtaHref === "/contact" || sanitizedCtaHref === "/contact#contact-form"
      ? defaultEventCtaHref
      : sanitizedCtaHref

  const eventPath = `/events/${event.slug ?? slug}`

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#111110]">
      <JsonLd
        data={[
          createEventJsonLd({
            path: eventPath,
            name: event.title,
            description: event.description ?? undefined,
            startDate: event.startsAt,
            endDate: event.endsAt ?? undefined,
            locationName: event.location ?? undefined,
            imageUrl: event.imageUrl ?? undefined,
          }),
          createBreadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "행사·프로모션", path: "/events" },
            { name: event.title, path: eventPath },
          ]),
        ]}
      />
      {/* Header */}
      <section className="px-4 pb-10 pt-28 sm:px-6 md:pt-40">
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

              <h1 className="max-w-2xl text-[2.05rem] font-bold leading-[1.1] tracking-[-0.04em] text-[#111110] sm:text-[2.2rem] md:text-[3.5rem]">
                {event.title}
              </h1>

              {event.description && (
                <p className="mt-5 max-w-xl text-[16px] leading-7 text-[#1a1a1a]/55 md:text-[17px] md:leading-8">
                  {event.description}
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-[#1a1a1a]/40">
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

              {ctaHref && event.status !== "마감" ? (
                <TrackedLink
                  href={ctaHref}
                  ctaId="event_detail_hero_cta"
                  tracking={{ event_slug: event.slug, event_id: event.id }}
                  className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#111110] px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  {event.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </TrackedLink>
              ) : event.status === "마감" ? (
                <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#f0f0ec] px-6 py-3 text-[14px] font-semibold text-[#1a1a1a]/40">
                  마감되었습니다
                </span>
              ) : null}
            </div>

            {event.imageUrl && (
              <div className="overflow-hidden rounded-[22px] border border-[#e8e8e4] bg-white shadow-sm md:rounded-[28px]">
                <div className="relative aspect-[4/5] overflow-hidden bg-[#f7f7f4]">
                  <Image
                    src={event.imageUrl}
                    alt={event.title}
                    fill
                    className="object-contain p-3 sm:p-4"
                    sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw"
                    priority
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 pb-20 sm:px-6 md:pb-24">
        <div className="mx-auto max-w-[1100px]">
          {event.contentMarkdown && (
            <div className="rounded-[24px] border border-[#e8e8e4] bg-white px-5 py-7 shadow-sm md:rounded-[36px] md:px-10 md:py-12">
              <BlogMarkdownRenderer markdown={event.contentMarkdown} />
            </div>
          )}

          {ctaHref && event.status !== "마감" && (
            <div className="mt-8 overflow-hidden rounded-[24px] bg-[#111110] p-6 text-white shadow-sm md:rounded-[32px] md:p-10">
              <p className="text-[12px] font-medium uppercase tracking-[0.24em] text-white/35">
                {event.category}
              </p>
              <h2 className="mt-3 text-[1.8rem] font-semibold tracking-[-0.03em] text-white">
                {event.title}
              </h2>
              <div className="mt-6">
                <TrackedLink
                  href={ctaHref}
                  ctaId="event_detail_bottom_cta"
                  tracking={{ event_slug: event.slug, event_id: event.id }}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-[#111110] transition-transform hover:-translate-y-0.5"
                >
                  {event.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </TrackedLink>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
