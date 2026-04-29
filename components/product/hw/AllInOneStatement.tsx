"use client"

import Image from "next/image"

const capabilities = [
  "i5 OPS 표준 탑재",
  "256GB SSD, 16GB RAM",
  "복잡한 어댑터 없는 간결한 전원",
  "HDMI 등 외부 기기 연결 불필요",
  "별도 PC 본체 공간이 필요 없는 일체형",
]

const opsEnergyModuleImage = "/images/product/hw/ops/ops-glass-energy-module.png"

export default function AllInOneStatement() {
  return (
    <section className="relative overflow-hidden bg-[#050806] text-white py-24 md:py-32 px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_44%,rgba(34,163,102,0.24),transparent_30%),radial-gradient(circle_at_84%_68%,rgba(110,231,183,0.10),transparent_26%),linear-gradient(90deg,#050806_0%,#07110B_42%,#06140D_100%)]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgba(34,163,102,0.08),transparent)]" />

      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.92fr_1.08fr] gap-14 lg:gap-16 items-center">
        {/* Mobile: visual first */}
        <div className="order-first lg:order-last flex items-center justify-center lg:justify-end">
          <div className="relative w-full max-w-2xl py-8">
            <div className="pointer-events-none absolute inset-6 rounded-[2rem] bg-[#22A366]/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0B120E] shadow-[0_34px_90px_rgba(0,0,0,0.42)]">
              <div className="relative aspect-[16/9]">
                <Image
                  src={opsEnergyModuleImage}
                  alt="ClassIn 로고가 빛나는 글래스모피즘 OPS 모듈이 전자칠판에 에너지를 전달하는 3D 비유 이미지"
                  fill
                  sizes="(max-width: 768px) 92vw, 54vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_52%,transparent_0%,transparent_46%,rgba(5,8,6,0.32)_100%)]" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px] font-semibold text-white/52">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">PC 본체 없음</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">어댑터 없음</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">HDMI 불필요</span>
            </div>
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
