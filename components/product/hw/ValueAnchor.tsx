"use client";

import { motion, type Variants } from "framer-motion";
import { Check } from "lucide-react";
import Link from "next/link";

const items = [
  {
    label: "[화질] 86\" / 75\" 4K 디스플레이",
    desc: "AG/AF 코팅으로 눈부심 없이 선명하게",
  },
  {
    label: "[판서] 50점 멀티터치 & 0.03s 응답",
    desc: "이질감 없는 초밀착 판서 경험",
  },
  {
    label: "[성능] 고성능 OPS PC 내장 (i5 / i7)",
    desc: "선 연결 없는 깔끔한 데스크탑 환경",
  },
  {
    label: "[추적] 4K AI 카메라 & 마이크 어레이",
    desc: "강사 자동 추적과 고음질 녹화를 동시에",
  },
  {
    label: "[소프트웨어] ClassIn 전용 라이선스",
    desc: "판서 캡처부터 학원 운영 관리까지 한 번에",
  },
  {
    label: "[도입] 설치 + 교사 온보딩",
    desc: "전문 엔지니어 출장, 4시간 핸즈온 교육",
  },
  {
    label: "[지원] 24시간 원격지원 + 출장 A/S",
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
    <section className="bg-[#0D1A12] text-white min-h-screen flex items-center px-6 py-20 md:py-24 relative overflow-hidden">
      {/* Background glows */}
      <div
        aria-hidden="true"
        className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-[#084734]/30 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#084734]/30 blur-3xl pointer-events-none"
      />

      <div className="w-full max-w-5xl mx-auto text-center relative z-10">
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
          클래스인 보드 하나에
          <br />
          수업을 위한 모든 기능을 담았습니다.
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
          클래스인 보드는 하드웨어부터 소프트웨어까지 단 한 대에 모두 구축된
          완성형 솔루션입니다. 도입하는 순간, 복잡한 연결 과정 없이 바로 수업을
          시작할 수 있습니다.
        </motion.p>

        {/* Value card */}
        <motion.div
          custom={3}
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          whileTap={{ scale: 0.985 }}
          className="mt-10 max-w-xl mx-auto bg-white/[0.05] backdrop-blur-sm border border-white/10 rounded-2xl p-6 md:p-8 text-left cursor-default"
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
          className="mt-10 flex flex-col items-center gap-4"
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
