"use client";

import { motion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const items = [
  {
    label: "86\" / 75\" 4K 디스플레이",
    desc: "AG/AF 코팅, 90% 이상 빛 투과율",
  },
  {
    label: "50점 멀티터치 + 0.03s 응답",
    desc: "분필보다 빠른 필기, 동시 필기 지원",
  },
  {
    label: "OPS PC 내장 (i5 / i7)",
    desc: "별도 본체·HDMI·어댑터 불필요",
  },
  {
    label: "4K AI 트래킹 카메라 + 마이크 어레이",
    desc: "강사 자동 추적, 라이브·녹화 한 번에",
  },
  {
    label: "ClassIn 소프트웨어 라이선스",
    desc: "학원 단위 무제한, 판서 자동 캡처 포함",
  },
  {
    label: "설치 + 교사 온보딩",
    desc: "전문 엔지니어 출장, 4시간 핸즈온 교육",
  },
  {
    label: "24시간 원격지원 + 출장 A/S",
    desc: "1년 무상, 평일 24시간 대응",
  },
];

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 },
  }),
};

const itemFadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: 0.45 + i * 0.08 },
  }),
};

export default function ValueAnchor() {
  return (
    <section className="bg-[#0D1A12] text-white py-28 md:py-36 px-6 relative overflow-hidden">
      {/* Background glows */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[#084734]/30 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#084734]/30 blur-3xl pointer-events-none"
      />

      <div className="max-w-5xl mx-auto text-center relative z-10">
        {/* Eyebrow */}
        <motion.p
          custom={0}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs tracking-[0.2em] text-[#6EE7B7] font-semibold uppercase"
        >
          ALL-IN-ONE PROMISE
        </motion.p>

        {/* Heading */}
        <motion.h2
          custom={1}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="font-serif text-4xl md:text-5xl lg:text-6xl mt-4 leading-tight text-white"
          style={{ letterSpacing: "-1.5px" }}
        >
          한 대 안에,
          <br />
          교실이 필요한 모든 것.
        </motion.h2>

        {/* Sub-copy */}
        <motion.p
          custom={2}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="text-lg text-white/70 mt-6 max-w-2xl mx-auto leading-relaxed"
        >
          ClassIn Board를 들이는 순간, 더 살 것이 없습니다. 별도 PC도, 캠코더도, 마이크도, 소프트웨어도 모두 보드 안에 들어 있습니다.
        </motion.p>

        {/* Value card */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-16 max-w-3xl mx-auto bg-white/[0.04] backdrop-blur-sm border border-white/10 rounded-3xl p-10 md:p-14 text-left"
        >
          <p className="text-xs uppercase tracking-wider text-[#6EE7B7]">INCLUDED</p>
          <h3
            className="font-serif text-2xl md:text-3xl text-white mt-2"
            style={{ letterSpacing: "-0.5px" }}
          >
            이 한 대에 포함되는 것
          </h3>

          <ul className="mt-8 space-y-4">
            {items.map((item, i) => (
              <motion.li
                key={item.label}
                custom={i}
                variants={itemFadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                className="flex items-start gap-4"
              >
                <Check
                  className="w-5 h-5 text-[#6EE7B7] mt-1 shrink-0"
                  aria-hidden="true"
                />
                <div>
                  <span className="block text-base font-semibold text-white">
                    {item.label}
                  </span>
                  <span className="block text-sm text-white/55 mt-0.5">
                    {item.desc}
                  </span>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* CTA */}
        <motion.div
          custom={4}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          className="mt-12 flex flex-col items-center gap-4"
        >
          <Link
            href="/contact"
            className="inline-block bg-[#6EE7B7] hover:bg-white text-[#0D1A12] font-bold px-10 py-4 rounded-md text-base transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            데모 신청하고 직접 사용해보기 →
          </Link>
          <p className="text-sm text-white/50">
            30일 만족 보장 — 사용해보고 결정하세요.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
