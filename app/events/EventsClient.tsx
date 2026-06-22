"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, MapPin, Tag, ArrowRight, Search, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"
import { formatPublicEventDate } from "@/lib/public-event-dates"

const CATEGORIES = ["전체", "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"] as const
const EVENTS_CONTACT_HREF = `/contact?topic=${encodeURIComponent("도입 상담")}&prefill=${encodeURIComponent("행사/프로모션 관련 문의입니다.")}#contact-form`
const LOCATION_SEARCH_ALIASES = [
  ["busan", "부산"],
  ["gwangju", "광주"],
  ["gwang-ju", "광주"],
  ["seoul", "서울"],
  ["incheon", "인천"],
  ["daegu", "대구"],
  ["daejeon", "대전"],
] as const

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    "진행 중": "border-[#D1FAE5] bg-[#ECFDF5] text-[#084734]",
    "예정": "border-[#D1FAE5] bg-white text-[#084734]",
    "마감": "border-black/[0.08] bg-[#F6F5F4] text-[#615D59]",
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

function getEventSearchText(event: PublicEvent) {
  const baseText = [
    event.title,
    event.description ?? "",
    event.category,
    event.tag ?? "",
    event.location ?? "",
    event.status,
  ].join(" ")
  const lowerBaseText = baseText.toLowerCase()
  const aliases = LOCATION_SEARCH_ALIASES
    .filter(([english]) => lowerBaseText.includes(english))
    .map(([, korean]) => korean)

  return [baseText, ...aliases].join(" ").toLowerCase()
}

