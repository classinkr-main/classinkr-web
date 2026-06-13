"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, useInView } from "framer-motion"
import { TrackedLink } from "@/components/TrackedLink"
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  Compass,
  Globe2,
  GraduationCap,
  Heart,
  MapPin,
  Newspaper,
  Sparkles,
  Telescope,
  Users,
} from "lucide-react"

/* ─── 타입 ────────────────────────────────────────────────── */

type Office = {
  id: string
  city: string
  cityEn: string
  country: string
  countryCode: string
  role: string
  description: string
  address: string
  highlight?: boolean
}

type PressItem = {
  id: string
  outlet: string
  headline: string
  date: string
  category: string
  url?: string
}

type RecentPost = {
  slug: string
  title: string
  excerpt: string
  category: string
  date: string
  imageUrl: string
  readTime: string
}

type Props = {
  offices: Office[]
  press: PressItem[]
  recentPosts: RecentPost[]
}

/* ─── 정적 데이터 ──────────────────────────────────────────── */

const STATS = [
  { value: "200억+", label: "누적 수업 횟수", icon: GraduationCap },
  { value: "5,000만+", label: "교사 · 학습자", icon: Users },
  { value: "8만+", label: "파트너 교육기관", icon: Award },
  { value: "160+", label: "서비스 국가", icon: Globe2 },
] as const

const TIMELINE = [
  {
    year: "2014",
    title: "창립",
    desc: "EEO(Education Everywhere Online) 설립. 모든 학생에게 양질의 교육을 제공한다는 하나의 믿음으로 시작했습니다.",
  },
  {
    year: "2016",
    title: "파일럿 런칭",
    desc: "중국 최대 교육기업 New Oriental, TAL과 파트너십을 맺고 클래스인 플랫폼의 첫 발걸음을 뗐습니다.",
  },
  {
    year: "2017",
    title: "정식 출시",
    desc: "서비스 출시 첫 해, 5,000개 이상의 교육기관이 클래스인을 선택했습니다.",
  },
  {
    year: "2018",
    title: "기술 투자",
    desc: "600명 이상의 개발자·엔지니어를 확보하며 플랫폼의 기술적 기반을 깊게 다졌습니다.",
  },
  {
    year: "2021",
    title: "글로벌 유니콘",
    desc: "Tencent·Hillhouse·SIG의 투자를 유치하며 300억 달러 가치의 유니콘 기업으로 도약, 공교육 시장까지 영역을 확장했습니다.",
  },
  {
    year: "현재",
    title: "세계와 연결된 교실",
    desc: "160개국, 8만 개 기관, 5,000만 명이 넘는 교사와 학습자가 클래스인으로 수업합니다.",
  },
]

const PILLARS = [
  {
    index: "01",
    eyebrow: "Vision",
    icon: Telescope,
    title: "교육이 있는 곳이라면\n어디든 클래스인이 있습니다",
    desc:
      "한 도시의 학원에서, 산간의 작은 교실에서, 국경 너머의 협업 수업에서 — 같은 수준의 가르침이 가능하도록.",
  },
  {
    index: "02",
    eyebrow: "Mission",
    icon: Compass,
    title: "어떻게 하면 모든 학생이\n좋은 수업을 받을 수 있을까?",
    desc:
      "이 단 하나의 질문이 EEO의 출발점이었습니다. 우리는 기술로 그 답을 만들고, 시스템으로 그 답을 지킵니다.",
  },
  {
    index: "03",
    eyebrow: "Values",
    icon: Heart,
    title: "교육의 평등 · 시스템화 · 교사",
    desc:
      "지역과 환경에 관계없이 모두에게. 개인의 능력 대신 반복 가능한 구조로. 그리고 교사가 가르치는 데 집중할 수 있도록.",
  },
] as const

const VALUE_DETAILS = [
  {
    title: "교육의 평등",
    desc: "지역·환경과 관계없이 모든 학습자가 최고의 수업을 받을 수 있어야 합니다. 클래스인은 그 가능성을 기술로 만듭니다.",
  },
  {
    title: "수업의 시스템화",
    desc: "훌륭한 수업이 특정 선생님의 개인기에 의존해서는 안 됩니다. 반복 가능하고 측정 가능한 교육의 구조를 만듭니다.",
  },
  {
    title: "교사를 위한 기술",
    desc: "기술은 교사를 대체하지 않습니다. 수업 준비·운영·관리의 부담을 줄여, 교사가 가르치는 일에 집중할 수 있게 합니다.",
  },
]

