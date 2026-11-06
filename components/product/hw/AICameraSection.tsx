"use client";

import { motion } from "framer-motion";
import { Clapperboard, Crosshair, PenLine, Users, Video, ZoomIn } from "lucide-react";
import Image from "next/image";

const capabilities = [
  { icon: Crosshair, label: "강사 자동 추적 (T1)" },
  { icon: PenLine, label: "판서 클로즈업 (T1)" },
  { icon: Users, label: "학생 기립 인식 (S1)" },
  { icon: ZoomIn, label: "거리 자동 확대·축소 (S1)" },
  { icon: Video, label: "수업 녹화와 따로 저장" },
  { icon: Clapperboard, label: "다시보기에서 골라 보기" },
];

export default function AICameraSection() {
  return (
    <section id="ai-tracking-camera" aria-labelledby="ai-tracking-camera-title" className="scroll-mt-24 bg-[#050708] text-white py-24 md:py-32 px-6 overflow-hidden relative">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(13,26,18,0.95)_0%,rgba(5,7,8,1)_62%)]" />
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
        {/* Left copy */}
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6EE7B7]"
          >
            AI 추적 카메라 · 선택 구성
          </p>

          <h2
            id="ai-tracking-camera-title"
            className="text-4xl md:text-5xl lg:text-[3.5rem] mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            최소한의 인원으로
            <br />
            최고의 효율을
          </h2>

          <p className="text-lg text-white/70 mt-6 leading-relaxed">
            Classin Cam T1(강사 추적)·S1(학생 인식)은 보드와 따로 구성하는 카메라입니다.
            함께 구성하면 카메라 감독 없이 강사를 따라가는 현장 녹화를 남깁니다. 현장 녹화는
            녹화 옵션을 켠 수업에서 교실 입장 뒤 준비 시간이 지나면 시작하고, 영상은 수업이 끝난 뒤
            처리 시간을 거쳐 다시보기에 올라갑니다.
          </p>

          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {capabilities.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 text-[#6EE7B7] shrink-0" />
                <span className="text-sm text-white/85">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right visualization */}
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-6 md:-mx-10 lg:-mr-24"
        >
          <Image
            src="/images/product/hw/camera/camera-dual-premium-blended.webp"
            alt="Classin Cam AI 추적 카메라 클로즈업"
            width={1402}
            height={1122}
            sizes="(max-width: 1024px) 100vw, 58vw"
            className="w-full h-auto object-contain"
          />
        </motion.div>
      </div>
    </section>
  );
}
