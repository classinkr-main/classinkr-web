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
      className="min-h-[80vh] bg-[#FAFAF8] flex items-center justify-center px-6 py-24 md:py-32"
    >
      <div className="max-w-[88rem] w-full mx-auto flex flex-col items-center text-center gap-12">
        {/* Heading block */}
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Line 1 */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0)}
            className="text-[2rem] sm:text-4xl md:text-5xl lg:text-[3.75rem] xl:text-[4.25rem] font-bold tracking-tight text-[#111110]"
            style={{ lineHeight: 1.1, letterSpacing: "-0.045em" }}
          >
            선생님은 수업만 하세요.
          </motion.p>

          {/* Line 2 — accent */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0.2)}
            className="text-[2rem] sm:text-4xl md:text-5xl lg:text-[3.75rem] xl:text-[4.25rem] font-bold tracking-tight text-[#084734]"
            style={{ lineHeight: 1.1, letterSpacing: "-0.045em" }}
          >
            녹화도, 공유도, 기록도 —
          </motion.p>

          {/* Line 3 */}
          <motion.p
            variants={fadeUp}
            initial="hidden"
            animate={inView ? "visible" : "hidden"}
            transition={transition(0.4)}
            className="text-[2rem] sm:text-4xl md:text-5xl lg:text-[3.75rem] xl:text-[4.25rem] font-bold tracking-tight text-[#111110]"
            style={{ lineHeight: 1.1, letterSpacing: "-0.045em" }}
          >
            교실이 알아서 합니다.
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
