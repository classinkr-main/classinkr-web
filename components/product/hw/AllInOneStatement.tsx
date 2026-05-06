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

const opsEnergyModuleImage = "/images/product/hw/ops/ops-glass-energy-module-black.png"

export default function AllInOneStatement() {
  return (
    <section className="relative flex min-h-[660px] items-center overflow-hidden bg-[#010302] px-6 py-24 text-white md:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_77%_42%,rgba(31,170,104,0.19)_0%,rgba(7,34,21,0.22)_26%,transparent_58%),radial-gradient(ellipse_at_44%_76%,rgba(255,255,255,0.035)_0%,transparent_40%),linear-gradient(90deg,#010302_0%,#020504_44%,#030706_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black to-transparent" />

      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[64vw] lg:block">
        <Image
          src={opsEnergyModuleImage}
          alt=""
          fill
          sizes="64vw"
          priority={false}
          className="object-cover object-center opacity-95"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#010302_0%,rgba(1,3,2,0.94)_10%,rgba(1,3,2,0.48)_28%,transparent_52%,rgba(1,3,2,0.28)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_56%_50%,transparent_0%,transparent_46%,rgba(1,3,2,0.56)_82%,#010302_100%)]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl">
        <div
          className="relative mb-12 aspect-[16/9] w-full overflow-hidden lg:hidden"
          style={{
            WebkitMaskImage: "radial-gradient(ellipse at 62% 50%, #000 0%, #000 50%, rgba(0,0,0,0.72) 66%, transparent 86%)",
            maskImage: "radial-gradient(ellipse at 62% 50%, #000 0%, #000 50%, rgba(0,0,0,0.72) 66%, transparent 86%)",
          }}
        >
          <Image
            src={opsEnergyModuleImage}
            alt="ClassIn 로고가 빛나는 글래스모피즘 OPS 모듈이 전자칠판에 에너지를 전달하는 3D 비유 이미지"
            fill
            sizes="92vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(1,3,2,0.08)_0%,transparent_52%,rgba(1,3,2,0.5)_100%)]" />
        </div>

        <div className="max-w-[560px]">
          <p className="mb-4 text-xs font-semibold uppercase text-[#69F0B7]">
            THE BOARD IS THE COMPUTER
          </p>

          <h2 className="text-4xl font-bold leading-tight md:text-5xl lg:text-[3.5rem]">
            끊김 없는 수업을 위한
            <br />
            최고의 퍼포먼스
          </h2>

          <p className="mt-7 text-lg leading-relaxed text-white/[0.68]">
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
