"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Calendar, MapPin, Tag, ArrowRight, Search, ExternalLink } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import type { PublicEvent, EventStatus } from "@/lib/types/public-events"

const CATEGORIES = ["전체", "웨비나", "오프라인 행사", "프로모션", "얼리버드", "파트너십"] as const

function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}. ${String(d.getMonth() + 1).padStart(2, "0")}. ${String(d.getDate()).padStart(2, "0")}`
}

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    "진행 중": "text-emerald-600",
    "예정": "text-[#084734]",
    "마감": "text-[#1a1a1a]/30",
  }
  return (
    <span className={`text-[11px] font-semibold ${styles[status]}`}>
      {status}
    </span>
  )
}

export default function EventsClient({ events }: { events: PublicEvent[] }) {
  const [activeCategory, setActiveCategory] = useState("전체")
  const [searchQuery, setSearchQuery] = useState("")
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = activeCategory === "전체"
      ? events
      : events.filter((e) => e.category === activeCategory)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
      )
    }
    return list
  }, [activeCategory, searchQuery, events])

  const highlighted = filtered.filter((e) => e.highlight)
  const rest = filtered
  const isAnyHovered = hoveredId !== null

  const activeCount = events.filter((e) => e.status === "진행 중").length
  const upcomingCount = events.filter((e) => e.status === "예정").length

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1a1a1a] selection:bg-emerald-100 selection:text-emerald-900">

      {/* Hero */}
      <section className="relative pt-32 md:pt-40 pb-6 px-6">
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
                className="text-[2.5rem] md:text-[3.5rem] lg:text-[4rem] font-extrabold leading-[1.05] tracking-[-0.035em] text-[#111110] mb-5"
              >
                행사 &amp;<br />프로모션
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[15px] md:text-[16px] text-[#1a1a1a]/45 max-w-sm leading-relaxed mb-8"
              >
                클래스인의 최신 이벤트, 웨비나, 특가 프로모션을 한눈에 확인하세요.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                className="flex items-center gap-6 text-[13px] text-[#1a1a1a]/30"
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
            {highlighted.length > 0 && (
              <motion.div
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, delay: 0.15 }}
              >
                {(() => {
                  const event = highlighted[0]
                  return (
                    <div className="relative rounded-2xl overflow-hidden text-white min-h-[340px] md:min-h-[400px]">
                      {event.imageUrl ? (
                        <Image
                          src={event.imageUrl}
                          alt={event.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900 to-[#084734]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
                      <div className="relative z-10 p-8 md:p-10 flex flex-col h-full min-h-[340px] md:min-h-[400px]">
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
                              {formatKoreanDate(event.startsAt)}
                              {event.endsAt ? ` ~ ${formatKoreanDate(event.endsAt)}` : ""}
                            </span>
                            {event.location && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                {event.location}
                              </span>
                            )}
                          </div>
                          {event.ctaHref && (
                            <Link
                              href={event.ctaHref}
                              className="inline-flex items-center gap-2 bg-white text-[#111110] text-[13px] font-semibold px-6 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors duration-200 shadow-lg"
                            >
                              {event.ctaLabel}
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
      <section className="max-w-[1100px] mx-auto px-6 mt-6 mb-2">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-[#e8e8e4]"
        >
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-[#111110] text-white"
                      : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70 hover:bg-[#f0f0ec]"
                  }`}
                >
                  {cat}
                </button>
              )
            })}
          </div>
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#1a1a1a]/20" />
            <input
              type="text"
              placeholder="검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-52 pl-9 pr-3 py-2 bg-transparent border border-[#e8e8e4] rounded-lg text-[13px] text-[#1a1a1a] placeholder:text-[#1a1a1a]/25 focus:outline-none focus:border-[#1a1a1a]/20 transition-colors"
            />
          </div>
        </motion.div>
        <div className="flex items-center justify-between pt-4 pb-2">
          <span className="text-[12px] text-[#1a1a1a]/30 font-medium">
            {rest.length}개의 행사·프로모션
          </span>
          <span className="text-[12px] text-[#1a1a1a]/25">최신순</span>
        </div>
      </section>

      {/* Event List */}
      <section className="max-w-[1100px] mx-auto px-6 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory + searchQuery}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {rest.map((event, index) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.04, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <article
                  className="grid grid-cols-1 md:grid-cols-[160px_1fr_120px_160px] gap-4 md:gap-6 py-6 border-b border-[#ebebea] transition-opacity duration-300"
                  style={{
                    opacity: isAnyHovered ? (hoveredId === event.id ? 1 : 0.3) : 1,
                  }}
                  onMouseEnter={() => setHoveredId(event.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <div className="flex md:flex-col gap-2 md:gap-2 md:pt-0.5">
                    <span className="text-[12px] font-medium text-[#1a1a1a]/40">{event.category}</span>
                    <StatusBadge status={event.status} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <h2 className="text-[17px] md:text-[19px] font-semibold leading-snug tracking-[-0.015em] text-[#111110]">
                      {event.title}
                    </h2>
                    <p className="text-[13px] text-[#1a1a1a]/50 leading-relaxed line-clamp-2">
                      {event.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-[#1a1a1a]/30 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatKoreanDate(event.startsAt)}
                        {event.endsAt ? ` ~ ${formatKoreanDate(event.endsAt)}` : ""}
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
                    <div className="hidden md:block relative w-full h-[110px] rounded-xl overflow-hidden bg-[#f0f0ec] shrink-0">
                      <Image
                        src={event.imageUrl}
                        alt={`${event.title} 포스터`}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="hidden md:block" />
                  )}

                  <div className="flex md:flex-col md:items-end md:justify-center gap-3">
                    {event.ctaHref ? (
                      <Link
                        href={event.ctaHref}
                        className={`inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-lg transition-colors duration-200 ${
                          event.status === "마감"
                            ? "bg-[#f0f0ec] text-[#1a1a1a]/30 cursor-not-allowed pointer-events-none"
                            : "bg-[#111110] text-white hover:bg-emerald-700"
                        }`}
                      >
                        {event.ctaLabel}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </article>
              </motion.div>
            ))}
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
            <h3 className="text-base font-semibold text-[#111110] mb-1">검색 결과가 없습니다</h3>
            <p className="text-[13px] text-[#1a1a1a]/30">다른 키워드나 카테고리를 선택해 보세요.</p>
          </motion.div>
        )}
      </section>
    </div>
  )
}
