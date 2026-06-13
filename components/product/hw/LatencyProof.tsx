"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const COMPARISON_ROWS = [
  { label: "일반 IFP", value: "80~120ms", highlight: false },
  { label: "고급 IFP", value: "30~50ms", highlight: false },
  { label: "Classin Board", value: "30ms", highlight: true },
  { label: "분필 (참고)", value: "0ms", highlight: false },
] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const easing: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function LatencyProof() {
  const vizRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);

  const vizInView = useInView(vizRef, { once: true, margin: "-10% 0px" });
  const copyInView = useInView(copyRef, { once: true, margin: "-10% 0px" });

  return (
    <section className="bg-[#F6F5F4] py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">

        {/* Left — visualization */}
        <motion.div
          ref={vizRef}
          variants={fadeIn}
          initial="hidden"
          animate={vizInView ? "visible" : "hidden"}
          transition={{ duration: 0.8, ease: easing }}
          className="order-first"
        >
          <div className="aspect-[4/3] rounded-3xl bg-[#0D1A12] overflow-hidden relative shadow-2xl">

            {/* Floating badge */}
            <div className="absolute top-5 right-5 z-10 bg-white/10 backdrop-blur rounded-full px-4 py-2 text-white text-xs font-medium">
              0.03s response
            </div>

            <Image
              src="/images/product/hw/latency/touch-latency.webp"
              alt="클래스인 보드 터치 딜레이 시각화"
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
            />

            {/* Bottom label */}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#0D1A12] via-[#0D1A12]/70 to-transparent" />
            <div className="absolute bottom-5 left-0 right-0 flex justify-center">
              <span className="text-[#6EE7B7]/60 text-xs tracking-widest uppercase font-medium">
                실시간 필기 응답
              </span>
            </div>
          </div>
        </motion.div>

        {/* Right — copy */}
        <div ref={copyRef} className="flex flex-col">

          {/* Eyebrow */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0 }}
            className="text-xs tracking-[0.2em] text-[#084734] font-semibold uppercase"
          >
            RESPONSE LATENCY
          </motion.p>

          {/* Heading */}
          <motion.h2
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0.12 }}
            className="text-4xl md:text-5xl lg:text-[3.4rem] text-[#111110] mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            판서는 언제나
            <br />
            생생하게 전달되어야 하기에
          </motion.h2>

          {/* Body */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0.24 }}
            className="text-lg text-[#615D59] mt-5 leading-relaxed"
          >
            미세한 터치 입력까지 놓치지 않고 즉시 화면에 반영해, 선생님의
            판서 리듬과 수업의 흐름을 끊김 없이 이어갑니다.
          </motion.p>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0.38 }}
            className="mt-8 rounded-2xl border border-black/[0.08] bg-white/70 px-5 py-4"
          >
            <p className="text-sm text-[#615D59]">
              육안으로 지연을 느낄 수 없는 한계점 0.1초.
            </p>
            <p className="mt-2 text-base font-bold text-[#084734]">
              클래스인 보드는 그 한계를 넘어선 0.03초
            </p>
          </motion.div>

          {/* Comparison table */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0.5 }}
            className="mt-8"
          >
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.label}
                className={`flex justify-between py-3 ${
                  i < COMPARISON_ROWS.length - 1
                    ? "border-b border-black/[0.08]"
                    : ""
                }`}
              >
                <span
                  className={
                    row.highlight
                      ? "text-[#084734] font-bold text-base"
                      : "text-[#615D59] text-base"
                  }
                >
                  {row.label}
                </span>
                <span
                  className={
                    row.highlight
                      ? "text-[#084734] font-bold text-base"
                      : "text-[#615D59] text-base"
                  }
                >
                  {row.value}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

      </div>
    </section>
  );
}
