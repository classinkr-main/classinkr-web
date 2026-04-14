"use client";

import { motion } from "framer-motion";
import { X, ArrowRight, Check } from "lucide-react";

const items = [
  {
    pain: "수업 전마다 PC와 주변 장비를 따로 연결해야 합니다.",
    solutionTitle: "OPS 내장 PC",
    solutionDesc: "보드 안에 i5/i7 PC가 있어 전원을 켜는 것만으로 수업을 시작할 수 있습니다.",
  },
  {
    pain: "강사가 움직일 때마다 화면 구도가 흔들리면 설명의 집중도도 함께 떨어집니다.",
    solutionTitle: "4K AI 트래킹 카메라",
    solutionDesc: "교사를 자동으로 따라가 수업 흐름을 안정적으로 기록합니다. 별도 조작이 거의 필요 없습니다.",
  },
  {
    pain: "필기 반응이 늦으면 설명은 자연스럽게 끊깁니다.",
    solutionTitle: "0.03s 응답 패널",
    solutionDesc: "손끝을 바로 따라와 디지털 장비를 의식하지 않고 설명을 이어갈 수 있습니다.",
  },
  {
    pain: "조명 반사와 자리별 시야 차이가 같은 교실 안의 수업 경험을 다르게 만듭니다.",
    solutionTitle: "AG 코팅 + 90% 투과율",
    solutionDesc: "반사와 눈부심을 줄여 어느 자리에서도 같은 화면을 또렷하게 볼 수 있습니다.",
  },
  {
    pain: "지문과 얼룩이 빠르게 쌓이면 수업 사이의 정리까지 일이 됩니다.",
    solutionTitle: "AF 마감",
    solutionDesc: "얼룩이 덜 남아 화면 관리에 쓰는 시간을 줄여줍니다.",
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
            className="text-4xl md:text-5xl text-[#111110] mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            작은 마찰이 줄어들수록,
            <br className="hidden md:block" />
            수업은 더 완성됩니다.
          </h2>
          <p className="text-lg text-[#615D59] mt-5 max-w-2xl">
            연결, 반사, 지연, 정리.
            매일 반복되는 번거로움을 줄이면 수업의 밀도와 운영의 안정감이 함께 올라갑니다.
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
