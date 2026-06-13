"use client"

import Image from "next/image"
import { motion, type Variants } from "framer-motion"
import { TrackedLink } from "@/components/TrackedLink"

const sizes = [
  {
    inches: `75"`,
    heading: `75" — 콤팩트 강의실`,
    imageSrc: "/images/product/hw/sizes/room-75.webp",
    imageAlt: '75인치 클래스인 보드 예시 공간',
    specs: [
      { label: "적정 인원", value: "20~30명" },
      { label: "적정 평수", value: "15~25평" },
      { label: "시야 거리", value: "2.5~5m" },
      { label: "적합 용도", value: "소그룹·1:1" },
    ],
    badge: null,
  },
  {
    inches: `86"`,
    heading: `86" — 표준 강의실`,
    imageSrc: "/images/product/hw/sizes/room-86-jayescan.webp",
    imageClassName: "object-cover scale-[1.22]",
    imageAlt: '86인치 클래스인 보드 수업 공간',
    specs: [
      { label: "적정 인원", value: "30~50명" },
      { label: "적정 평수", value: "25~40평" },
      { label: "시야 거리", value: "3~7m" },
      { label: "적합 용도", value: "일반 강의·라이브" },
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <p className="text-xs tracking-[0.2em] text-[#084734] font-semibold uppercase">
          CHOOSE YOUR SIZE
        </p>
        <h2
          className="text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
          style={{ letterSpacing: "-1.5px" }}
        >
          우리 강의실에 딱 맞는 완벽한 크기
        </h2>
        <p className="text-lg text-[#615D59] mt-5 max-w-xl">
          강의실의 규모와 학생들의 시야를 고려한 두 가지 표준 규격을
          제안합니다. 소규모 강의실부터 대형 강의실까지, 공간의 제약 없이
          압도적인 몰입감을 전달하세요.
        </p>

        {/* Cards */}
        <div className="mt-14 mx-auto grid max-w-5xl md:grid-cols-2 gap-6 lg:gap-8">
          {sizes.map((size, i) => (
            <motion.div
              key={size.inches}
              custom={i}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-60px" }}
              variants={fadeUp}
              className="mx-auto w-full max-w-[470px] bg-[#FAFAF8] rounded-[28px] border border-black/[0.08] relative
                         hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
            >
              {/* Badge */}
              {size.badge && (
                <span className="absolute top-5 right-5 bg-[#084734] text-white text-xs font-bold tracking-wider uppercase px-3 py-1.5 rounded-full z-10">
                  {size.badge}
                </span>
              )}

              {/* Image area */}
              <div className="relative mx-5 mt-5 aspect-[15/10] overflow-hidden rounded-[22px] bg-gradient-to-br from-[#ECFDF5] to-[#F6F5F4]">
                <Image
                  src={size.imageSrc}
                  alt={size.imageAlt}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className={size.imageClassName ?? "object-cover"}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
              </div>

              {/* Body */}
              <div className="p-6 sm:p-7">
                <h3
                  className="text-[1.75rem] text-[#111110]"
                  style={{ letterSpacing: "-0.5px" }}
                >
                  {size.heading}
                </h3>

                {/* Spec lines */}
                <ul className="mt-5 space-y-3">
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
                <TrackedLink
                  href="/contact#contact-form"
                  ctaId="hw_size_demo"
                  tracking={{ model: size.inches }}
                  className="mt-7 block w-full rounded-md bg-[#084734] py-3 text-center text-sm font-semibold text-white transition hover:bg-[#065c41]"
                >
                  이 사이즈로 데모 신청 →
                </TrackedLink>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 110" footnote */}
        <div className="mt-10 mx-auto flex max-w-5xl justify-center">
          <p className="text-center text-sm text-[#615D59]">
            더 큰 공간(50명+, 강당·콘퍼런스)을 위한 110&quot; 모델은{" "}
            <TrackedLink
              href="/contact#contact-form"
              ctaId="hw_size_110_inquiry"
              className="text-[#084734] underline underline-offset-2"
            >
              별도 문의
            </TrackedLink>
            로 안내드립니다.
          </p>
        </div>
      </div>
    </section>
  )
}
