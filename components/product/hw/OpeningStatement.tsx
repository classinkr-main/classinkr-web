"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const LABELS = [
  "OPS 내장",
  "AI 카메라",
  "4K 디스플레이",
  "0.03s 응답",
] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const transition = (delay: number) => ({
  duration: 0.6,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  delay,
});

export default function OpeningStatement() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });

  return (
    <section
      ref={ref}
      className="min-h-[80vh] bg-[#FAFAF8] flex items-center justify-center px-6 py-20"
    >
      <div className="max-w-5xl w-full mx-auto flex flex-col items-center text-center gap-10">
        {/* Heading block */}
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Line 1 */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0)}
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#111110]"
            style={{ lineHeight: 1.1, letterSpacing: "-2px" }}
          >
            교실에 두는 건 분필 한 자루입니다.
          </motion.p>

          {/* Line 2 — accent */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0.2)}
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#084734]"
            style={{ lineHeight: 1.1, letterSpacing: "-2px" }}
          >
            나머지는 보드 안에 들어 있습니다.
          </motion.p>

          {/* Line 3 */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0.4)}
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-[#111110]"
            style={{ lineHeight: 1.1, letterSpacing: "-2px" }}
          >
            PC, 카메라, 마이크, 그리고 소프트웨어까지.
          </motion.p>
        </div>

        {/* Labels row */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          transition={transition(0.65)}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
        >
          {LABELS.map((label, i) => (
            <span key={label} className="flex items-center gap-x-6">
              <span className="text-sm font-semibold tracking-wider text-[#615D59] uppercase">
                {label}
              </span>
              {i < LABELS.length - 1 && (
                <span
                  aria-hidden="true"
                  className="w-1 h-1 rounded-full bg-[#A39E98] inline-block"
                />
              )}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
