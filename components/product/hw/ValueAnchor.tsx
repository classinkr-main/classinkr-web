"use client";

import { motion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const items = [
  {
    label: "86\" / 75\" 4K 디스플레이",
    desc: "AG/AF 코팅, 선명한 가독성 유지",
  },
  {
    label: "50점 멀티터치 + 0.03s 응답",
    desc: "끊김 없는 필기, 동시 판서 지원",
  },
  {
    label: "OPS PC 내장 (i5 / i7)",
    desc: "별도 본체·HDMI·어댑터 없이 시작",
  },
  {
    label: "4K AI 트래킹 카메라 + 마이크 어레이",
    desc: "교사 자동 추적, 라이브와 녹화를 한 번에",
  },
  {
    label: "ClassIn 소프트웨어 라이선스",
    desc: "판서 기록, 공유, 수업 운영 흐름 포함",
  },
  {
    label: "설치 + 교사 온보딩",
    desc: "전문 엔지니어 설치, 4시간 현장 교육",
  },
  {
    label: "24시간 원격지원 + 출장 A/S",
    desc: "도입 후 운영 지원과 유지보수까지",
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
          className="text-4xl md:text-5xl lg:text-6xl mt-4 leading-tight text-white"
          style={{ letterSpacing: "-1.5px" }}
        >
          필요한 것은,
          <br />
          이미 한 대에 담았습니다.
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
          보드, 컴퓨팅, 카메라, 오디오, 소프트웨어, 설치와 운영 지원까지.
          도입 이후가 더 단순하도록 처음부터 함께 설계했습니다.
        </motion.p>

        {/* Value card */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          whileTap={{ scale: 0.985 }}
          className="mt-12 max-w-xl mx-auto bg-white/[0.05] backdrop-blur-sm border border-white/10 rounded-2xl p-6 md:p-8 text-left cursor-default"
          style={{ transition: "box-shadow 0.15s" }}
        >
          <div className="flex items-center justify-between mb-5">
            <p className="text-[10px] uppercase tracking-widest text-[#6EE7B7] font-semibold">INCLUDED</p>
            <span className="text-[10px] text-white/30 font-medium">{items.length}가지 포함</span>
          </div>

          <ul className="space-y-2.5">
            {items.map((item, i) => (
              <motion.li
                key={item.label}
                custom={i}
                variants={itemFadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-60px" }}
                className="flex items-center gap-3"
              >
                <Check
                  className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-white/90 leading-snug">
                  {item.label}
                </span>
                <span className="hidden sm:block text-xs text-white/35 leading-snug truncate">
                  — {item.desc}
                </span>
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
            도입 상담 신청
          </Link>
          <p className="text-sm text-white/50">
            교실 규모와 운영 방식에 맞는 구성까지 차분하게 안내해드립니다.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