const PARTNERS = [
  "북경대학교",
  "싱가포르 국립대학(NUS)",
  "난양공과대학교",
  "Cornell University",
  "Australian National University",
  "Waseda University",
  "Oxford University Press",
  "Pearson",
  "Birkbeck University",
  "Acadsoc",
]

/* ─── 애니메이션 헬퍼 ────────────────────────────────────────── */

function FadeUp({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-60px" })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ─── 페이지 ─────────────────────────────────────────────────── */

export default function AboutPageClient({ offices, press, recentPosts }: Props) {
  return (
    <main className="bg-[#FAFAF8]">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-32 pb-28 px-6 bg-[#FAFAF8]">
        {/* 배경 비주얼 */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, #ECFDF5 0%, rgba(236,253,245,0) 70%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(8,71,52,0.08) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "radial-gradient(60% 60% at 50% 30%, #000 30%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(60% 60% at 50% 30%, #000 30%, transparent 80%)",
          }}
        />

        <div className="relative max-w-[940px] mx-auto text-center">
          <FadeUp>
            <motion.span
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="inline-flex items-center gap-1.5 bg-white text-[#084734] text-[12px] font-semibold tracking-[0.125px] px-3.5 py-1.5 rounded-full mb-7 border border-[rgba(8,71,52,0.12)]"
              style={{
                boxShadow:
                  "rgba(8,71,52,0.08) 0px 4px 18px, rgba(8,71,52,0.05) 0px 2px 7.8px",
              }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={2.5} />
              글로벌 EdTech 유니콘 · 160개국
            </motion.span>
          </FadeUp>

          <FadeUp delay={0.08}>
            <h1 className="text-[44px] sm:text-[58px] lg:text-[72px] font-bold text-[#111110] leading-[1.02] tracking-[-2.25px] mb-7">
              교육을 시스템으로,
              <br />
              <span className="text-[#084734]">세계를 교실로</span>
            </h1>
          </FadeUp>

          <FadeUp delay={0.16}>
            <p className="text-[18px] sm:text-[20px] text-[#615D59] leading-[1.6] max-w-[640px] mx-auto">
              2014년 설립 이래 EEO는 단 하나의 질문을 붙들고 있습니다.
              <br className="hidden sm:block" />{" "}
              <em className="not-italic font-semibold text-[#111110]">
                어떻게 하면 모든 학생이 좋은 수업을 받을 수 있을까?
              </em>
            </p>
          </FadeUp>

          <FadeUp delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5">
              {[
                "2014년 설립",
                "EEO Education Everywhere Online",
                "Tencent · Hillhouse 투자",
                "전 세계 6개 지사",
              ].map((tag) => (
                <span
                  key={tag}
                  className="text-[12px] font-medium text-[#615D59] bg-white border border-[rgba(0,0,0,0.06)] rounded-full px-3 py-1.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="relative px-6 -mt-6">
        <div className="max-w-[1200px] mx-auto">
          <div
            className="relative overflow-hidden rounded-[20px] px-6 sm:px-12 py-12 sm:py-14"
            style={{
              background:
                "linear-gradient(135deg, #084734 0%, #0a5a42 50%, #065c41 100%)",
            }}
          >
            <div
              aria-hidden
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />
            <div
              aria-hidden
              className="absolute -right-32 -top-32 w-[420px] h-[420px] rounded-full pointer-events-none"
              style={{
                background:
                  "radial-gradient(closest-side, rgba(110,231,183,0.18), transparent)",
              }}
            />

            <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-6 lg:divide-x lg:divide-white/15">
              {STATS.map((s, i) => {
                const Icon = s.icon
                return (
                  <FadeUp key={s.label} delay={i * 0.07}>
                    <div className="px-2 sm:px-6">
                      <Icon
                        className="w-5 h-5 text-[#6EE7B7] mb-3"
                        strokeWidth={2}
                      />
                      <div className="text-[40px] sm:text-[48px] font-bold text-white tracking-[-1.5px] leading-none mb-2">
                        {s.value}
                      </div>
                      <div className="text-[13px] font-medium text-white/70 tracking-wide">
                        {s.label}
                      </div>
                    </div>
                  </FadeUp>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Vision · Mission · Values ────────────────────────── */}
      <section className="py-28 px-6 bg-[#FFFFFF]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="text-center max-w-[680px] mx-auto mb-16">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                Philosophy
              </span>
              <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px] mb-5">
                교육을 바라보는<br />우리의 시선
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.65]">
                클래스인은 EEO(Education Everywhere Online)가 만든 교육용 SaaS 플랫폼입니다.
                &lsquo;화상 수업 도구&rsquo;가 아닌 &lsquo;교실 경험 전체를 설계하는 플랫폼&rsquo;을 목표로 합니다.
              </p>
            </div>
          </FadeUp>

          <div className="grid md:grid-cols-3 gap-5 mb-12">
            {PILLARS.map((p, i) => {
              const Icon = p.icon
              return (
                <FadeUp key={p.eyebrow} delay={i * 0.08}>
                  <div
                    className="group relative h-full overflow-hidden bg-white border border-[rgba(0,0,0,0.08)] rounded-[16px] p-8 transition-all hover:border-[rgba(8,71,52,0.18)]"
                    style={{
                      boxShadow:
                        "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px, rgba(0,0,0,0.02) 0px 0.8px 2.9px, rgba(0,0,0,0.01) 0px 0.175px 1px",
                    }}
                  >
                    <span className="pointer-events-none absolute right-6 top-5 select-none text-[84px] font-black leading-none tracking-[-0.08em] text-[#084734]/10 [text-shadow:0_18px_45px_rgba(8,71,52,0.14)] sm:right-7 sm:top-6 sm:text-[96px]">
                      {p.index}
                    </span>
                    <div className="relative z-10 mb-6 flex items-center">
                      <div className="w-11 h-11 rounded-full bg-[#ECFDF5] flex items-center justify-center">
                        <Icon className="w-5 h-5 text-[#084734]" strokeWidth={2} />
                      </div>
                    </div>
                    <div className="relative z-10 text-[11px] font-semibold text-[#084734] tracking-[0.15em] uppercase mb-3">
                      {p.eyebrow}
                    </div>
                    <h3 className="relative z-10 text-[20px] font-bold text-[#111110] leading-[1.3] tracking-[-0.4px] mb-3 whitespace-pre-line">
                      {p.title}
                    </h3>
                    <p className="relative z-10 text-[14px] text-[#615D59] leading-[1.65]">{p.desc}</p>
                  </div>
                </FadeUp>
              )
            })}
          </div>

          <FadeUp>
            <div className="grid sm:grid-cols-3 gap-3 bg-[#F6F5F4] rounded-[16px] p-5">
              {VALUE_DETAILS.map((v) => (
                <div key={v.title} className="px-4 py-3">
                  <div className="text-[14px] font-semibold text-[#084734] mb-1.5">
                    {v.title}
                  </div>
                  <div className="text-[13px] text-[#615D59] leading-[1.6]">{v.desc}</div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 성장 타임라인 ─────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#F6F5F4]">
        <div className="max-w-[860px] mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                History
              </span>
              <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px] mb-4">
                10년의 발자국
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.6]">
                작은 믿음에서 시작해, 세계가 신뢰하는 플랫폼이 되기까지.
              </p>
            </div>
          </FadeUp>

          <div className="relative">
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[rgba(8,71,52,0.18)] hidden sm:block" />

            <div className="flex flex-col gap-0">
              {TIMELINE.map((item, i) => {
                const isNow = item.year === "현재"
                return (
                  <FadeUp key={item.year} delay={i * 0.07}>
                    <div className="flex gap-6 sm:gap-8 pb-10 last:pb-0">
                      <div className="hidden sm:flex flex-col items-center shrink-0">
                        <div
                          className={`relative w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-transform ${
                            isNow
                              ? "bg-[#084734] text-white"
                              : "bg-white border border-[rgba(8,71,52,0.18)] text-[#084734]"
                          }`}
                          style={
                            isNow
                              ? {
                                  boxShadow:
                                    "0 0 0 6px rgba(8,71,52,0.08), rgba(8,71,52,0.18) 0px 8px 20px",
                                }
                              : undefined
                          }
                        >
                          {isNow ? "NOW" : item.year.slice(2)}
                        </div>
                      </div>

                      <div className="pb-2 flex-1">
                        <div className="flex items-baseline gap-3 mb-2">
                          <span className="text-[13px] font-bold text-[#084734] sm:hidden">
                            {item.year}
                          </span>
                          <span className="text-[18px] font-semibold text-[#111110] tracking-[-0.3px]">
                            {item.title}
                          </span>
                          <span className="hidden sm:block text-[12px] font-medium text-[#A39E98]">
                            {item.year}
                          </span>
                        </div>
                        <p className="text-[14px] text-[#615D59] leading-[1.7]">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  </FadeUp>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Global Offices ───────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FFFFFF]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="text-center max-w-[640px] mx-auto mb-14">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                Global Offices
              </span>
              <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px] mb-4">
                6개 도시, 하나의 클래스인
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.65]">
                아시아 전역의 거점에서 현지 교육 시장을 깊이 이해하며, 글로벌 표준의 플랫폼을 만들어 갑니다.
              </p>
            </div>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {offices.map((office, i) => (
              <FadeUp key={office.id} delay={i * 0.05}>
                <div
                  className={`group relative h-full rounded-[16px] p-7 transition-all ${
                    office.highlight
                      ? "bg-[#084734] text-white"
                      : "bg-white border border-[rgba(0,0,0,0.08)] hover:border-[rgba(8,71,52,0.2)]"
                  }`}
                  style={
                    office.highlight
                      ? {
                          boxShadow:
                            "rgba(8,71,52,0.18) 0px 16px 40px, rgba(8,71,52,0.1) 0px 4px 12px",
                        }
                      : {
                          boxShadow:
                            "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.02) 0px 1px 4px",
                        }
                  }
                >
                  <div className="flex items-center justify-between mb-6">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        office.highlight ? "bg-white/15" : "bg-[#ECFDF5]"
                      }`}
                    >
                      <MapPin
                        className={`w-4 h-4 ${
                          office.highlight ? "text-white" : "text-[#084734]"
                        }`}
                        strokeWidth={2.2}
                      />
                    </div>
                    <span
                      className={`text-[11px] font-mono font-semibold tracking-wider ${
                        office.highlight ? "text-white/60" : "text-[#A39E98]"
                      }`}
                    >
                      {office.countryCode}
                    </span>
                  </div>

                  <div
                    className={`text-[11px] font-semibold tracking-[0.15em] uppercase mb-2 ${
                      office.highlight ? "text-[#6EE7B7]" : "text-[#084734]"
                    }`}
                  >
                    {office.role}
                  </div>
                  <h3
                    className={`text-[24px] font-bold leading-[1.15] tracking-[-0.6px] mb-1 ${
                      office.highlight ? "text-white" : "text-[#111110]"
                    }`}
                  >
                    {office.city}
                  </h3>
                  <div
                    className={`text-[13px] font-medium mb-4 ${
                      office.highlight ? "text-white/60" : "text-[#A39E98]"
                    }`}
                  >
                    {office.cityEn} · {office.country}
                  </div>
                  <p
                    className={`text-[14px] leading-[1.65] ${
                      office.highlight ? "text-white/85" : "text-[#615D59]"
                    }`}
                  >
                    {office.description}
                  </p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── 글로벌 파트너 ─────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FFFFFF]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="text-center max-w-[600px] mx-auto mb-14">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                Global Partners
              </span>
              <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px] mb-4">
                세계가 신뢰하는 플랫폼
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.65]">
                전 세계 유수의 대학교·출판사·교육기업이 클래스인으로 수업합니다.
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="flex flex-wrap justify-center gap-3">
              {PARTNERS.map((name) => (
                <div
                  key={name}
                  className="bg-white rounded-full border border-[rgba(0,0,0,0.08)] px-5 py-2.5 text-[14px] font-medium text-[#111110]"
                  style={{
                    boxShadow:
                      "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px",
                  }}
                >
                  {name}
                </div>
              ))}
            </div>
          </FadeUp>

          <FadeUp delay={0.14}>
            <p className="text-center text-[13px] text-[#A39E98] mt-8">
              외 80,000+ 교육기관
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── Press ────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#F6F5F4]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
              <div>
                <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                  Press
                </span>
                <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px]">
                  미디어 속의 클래스인
                </h2>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-[#615D59]">
                <Newspaper className="w-4 h-4 text-[#084734]" strokeWidth={2} />
                국내외 매체에 소개된 클래스인의 이야기
              </div>
            </div>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {press.map((item, i) => {
              const hasUrl = Boolean(item.url)
              const cardClass = `group h-full bg-white rounded-[14px] border border-[rgba(0,0,0,0.06)] p-6 transition-all ${
                hasUrl
                  ? "hover:border-[rgba(8,71,52,0.2)] hover:-translate-y-0.5 cursor-pointer block"
                  : "cursor-default"
              }`
              const cardStyle = {
                boxShadow:
                  "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.02) 0px 1px 4px",
              }
              const inner = (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[11px] font-semibold text-[#084734] bg-[#ECFDF5] rounded-full px-2.5 py-1 tracking-wide">
                      {item.category}
                    </span>
                    <span className="text-[12px] text-[#A39E98] font-medium">
                      {item.date}
                    </span>
                  </div>
                  <div className="text-[13px] font-semibold text-[#084734] mb-2.5 tracking-wide">
                    {item.outlet}
                  </div>
                  <h3 className="text-[16px] font-semibold text-[#111110] leading-[1.45] tracking-[-0.2px] mb-5">
                    {item.headline}
                  </h3>
                  <div
                    className={`inline-flex items-center gap-1 text-[12px] font-medium transition-colors ${
                      hasUrl
                        ? "text-[#084734] group-hover:gap-1.5"
                        : "text-[#A39E98] group-hover:text-[#084734]"
                    }`}
                  >
                    기사 보기
                    <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                  </div>
                </>
              )

              return (
                <FadeUp key={item.id} delay={i * 0.05}>
                  {hasUrl ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cardClass}
                      style={cardStyle}
                    >
                      {inner}
                    </a>
                  ) : (
                    <article className={cardClass} style={cardStyle}>
                      {inner}
                    </article>
                  )}
                </FadeUp>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Community / Blog ─────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#FFFFFF]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-12">
              <div>
                <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                  Community
                </span>
                <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px]">
                  교육 현장의 인사이트
                </h2>
              </div>
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#084734] hover:gap-2.5 transition-all"
              >
                블로그 전체 보기
                <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
              </Link>
            </div>
          </FadeUp>

          {recentPosts.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {recentPosts.map((post, i) => (
                <FadeUp key={post.slug} delay={i * 0.07}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group block h-full bg-white rounded-[16px] border border-[rgba(0,0,0,0.08)] overflow-hidden transition-all hover:border-[rgba(8,71,52,0.2)]"
                    style={{
                      boxShadow:
                        "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.02) 0px 1px 4px",
                    }}
                  >
                    <div className="relative aspect-[16/9] bg-[#F6F5F4] overflow-hidden">
                      {post.imageUrl ? (
                        <Image
                          src={post.imageUrl}
                          alt={post.title}
                          fill
                          sizes="(min-width: 1024px) 380px, (min-width: 640px) 50vw, 100vw"
                          className="object-cover transition-transform group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Newspaper className="w-10 h-10 text-[#A39E98]" strokeWidth={1.5} />
                        </div>
                      )}
                      {post.category && (
                        <span className="absolute top-3 left-3 text-[11px] font-semibold text-[#084734] bg-white/95 backdrop-blur rounded-full px-2.5 py-1 tracking-wide">
                          {post.category}
                        </span>
                      )}
                    </div>
                    <div className="p-6">
                      <h3 className="text-[17px] font-semibold text-[#111110] leading-[1.4] tracking-[-0.25px] mb-2 line-clamp-2">
                        {post.title}
                      </h3>
                      <p className="text-[13px] text-[#615D59] leading-[1.6] line-clamp-2 mb-4">
                        {post.excerpt}
                      </p>
                      <div className="flex items-center justify-between text-[12px] text-[#A39E98]">
                        <span>{post.date}</span>
                        {post.readTime && <span>{post.readTime}</span>}
                      </div>
                    </div>
                  </Link>
                </FadeUp>
              ))}
            </div>
          ) : (
            <FadeUp>
              <div className="bg-[#F6F5F4] rounded-[16px] p-12 text-center">
                <Newspaper className="w-8 h-8 text-[#A39E98] mx-auto mb-4" strokeWidth={1.5} />
                <p className="text-[15px] text-[#615D59] mb-5">
                  곧 새로운 교육 인사이트를 공개합니다.
                </p>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#084734] hover:gap-2.5 transition-all"
                >
                  블로그로 이동
                  <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.2} />
                </Link>
              </div>
            </FadeUp>
          )}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-[#F6F5F4]">
        <div className="max-w-[720px] mx-auto text-center">
          <FadeUp>
            <h2 className="text-[36px] sm:text-[44px] font-bold text-[#111110] leading-[1.1] tracking-[-1.5px] mb-5">
              클래스인과 함께<br />시작해보세요
            </h2>
            <p className="text-[16px] text-[#615D59] leading-[1.65] mb-9">
              도입 방법부터 기관 맞춤 요금제까지,
              <br className="sm:hidden" /> 전문 상담팀이 직접 안내해드립니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <TrackedLink
                href="/contact"
                ctaId="about_final_contact"
                className="inline-flex items-center justify-center gap-1.5 bg-[#084734] text-white font-semibold text-[15px] px-7 py-3 rounded-[6px] hover:bg-[#065c41] transition-colors"
              >
                도입 문의하기
                <ArrowRight className="w-4 h-4" strokeWidth={2.2} />
              </TrackedLink>
              <Link
                href="/product"
                className="inline-flex items-center justify-center bg-[rgba(0,0,0,0.05)] text-[#111110] font-semibold text-[15px] px-7 py-3 rounded-[6px] hover:bg-[rgba(0,0,0,0.08)] transition-colors"
              >
                제품 살펴보기
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>

    </main>
  )
}
