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
    heading: "맨 뒷자리까지 닿는 선명함, AG 코팅 + 90% 투과율",
    body: "빛 반사로 인한 사각지대를 완벽히 잡았습니다. 창가 자리든 뒷자리든, 교실 어느 자리에서도 왜곡 없이 선명한 판서를 공유하며 수업의 몰입도를 극대화합니다.",
  },
  {
    icon: Sparkles,
    heading: "실제 종이에 쓰듯 자연스러운 '리얼 라이팅'",
    body: "손끝을 그대로 따라오는 0.03초의 압도적인 응답 속도는 딜레이 없는 완벽한 수업 리듬을 만듭니다. 고밀도 터치 센서가 필기 압력과 굵기를 세밀하게 감지하여, 분필이나 펜으로 쓰는 듯한 느낌을 구현합니다.",
  },
  {
    icon: Maximize2,
    heading: "왜곡 없이 선명한 '풀 라미네이션' 디스플레이",
    body: "패널과 강화유리 사이의 공기층을 완전히 제거한 광학 본딩 기술을 적용했습니다. 어느 자리에서 봐도 왜곡 없이 선명한 화면을 유지하며, 시차 없는 정확한 터치와 블루라이트 차단으로 장시간 수업에도 눈의 피로를 최소화합니다.",
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
          className="text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
          style={{ letterSpacing: "-1.5px" }}
        >
          디테일이 만드는 압도적인 몰입감
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
                  className="text-2xl text-[#111110] leading-snug"
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
