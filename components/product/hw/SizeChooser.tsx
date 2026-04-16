"use client"

import Link from "next/link"
import { motion, type Variants } from "framer-motion"

const sizes = [
  {
    inches: `75"`,
    heading: `75" — 집중형 교실`,
    specs: [
      { label: "적정 인원", value: "20~30명" },
      { label: "적정 평수", value: "15~25평" },
      { label: "시야 거리", value: "2.5~5m" },
      { label: "적합 용도", value: "소그룹 수업·1:1" },
    ],
    badge: null,
  },
  {
    inches: `86"`,
    heading: `86" — 표준 교실`,
    specs: [
      { label: "적정 인원", value: "30~50명" },
      { label: "적정 평수", value: "25~40평" },
      { label: "시야 거리", value: "3~7m" },
      { label: "적합 용도", value: "일반 수업·라이브 강의" },
    ],
    badge: "MOST POPULAR",
  },
]

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.15 },
  }),
}

export default function SizeChooser() {
  return (
    <section className="bg-white py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <p className="text-xs tracking-[0.2em] text-[#084734] font-semibold uppercase">
          CHOOSE YOUR SIZE
        </p>
        <h2
          className="text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
          style={{ letterSpacing: "-1.5px" }}
        >
          공간에 맞는 선택이,
          <br />
          운영의 완성도를 높입니다.
        </h2>
        <p className="text-lg text-[#615D59] mt-5 max-w-2xl">
          가장 많이 선택되는 75인치와 86인치를 기준으로,
          교실 규모에 맞는 표준 구성을 안내합니다.
        </p>

        {/* Cards */}
        <div className="mt-16 grid md:grid-cols-2 gap-8">
          {sizes.map((size, i) => (
            <motion.div
              key={size.inches}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              className="bg-[#FAFAF8] rounded-3xl border border-black/[0.08] overflow-hidden relative
                         hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
            >
              {/* Badge */}
              {size.badge && (
                <span className="absolute top-5 right-5 bg-[#084734] text-white text-xs font-bold tracking-wider uppercase px-3 py-1.5 rounded-full z-10">
                  {size.badge}
                </span>
              )}

              {/* Image area */}
              <div className="aspect-[16/10] bg-gradient-to-br from-[#ECFDF5] to-[#F6F5F4] flex items-center justify-center">
                <span
                  className="text-7xl md:text-8xl text-[#084734]/30 font-bold tabular-nums select-none"
                >
                  {size.inches}
                </span>
              </div>

              {/* Body */}
              <div className="p-8">
                <h3
                  className="text-3xl text-[#111110]"
                  style={{ letterSpacing: "-0.5px" }}
                >
                  {size.heading}
                </h3>

                {/* Spec lines */}
                <ul className="mt-6 space-y-3">
                  {size.specs.map((spec) => (
                    <li
                      key={spec.label}
                      className="flex justify-between text-sm border-b border-black/[0.06] pb-2"
                    >
                      <span className="text-[#615D59]">{spec.label}</span>
                      <span className="text-[#111110] font-semibold">{spec.value}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button className="mt-8 w-full bg-[#084734] hover:bg-[#065c41] text-white rounded-md py-3 text-sm font-semibold transition">
                  이 구성 상담받기
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 110" footnote */}
        <p className="mt-12 text-center text-sm text-[#615D59]">
          50명 이상 대형 공간이나 강당용 110&quot; 모델은{" "}
          <Link
            href="/contact"
            className="text-[#084734] underline underline-offset-2"
          >
            별도 상담
          </Link>
          으로 제안해드립니다.
        </p>
      </div>
    </section>
  )
}
