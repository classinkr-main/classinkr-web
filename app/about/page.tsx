"use client"

import * as React from "react"
import Link from "next/link"
import { motion, useInView } from "framer-motion"

/* ─── 데이터 ────────────────────────────────────────────────── */

const STATS = [
  { value: "200억+", label: "누적 수업 횟수" },
  { value: "5,000만+", label: "교사 · 학습자" },
  { value: "8만+", label: "파트너 교육기관" },
  { value: "160+", label: "서비스 국가" },
]

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

const VALUES = [
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

export default function AboutPage() {
  return (
    <main className="bg-[#FAFAF8]">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="pt-32 pb-24 px-6 bg-[#FAFAF8]">
        <div className="max-w-[900px] mx-auto text-center">
          <FadeUp>
            <span className="inline-flex items-center gap-1.5 bg-[#ECFDF5] text-[#084734] text-[12px] font-semibold tracking-[0.125px] px-3 py-1.5 rounded-full mb-6">
              글로벌 EdTech 유니콘 · 160개국
            </span>
          </FadeUp>
          <FadeUp delay={0.08}>
            <h1
              className="text-[42px] sm:text-[54px] lg:text-[64px] font-bold text-[#111110] leading-[1.04] tracking-[-1.875px] mb-6"
            >
              교육을 시스템으로,<br />세계를 교실로
            </h1>
          </FadeUp>
          <FadeUp delay={0.14}>
            <p className="text-[18px] sm:text-[20px] text-[#615D59] leading-[1.6] max-w-[640px] mx-auto">
              2014년 설립 이래 EEO는 단 하나의 질문을 붙들고 있습니다.
              <br className="hidden sm:block" />
              <em className="not-italic font-semibold text-[#111110]">어떻게 하면 모든 학생이 좋은 수업을 받을 수 있을까?</em>
            </p>
          </FadeUp>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────── */}
      <section className="bg-[#084734] py-16 px-6">
        <div className="max-w-[1200px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-0 lg:divide-x lg:divide-white/20">
          {STATS.map((s, i) => (
            <FadeUp key={s.label} delay={i * 0.07}>
              <div className="text-center px-6">
                <div className="text-[40px] sm:text-[48px] font-bold text-white tracking-[-1.5px] leading-none mb-2">
                  {s.value}
                </div>
                <div className="text-[14px] font-medium text-white/60 tracking-wide">
                  {s.label}
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── EEO 그룹 소개 ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FFFFFF]">
        <div className="max-w-[1200px] mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <FadeUp>
            <div>
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-4 block">
                About EEO · ClassIn
              </span>
              <h2 className="text-[36px] sm:text-[42px] font-bold text-[#111110] leading-[1.12] tracking-[-1.25px] mb-6">
                교육이 있는 곳이라면<br />어디든 클래스인이 있습니다
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.7] mb-5">
                클래스인은 EEO(Education Everywhere Online)가 만든 교육용 SaaS 플랫폼입니다.
                EEO는 &lsquo;화상 수업 도구&rsquo;가 아닌 &lsquo;교실 경험 전체를 설계하는 플랫폼&rsquo;을 목표로
                2014년에 설립됐습니다.
              </p>
              <p className="text-[16px] text-[#615D59] leading-[1.7]">
                수업 전 준비부터 수업 중 운영, 수업 후 학습 관리까지 — 클래스인은 교육의
                모든 과정을 하나의 시스템으로 연결합니다. 학원 운영자가 강사 한 명에
                의존하지 않고, 반복 가능한 수업 구조를 만들 수 있도록 돕습니다.
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <div className="grid grid-cols-1 gap-4">
              {VALUES.map((v) => (
                <div
                  key={v.title}
                  className="bg-[#FAFAF8] rounded-[12px] border border-[rgba(0,0,0,0.08)] p-6"
                >
                  <div className="text-[15px] font-semibold text-[#111110] mb-1.5">{v.title}</div>
                  <div className="text-[14px] text-[#615D59] leading-[1.6]">{v.desc}</div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── 미션 풀쿼트 ──────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#F6F5F4]">
        <div className="max-w-[800px] mx-auto text-center">
          <FadeUp>
            <div className="text-[13px] font-semibold text-[#A39E98] tracking-[0.125px] uppercase mb-6">
              Mission
            </div>
            <blockquote className="text-[22px] sm:text-[28px] font-semibold text-[#111110] leading-[1.45] tracking-[-0.5px] mb-6">
              &ldquo;창립 이래로 우리는 모든 학생들에게 높은 수준의 교육을 제공하고,
              다양한 국가 간의 교류를 촉진시키며 미래의 리더를 양성하는데
              전념해 왔습니다.&rdquo;
            </blockquote>
            <div className="text-[14px] font-medium text-[#A39E98]">EEO 창립 미션</div>
          </FadeUp>
        </div>
      </section>

      {/* ── 성장 타임라인 ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FFFFFF]">
        <div className="max-w-[800px] mx-auto">
          <FadeUp>
            <div className="text-center mb-16">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                History
              </span>
              <h2 className="text-[36px] sm:text-[42px] font-bold text-[#111110] leading-[1.1] tracking-[-1.25px]">
                10년의 발자국
              </h2>
            </div>
          </FadeUp>

          <div className="relative">
            {/* 타임라인 세로선 */}
            <div className="absolute left-[19px] top-2 bottom-2 w-px bg-[rgba(0,0,0,0.08)] hidden sm:block" />

            <div className="flex flex-col gap-0">
              {TIMELINE.map((item, i) => (
                <FadeUp key={item.year} delay={i * 0.07}>
                  <div className="flex gap-6 sm:gap-8 pb-10 last:pb-0">
                    {/* 도트 */}
                    <div className="hidden sm:flex flex-col items-center shrink-0">
                      <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[11px] font-bold shrink-0 ${
                        item.year === "현재"
                          ? "bg-[#084734] border-[#084734] text-white"
                          : "bg-white border-[rgba(0,0,0,0.12)] text-[#615D59]"
                      }`}>
                        {item.year === "현재" ? "NOW" : item.year.slice(2)}
                      </div>
                    </div>

                    {/* 내용 */}
                    <div className="pb-2">
                      <div className="flex items-baseline gap-3 mb-1.5">
                        <span className="text-[13px] font-bold text-[#084734] sm:hidden">{item.year}</span>
                        <span className="text-[16px] font-semibold text-[#111110]">{item.title}</span>
                        <span className="hidden sm:block text-[12px] font-medium text-[#A39E98]">{item.year}</span>
                      </div>
                      <p className="text-[14px] text-[#615D59] leading-[1.65]">{item.desc}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 글로벌 파트너 ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#ECFDF5]">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <div className="text-center mb-14">
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-3 block">
                Global Partners
              </span>
              <h2 className="text-[32px] sm:text-[40px] font-bold text-[#111110] leading-[1.2] tracking-[-1px] mb-4">
                세계가 신뢰하는 플랫폼
              </h2>
              <p className="text-[16px] text-[#615D59] max-w-[500px] mx-auto leading-[1.6]">
                전 세계 유수의 대학교·출판사·교육기업이
                클래스인으로 수업합니다.
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="flex flex-wrap justify-center gap-3">
              {PARTNERS.map((name) => (
                <div
                  key={name}
                  className="bg-white rounded-[9999px] border border-[rgba(0,0,0,0.08)] px-5 py-2.5 text-[14px] font-medium text-[#111110]"
                  style={{
                    boxShadow: "rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 7.8px",
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

      {/* ── 한국 섹션 ─────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#FFFFFF]">
        <div className="max-w-[900px] mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <FadeUp>
            <div>
              <span className="text-[12px] font-semibold text-[#084734] tracking-[0.125px] uppercase mb-4 block">
                Korea
              </span>
              <h2 className="text-[32px] sm:text-[38px] font-bold text-[#111110] leading-[1.15] tracking-[-1px] mb-5">
                글로벌 플랫폼,<br />한국 교육의 언어로
              </h2>
              <p className="text-[16px] text-[#615D59] leading-[1.7]">
                클래스인은 글로벌 플랫폼이지만, 한국 학원 현장을 깊이 이해합니다.
                강사 한 명이 나가면 흔들리는 구조, 수업은 하는데 성적이 안 오르는 문제,
                빔프로젝터 연결하다 5분을 날리는 상황 — 이 모든 것이 클래스인이 해결하려는
                문제입니다.
              </p>
            </div>
          </FadeUp>

          <FadeUp delay={0.1}>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "한국어 완전 지원", desc: "한국어 UI·CS·온보딩" },
                { label: "학원 특화 기능", desc: "출석·숙제·성적 관리" },
                { label: "로컬 파트너 지원", desc: "설치·교육·A/S" },
                { label: "12개 언어 지원", desc: "글로벌 협업 수업 가능" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-[#F6F5F4] rounded-[12px] p-5"
                >
                  <div className="text-[14px] font-semibold text-[#111110] mb-1">{item.label}</div>
                  <div className="text-[13px] text-[#A39E98]">{item.desc}</div>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-[#F6F5F4]">
        <div className="max-w-[640px] mx-auto text-center">
          <FadeUp>
            <h2 className="text-[32px] sm:text-[40px] font-bold text-[#111110] leading-[1.2] tracking-[-1px] mb-4">
              클래스인과 함께<br />시작해보세요
            </h2>
            <p className="text-[16px] text-[#615D59] leading-[1.6] mb-8">
              도입 방법부터 기관 맞춤 요금제까지,
              전문 상담팀이 직접 안내해드립니다.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center bg-[#084734] text-white font-semibold text-[15px] px-7 py-3 rounded-[6px] hover:bg-[#065c41] transition-colors"
              >
                도입 문의하기
              </Link>
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
