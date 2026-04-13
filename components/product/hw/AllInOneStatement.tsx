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

const chips = ["i5 / i7 OPS", "전원 1개", "케이블 0개", "본체 불필요"]

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
            className="text-4xl md:text-5xl lg:text-6xl leading-tight font-bold"
            style={{ letterSpacing: "-1.5px" }}
          >
            보드 안에 PC가 있습니다.
          </h2>

          {/* Body */}
          <p className="text-lg text-white/70 leading-relaxed mt-6">
            OPS 슬롯 표준 규격으로 내장된 인텔 i5 / i7. 별도 본체, HDMI 케이블,
            어댑터가 없습니다. 전원 하나로 모든 게 켜집니다.
          </p>

          {/* Chips */}
          <div className="flex flex-wrap gap-3 mt-8">
            {chips.map((chip) => (
              <span
                key={chip}
                className="bg-white/5 border border-white/10 px-4 py-2 rounded-full text-sm text-white/80"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
