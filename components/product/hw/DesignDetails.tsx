"use client";

import { useRef } from "react";
import Image from "next/image";
import { motion, useInView } from "framer-motion";

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
    image: "/images/product/hw/display/display-coating.png",
    alt: "ClassIn Board anti-glare coating detail",
    heading: "밝은 교실에서도 선명합니다.",
    body: "AG 코팅과 높은 빛 투과율로 반사와 눈부심을 줄여, 앞자리와 뒷자리 모두 같은 화면을 볼 수 있습니다.",
  },
  {
    image: "/images/product/hw/board/board-bezel-detail.png",
    alt: "ClassIn Board anti-fingerprint surface detail",
    heading: "자주 정리하지 않아도 깔끔합니다.",
    body: "AF 마감으로 지문과 얼룩이 덜 남아 수업 사이 정리 시간이 줄어듭니다.",
  },
  {
    image: "/images/product/hw/board/board-bezel-curve.png",
    alt: "ClassIn Board slim bezel detail",
    heading: "시선이 화면에 오래 머뭅니다.",
    body: "슬림 베젤과 무광 프레임으로 시야 분산을 줄여 수업 집중도가 높아집니다.",
  },
] as const;

export default function DesignDetails() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });

  return (
    <section ref={ref} className="bg-white py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto">
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
          디테일은 조용하지만
          <br />
          수업은 분명히 달라집니다.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0.2)}
          className="text-lg text-[#615D59] mt-5 max-w-2xl"
        >
          반사, 얼룩, 시선 분산.
          작아 보이는 차이를 줄이는 것이 좋은 교실의 완성도를 만듭니다.
        </motion.p>

        <div className="mt-16 grid sm:grid-cols-2 md:grid-cols-3 gap-8">
          {CARDS.map(({ image, alt, heading, body }, i) => (
            <motion.div
              key={heading}
              variants={fadeUp}
              initial="hidden"
              animate={inView ? "visible" : "hidden"}
              transition={transition(0.3 + i * 0.15)}
              className="bg-[#FAFAF8] rounded-2xl border border-black/[0.08] overflow-hidden flex flex-col transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
            >
              <div className="relative aspect-square bg-gradient-to-br from-[#ECFDF5] to-[#F6F5F4]">
                <Image
                  src={image}
                  alt={alt}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>

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
