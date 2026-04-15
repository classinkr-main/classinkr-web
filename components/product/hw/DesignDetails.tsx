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
    heading: "빛이 강해도 글씨가 묻히지 않습니다.",
    body: "AG(Anti-Glare) 코팅과 저반사 설계로 창가 자리와 뒷자리에서도 판서가 선명하게 보입니다.",
  },
  {
    image: "/images/product/hw/board/board-bezel-detail.png",
    alt: "ClassIn Board anti-fingerprint surface detail",
    heading: "손이 닿아도 금방 지저분해지지 않습니다.",
    body: "AF(Anti-Fingerprint) 마감으로 많은 학생이 만져도 흔적이 덜 남고, 수업 사이 청소 부담도 줄어듭니다.",
  },
  {
    image: "/images/product/hw/board/board-bezel-curve.png",
    alt: "ClassIn Board slim bezel detail",
    heading: "몰입을 방해하지 않는 베젤입니다.",
    body: "슬림 베젤과 정돈된 프레임 비율로 시선이 화면에 더 오래 머물고, 보드 자체가 덜 거슬립니다.",
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
          디테일이 수업의 질을 바꿉니다.
        </motion.h2>

        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0.2)}
          className="text-lg text-[#615D59] mt-5 max-w-2xl"
        >
          보드는 스펙보다 손과 눈이 먼저 반응합니다. 매일 쓰는 화면일수록 표면, 반사, 베젤의 차이가 크게 느껴집니다.
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
