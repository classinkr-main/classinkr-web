"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const COMPARISON_ROWS = [
  { label: "일반 IFP", value: "80~120ms", highlight: false },
  { label: "고급 IFP", value: "30~50ms", highlight: false },
  { label: "ClassIn Board", value: "30ms", highlight: true },
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

            {/* SVG drawing animation */}
            <div className="absolute inset-0 flex items-center justify-center">
              <svg
                viewBox="0 0 320 240"
                width="75%"
                height="75%"
                aria-hidden="true"
              >
                {/* "0" stroke */}
                <motion.path
                  d="M 52 72 C 28 72, 20 96, 20 120 C 20 144, 28 168, 52 168 C 76 168, 84 144, 84 120 C 84 96, 76 72, 52 72 Z"
                  stroke="#6EE7B7"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: [0, 1, 1, 0], opacity: [0.9, 0.9, 0.9, 0] }}
                  transition={{
                    duration: 1.2,
                    times: [0, 0.55, 0.85, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    delay: 0,
                  }}
                />

                {/* "." dot */}
                <motion.circle
                  cx="100"
                  cy="160"
                  r="5"
                  stroke="#6EE7B7"
                  strokeWidth="5"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: [0, 1, 1, 0], opacity: [0.9, 0.9, 0.9, 0] }}
                  transition={{
                    duration: 0.3,
                    times: [0, 0.55, 0.85, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    delay: 0.55,
                  }}
                />

                {/* "0" second */}
                <motion.path
                  d="M 144 72 C 120 72, 112 96, 112 120 C 112 144, 120 168, 144 168 C 168 168, 176 144, 176 120 C 176 96, 168 72, 144 72 Z"
                  stroke="#6EE7B7"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: [0, 1, 1, 0], opacity: [0.9, 0.9, 0.9, 0] }}
                  transition={{
                    duration: 1.2,
                    times: [0, 0.55, 0.85, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    delay: 0.7,
                  }}
                />

                {/* "3" */}
                <motion.path
                  d="M 196 80 C 220 72, 240 90, 232 112 C 224 130, 204 128, 204 128 C 220 128, 244 142, 236 164 C 228 186, 200 176, 192 168"
                  stroke="#6EE7B7"
                  strokeWidth="6"
                  strokeLinecap="round"
                  fill="none"
                  initial={{ pathLength: 0, opacity: 0.9 }}
                  animate={{ pathLength: [0, 1, 1, 0], opacity: [0.9, 0.9, 0.9, 0] }}
                  transition={{
                    duration: 1.0,
                    times: [0, 0.55, 0.85, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatDelay: 0.6,
                    delay: 1.4,
                  }}
                />

                {/* Subtle grid lines in background for depth */}
                {[60, 120, 180].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    y1={y}
                    x2="320"
                    y2={y}
                    stroke="rgba(110,231,183,0.06)"
                    strokeWidth="1"
                  />
                ))}
                {[80, 160, 240].map((x) => (
                  <line
                    key={x}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="240"
                    stroke="rgba(110,231,183,0.06)"
                    strokeWidth="1"
                  />
                ))}
              </svg>
            </div>

            {/* Bottom label */}
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
            쓰는 순간 그려지는 압도적인
            <br />
            반응 속도 0.03초
          </motion.h2>

          {/* Body */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={copyInView ? "visible" : "hidden"}
            transition={{ duration: 0.6, ease: easing, delay: 0.24 }}
            className="text-lg text-[#615D59] mt-5 leading-relaxed"
          >
            따라오는 느낌이 아니라, 함께 움직이는 감각. 미세한 딜레이조차 느껴지지 않아 선생님의 판서 속도를 그대로 담아냅니다.
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
