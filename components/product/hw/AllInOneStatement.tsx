"use client"

import { motion, useInView } from "framer-motion"
import { useRef } from "react"

const layers = [
  {
    label: "AG/AF Coating",
    highlight: false,
    gradient: "from-white/10 to-white/5",
  },
  {
    label: "4K Display Panel",
    highlight: false,
    gradient: "from-white/10 to-white/5",
  },
  {
    label: "Touch Layer (50pt)",
    highlight: false,
    gradient: "from-white/10 to-white/5",
  },
  {
    label: "OPS PC (i5/i7)",
    highlight: true,
    gradient: "from-[#084734]/80 to-[#065c41]/60",
  },
  {
    label: "AI Camera + Mic Array",
    highlight: false,
    gradient: "from-white/10 to-white/5",
  },
  {
    label: "Speaker × 2",
    highlight: false,
    gradient: "from-white/10 to-white/5",
  },
]

const capabilities = [
  "i5 OPS 표준 탑재",
  "256GB SSD, 16GB RAM",
  "복잡한 어댑터 없는 간결한 전원",
  "HDMI 등 외부 기기 연결 불필요",
  "별도 PC 본체 공간이 필요 없는 일체형",
]

function LayerStack() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-80px" })

  return (
    <div
      ref={ref}
      className="flex flex-col gap-3 w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto"
      style={{ transform: "skewY(-3deg)" }}
    >
      {layers.map((layer, i) => (
        <motion.div
          key={layer.label}
          initial={{ opacity: 0, x: -40 }}
          animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -40 }}
          transition={{ duration: 0.45, delay: i * 0.1, ease: "easeOut" }}
          className="flex items-center gap-4"
        >
          {/* Layer bar */}
          <div
            className={`flex-1 h-[22px] rounded-md bg-gradient-to-r ${layer.gradient} border ${
              layer.highlight ? "border-[#084734]" : "border-white/15"
            }`}
          />
          {/* Label */}
          <span
            className={`text-xs font-medium w-[160px] shrink-0 ${
              layer.highlight ? "text-[#6EE7B7]" : "text-white/60"
            }`}
            style={{ letterSpacing: "0.02em" }}
          >
            {layer.label}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

export default function AllInOneStatement() {
  return (
    <section className="bg-[#0D1A12] text-white py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
        {/* Mobile: diagram first */}
        <div className="order-first lg:order-last flex items-center justify-center lg:justify-end">
          <div className="w-full aspect-square max-w-xs sm:max-w-sm flex items-center">
            <LayerStack />
          </div>
        </div>

        {/* Left copy */}
        <div className="order-last lg:order-first">
          {/* Eyebrow */}
          <p
            className="text-xs tracking-[0.2em] text-[#6EE7B7] font-semibold mb-4 uppercase"
          >
            THE BOARD IS THE COMPUTER
          </p>

          {/* Heading */}
          <h2
            className="text-4xl md:text-5xl lg:text-[3.5rem] leading-tight font-bold"
            style={{ letterSpacing: "-1.5px" }}
          >
            끊김 없는 수업을 위한
            <br />
            최고의 퍼포먼스
          </h2>

          {/* Body */}
          <p className="text-lg text-white/70 leading-relaxed mt-6">
            압도적 사양의 고성능 PC 내장
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80"
              >
                {capability}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