export default function EventsClient({ events }: { events: PublicEvent[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const normalizedQuery = searchQuery.trim().toLowerCase()

  const filtered = useMemo(() => {
    let list = activeCategory === "전체"
      ? events
      : events.filter((e) => e.category === activeCategory)
    if (normalizedQuery) {
      list = list.filter((event) => {
        return getEventSearchText(event).includes(normalizedQuery)
      })
    }
    return list
  }, [activeCategory, normalizedQuery, events])

  const highlighted = filtered.filter((e) => e.highlight)
  const featuredEvent = highlighted[0] ?? null
  const rest = featuredEvent ? filtered.filter((e) => e.id !== featuredEvent.id) : filtered
  const isAnyHovered = hoveredId !== null

  const activeCount = events.filter((e) => e.status === "진행 중").length
  const upcomingCount = events.filter((e) => e.status === "예정").length
  const hasActiveFilters = activeCategory !== "전체" || normalizedQuery.length > 0
  const resetFilters = () => {
    setActiveCategory("전체")
    setSearchQuery("")
    setHoveredId(null)
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-emerald-100 selection:text-emerald-900">

      {/* Hero */}
      <section className="relative px-4 pb-6 pt-28 sm:px-6 md:pt-40">
        <div className="max-w-[1100px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-8 lg:gap-12 items-center">

            {/* Left */}
            <div>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="text-[13px] font-medium text-[#1a1a1a]/35 tracking-wide uppercase mb-5"
              >
                Events &amp; Promotions
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.05 }}
                className="mb-5 text-[2.3rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#111110] md:text-[3.5rem] lg:text-[4rem]"
              >
                행사 &amp;<br />프로모션
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mb-8 max-w-sm text-[15px] leading-relaxed text-[#1a1a1a]/45 md:text-[16px]"
              >
                클래스인의 최신 이벤트, 웨비나, 특가 프로모션을 한눈에 확인하세요.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[#1a1a1a]/30"
              >
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  진행 중 {activeCount}건
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#084734]" />
                  예정 {upcomingCount}건
                </span>
              </motion.div>
            </div>

            {/* Right: Featured */}
            {featuredEvent && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                {(() => {
                  const event = featuredEvent
                  const heroHref = event.slug ? `/events/${event.slug}` : null
                  return (
                    <div className="relative min-h-[300px] overflow-hidden rounded-2xl bg-[#08231d] text-white sm:min-h-[340px] md:min-h-[400px]">
                      {event.imageUrl ? (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-br from-[#08231d] via-[#0d3a2e] to-[#111110]" />
                          <Image
                            src={event.imageUrl}
                            alt={event.title}
                            fill
                            className="object-contain p-4 drop-shadow-[0_18px_35px_rgba(0,0,0,0.35)] sm:p-6"
                            sizes="(min-width: 1024px) 560px, 100vw"
                            loading="eager"
                          />
                        </>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-[#084734]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                      <div className="relative z-10 flex h-full min-h-[300px] flex-col p-6 sm:min-h-[340px] md:min-h-[400px] md:p-10">
                        <div className="flex items-center gap-2.5 mb-auto">
                          <StatusBadge status={event.status} />
                        </div>
                        <div className="mt-auto">
                          <span className="text-[11px] text-white/40 uppercase tracking-wider mb-2 block">
                            {event.category}
                          </span>
                          <h2 className="text-2xl md:text-[1.75rem] font-bold leading-snug tracking-[-0.02em] mb-3">
                            {event.title}
                          </h2>
                          <p className="text-[13px] text-white/55 leading-relaxed mb-5 line-clamp-2">
                            {event.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-4 text-[12px] text-white/40 mb-6">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3.5 h-3.5" />
                              {formatPublicEventDate(event.startsAt)}
                              {event.endsAt ? ` ~ ${formatPublicEventDate(event.endsAt)}` : ""}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {heroHref && (
                            <Link
                              href={heroHref}
                              className="inline-flex items-center gap-2 bg-white text-[#111110] text-[13px] font-semibold px-6 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors duration-200 shadow-lg"
                            >
                              자세히 보기
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="mx-auto mb-2 mt-6 max-w-[1100px] px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
        >
          <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 no-scrollbar" role="group" aria-label="행사 카테고리 필터">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat
              return (
                <button
                  type="button"
                  key={cat}
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveCategory(cat)
                    setHoveredId(null)
                  }}
                  className={`min-h-11 shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8] ${
                    isActive
                      ? "bg-[#084734] text-white shadow-[0_6px_16px_rgba(8,71,52,0.14)]"
                      : "text-[#615D59] hover:bg-[#ECFDF5] hover:text-[#084734]"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
          <div className="relative w-full shrink-0 sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/20" />
            <input
              type="text"
              aria-label="행사와 프로모션 검색"
              placeholder="행사명, 지역, 상태 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-black/[0.08] bg-white/60 py-2 pl-9 pr-9 text-[13px] text-[#1a1a1a] transition-colors placeholder:text-[#A39E98] focus:border-[#084734]/45 focus:outline-none focus:ring-2 focus:ring-[#084734]/10 sm:w-64"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="행사 검색어 지우기"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[#A39E98] transition-colors hover:bg-[#F6F5F4] hover:text-[#084734] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        </motion.div>
        <div className="flex items-center justify-between pt-4 pb-2">
          <span className="text-[12px] text-[#1a1a1a]/30 font-medium">
            {normalizedQuery
              ? `검색 결과 ${filtered.length}개의 행사·프로모션`
              : `${activeCategory === "전체" ? "전체" : activeCategory} ${filtered.length}개의 행사·프로모션`}
          </span>
          <span className="text-[12px] text-[#1a1a1a]/25">{hasActiveFilters ? "필터 적용" : "최신순"}</span>
        </div>
      </section>

      {/* Event List */}
      <section className="mx-auto max-w-[1100px] px-4 pb-24 sm:px-6 md:pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory + searchQuery}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {rest.map((event, index) => {
              const detailHref = event.slug ? `/events/${event.slug}` : null
              const cardInner = (
                <article
                  className="grid grid-cols-1 gap-3 border-b border-[#ebebea] py-5 transition-opacity duration-300 md:grid-cols-[160px_1fr_180px] md:gap-8 md:py-6"
                  style={{
                    opacity: isAnyHovered ? (hoveredId === event.id ? 1 : 0.3) : 1,
                  }}
                >
                  <div className="flex md:flex-col gap-2 md:gap-2 md:pt-0.5">
                    <span className="text-[12px] font-medium text-[#1a1a1a]/40">{event.category}</span>
                    <StatusBadge status={event.status} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-[17px] md:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[#111110] group-hover:text-emerald-800 transition-colors duration-300">
                      {event.title}
                    </h2>
                    <p className="text-[13px] text-[#1a1a1a]/50 leading-relaxed line-clamp-2">
                      {event.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatPublicEventDate(event.startsAt)}
                        {event.endsAt ? ` ~ ${formatPublicEventDate(event.endsAt)}` : ""}
                      </span>
                      {event.location && (
                        <>
                          <span className="text-[#1a1a1a]/10">·</span>
                          <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {event.location}
                          </span>
                        </>
                      )}
                      {event.tag && (
                        <>
                          <span className="text-[#1a1a1a]/10">·</span>
                          <span className="text-[11px] text-emerald-600/70 font-medium flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            {event.tag}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {event.imageUrl ? (
                    <div className="relative w-full h-28 md:h-[110px] rounded-xl overflow-hidden bg-white ring-1 ring-[#e8e8e4] shrink-0 order-first md:order-last">
                      <Image
                        src={event.imageUrl}
                        alt={`${event.title} 포스터`}
                        fill
                        className="object-contain p-1.5"
                        sizes="(min-width: 768px) 180px, 100vw"
                      />
                    </div>
                  ) : (
                    <div className="hidden md:block" />
                  )}
                </article>
              )

              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {detailHref ? (
                    <Link href={detailHref} className="group block">
                      {cardInner}
                    </Link>
                  ) : (
                    cardInner
                  )}
                </motion.div>
              )
            })}
          </motion.div>
        </AnimatePresence>

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-28 text-center"
          >
            <div className="w-12 h-12 bg-[#f0f0ec] rounded-xl flex items-center justify-center mx-auto mb-4">
              <Search className="w-5 h-5 text-[#1a1a1a]/20" />
            </div>
            <h3 className="text-base font-semibold text-[#111110] mb-1">
              {events.length === 0 ? "현재 공개된 행사·프로모션이 없습니다" : "검색 결과가 없습니다"}
            </h3>
            <p className="text-[13px] text-[#1a1a1a]/45">
              {events.length === 0
                ? "새로운 웨비나와 프로모션은 준비되는 대로 안내하겠습니다."
                : "다른 키워드나 카테고리를 선택해 보세요."}
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-flex h-10 items-center justify-center rounded-[6px] bg-[#084734] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                >
                  전체 행사 보기
                </button>
              ) : null}
              {events.length === 0 ? (
                <Link
                  href={EVENTS_CONTACT_HREF}
                  className="inline-flex h-10 items-center justify-center rounded-[6px] border border-black/[0.08] bg-white px-4 text-sm font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF8]"
                >
                  행사 문의하기
                </Link>
              ) : null}
            </div>
          </motion.div>
        )}
      </section>
    </div>
  )
}
