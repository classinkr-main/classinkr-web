"use client"

import Image from "next/image"

const capabilities = [
  "i5 OPS 표준 탑재",
  "256GB SSD, 16GB RAM",
  "복잡한 어댑터 없는 간결한 전원",
  "HDMI 등 외부 기기 연결 불필요",
  "별도 PC 본체 공간이 필요 없는 일체형",
  "Window 기반 호환성 블록",
  "미러링 제공",
]

const opsEnergyModuleImage = "/images/product/hw/ops/ops-glass-energy-module-black.webp"

export default function AllInOneStatement() {
  return (
    <section className="relative isolate flex min-h-[660px] items-center overflow-hidden bg-[#010302] px-6 py-24 text-white md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_76%_42%,rgba(110,231,183,0.16)_0%,rgba(8,42,26,0.18)_30%,transparent_60%),radial-gradient(ellipse_at_42%_76%,rgba(255,255,255,0.035)_0%,transparent_42%),linear-gradient(90deg,#010302_0%,#020504_48%,#030706_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black via-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black via-black/70 to-transparent" />

      <div
        className="pointer-events-none absolute inset-y-0 right-[-6vw] hidden w-[72vw] lg:block"
        style={{
          WebkitMaskImage: "linear-gradient(90deg, transparent 0%, transparent 22%, rgba(0,0,0,0.18) 38%, rgba(0,0,0,0.72) 55%, #000 68%, #000 100%)",
          maskImage: "linear-gradient(90deg, transparent 0%, transparent 22%, rgba(0,0,0,0.18) 38%, rgba(0,0,0,0.72) 55%, #000 68%, #000 100%)",
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_58%_48%,rgba(110,231,183,0.16)_0%,rgba(110,231,183,0.06)_34%,transparent_66%)] blur-2xl" />
        <Image
          src={opsEnergyModuleImage}
          alt=""
          fill
          sizes="72vw"
          priority={false}
          className="object-cover object-center opacity-95 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#010302_0%,rgba(1,3,2,0.96)_11%,rgba(1,3,2,0.68)_25%,rgba(1,3,2,0.16)_48%,rgba(1,3,2,0.24)_76%,rgba(1,3,2,0.56)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_62%_52%,transparent_0%,transparent_43%,rgba(1,3,2,0.44)_76%,#010302_100%)]" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl">
        <div
          className="relative mb-12 aspect-[16/9] w-full overflow-hidden bg-[#010302] lg:hidden"
          style={{
            WebkitMaskImage: "radial-gradient(ellipse at 62% 50%, #000 0%, #000 48%, rgba(0,0,0,0.72) 66%, transparent 88%)",
            maskImage: "radial-gradient(ellipse at 62% 50%, #000 0%, #000 48%, rgba(0,0,0,0.72) 66%, transparent 88%)",
          }}
        >
          <Image
            src={opsEnergyModuleImage}
            alt="Classin 로고가 빛나는 글래스모피즘 OPS 모듈이 전자칠판에 에너지를 전달하는 3D 비유 이미지"
            fill
            sizes="92vw"
            className="object-cover opacity-95 mix-blend-screen"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,3,2,0.08)_0%,transparent_50%,rgba(1,3,2,0.58)_100%)]" />
        </div>

        <div className="max-w-[560px]">
          <p
            className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#6EE7B7]"
          >
            THE BOARD IS THE COMPUTER
          </p>

          <h2
            className="text-4xl font-bold leading-tight md:text-5xl lg:text-[3.5rem]"
            style={{ letterSpacing: "-1.5px" }}
          >
            끊김 없는 수업을 위한
            <br />
            최고의 퍼포먼스
          </h2>

          <p className="mt-7 text-lg leading-relaxed text-white/70">
            압도적 사양의 고성능 PC 내장
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-[14px] border border-white/[0.12] bg-white/[0.08] px-4 py-3 text-sm text-white/[0.78] backdrop-blur-sm"
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
