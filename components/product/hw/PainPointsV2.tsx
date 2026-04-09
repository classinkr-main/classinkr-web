"use client";

import { motion } from "framer-motion";
import { X, ArrowRight, Check } from "lucide-react";

const items = [
  {
    pain: "PC, HDMI, 캠코더, 마이크 케이블이 책상 위에 산처럼 쌓였습니다.",
    solutionTitle: "OPS 내장 PC",
    solutionDesc: "보드 안에 i5/i7 PC가 있습니다. 케이블도, 본체도 없습니다.",
  },
  {
    pain: "강의 영상에 강사가 자꾸 프레임 밖으로 나가서, 보조 인력이 캠을 따라다녀야 합니다.",
    solutionTitle: "4K AI 트래킹 카메라",
    solutionDesc: "강사를 자동 인식하고 따라옵니다. 운영자 한 명 줄어듭니다.",
  },
  {
    pain: "전자 펜은 한 박자 늦어요. 결국 다시 분필로 돌아갑니다.",
    solutionTitle: "0.03s 응답 패널",
    solutionDesc: "사람이 지연을 느끼는 한계의 1/3. 분필보다 빠릅니다.",
  },
  {
    pain: "뒷자리 학생은 형광등 반사 때문에 칠판이 안 보인다고 합니다.",
    solutionTitle: "AG 코팅 + 90% 투과율",
    solutionDesc: "어느 자리에서도 같은 글씨를 봅니다.",
  },
  {
    pain: "지문이 묻으면 매시간 닦아야 해서 수업 흐름이 끊깁니다.",
    solutionTitle: "AF 마감",
    solutionDesc: "닦지 않아도 깨끗합니다. 50명이 만져도 흔적이 남지 않습니다.",
  },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const rowVariants: import("framer-motion").Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export default function PainPointsV2() {
  return (
    <section className="bg-white py-24 md:py-32 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div>
          <p className="text-xs tracking-[0.2em] text-[#084734] font-semibold uppercase">
            FROM PAIN TO POWER
          </p>
          <h2
            className="font-serif text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            선생님의 고민, 보드 한 대로 끝납니다.
          </h2>
          <p className="text-lg text-[#615D59] mt-5 max-w-2xl">
            교실에서 매일 마주치는 5가지 마찰. ClassIn Board는 그 모두를 부품
            단위로 해결합니다.
          </p>
        </div>

        {/* Rows */}
        <motion.div
          className="mt-16 space-y-4"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          {items.map((item, i) => (
            <motion.div
              key={i}
              variants={rowVariants}
              className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-8 items-stretch"
            >
              {/* Pain card */}
              <div className="bg-[#FEF3EE] border border-[#F6D5C5] rounded-2xl p-6 flex items-start gap-4">
                <X
                  className="w-6 h-6 text-[#B85C33] shrink-0 mt-0.5"
                  strokeWidth={2.5}
                />
                <p className="text-base text-[#7A3920] leading-relaxed font-medium">
                  {item.pain}
                </p>
              </div>

              {/* Arrow — md only */}
              <div className="hidden md:flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-[#615D59]" />
              </div>

              {/* Solution card */}
              <div className="bg-[#ECFDF5] border border-[#084734]/15 rounded-2xl p-6 flex items-start gap-4">
                <Check
                  className="w-6 h-6 text-[#084734] shrink-0 mt-0.5"
                  strokeWidth={2.5}
                />
                <div>
                  <h4 className="font-bold text-base text-[#084734]">
                    {item.solutionTitle}
                  </h4>
                  <p className="text-sm text-[#0d4734]/85 mt-1">
                    {item.solutionDesc}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
