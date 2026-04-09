"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Sun, Sparkles, Maximize2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const transition = (delay: number) => ({
  duration: 0.6,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  delay,
});

const CARDS = [
  {
    icon: Sun,
    heading: "형광등이 켜져 있어도, 글씨가 죽지 않습니다.",
    body: "AG(Anti-Glare) 코팅 + 90% 이상 빛 투과율. 창가 자리든 뒷자리든, 같은 글씨를 봅니다.",
  },
  {
    icon: Sparkles,
    heading: "닦지 않아도, 깨끗합니다.",
    body: "AF(Anti-Fingerprint) 마감. 50명이 만져도 흔적이 남지 않습니다. 수업 사이에 닦을 시간이 필요 없습니다.",
  },
  {
    icon: Maximize2,
    heading: "몰입을 방해하지 않습니다.",
    body: "8mm 슬림 베젤, 무광 알루미늄 프레임. 학생의 시선이 학습에만 머뭅니다.",
  },
] as const;

export default function DesignDetails() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });

  return (
    <section
      ref={ref}
      className="bg-white py-24 md:py-32 px-6"
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0)}
          className="text-xs tracking-[0.2em] text-[#084734] font-semibold uppercase"
        >
          PHYSICAL DETAILS
        </motion.p>

        <motion.h2
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0.1)}
          className="font-serif text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
          style={{ letterSpacing: "-1.5px" }}
        >
          디테일이 수업의 질을 바꿉니다.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0.2)}
          className="text-lg text-[#615D59] mt-5 max-w-2xl"
        >
          보드의 강함은 스펙시트가 아니라, 손에 닿는 표면에 있습니다.
        </motion.p>

        {/* Cards */}
        <div className="mt-16 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
          {CARDS.map(({ icon: Icon, heading, body }, i) => (
            <motion.div
              key={heading}
              variants={fadeUp}
              initial="hidden"
              animate={inView ? "visible" : "hidden"}
              transition={transition(0.3 + i * 0.15)}
              className="bg-[#FAFAF8] rounded-2xl border border-black/[0.08] overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
            >
              {/* Image area */}
              <div className="aspect-square bg-gradient-to-br from-[#ECFDF5] to-[#F6F5F4] flex items-center justify-center">
                <Icon
                  size={80}
                  strokeWidth={1.25}
                  style={{ color: "#084734", opacity: 0.5 }}
                />
              </div>

              {/* Body */}
              <div className="p-7 flex flex-col">
                <h3
                  className="font-serif text-2xl text-[#111110] leading-snug"
                  style={{ letterSpacing: "-0.25px" }}
                >
                  {heading}
                </h3>
                <p className="text-base text-[#615D59] mt-3 leading-relaxed">
                  {body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
