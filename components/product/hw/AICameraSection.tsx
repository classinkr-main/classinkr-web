"use client";

import { motion } from "framer-motion";
import { Crosshair, ZoomIn, PenLine, Users } from "lucide-react";
import Image from "next/image";

const capabilities = [
  { icon: Crosshair, label: "교사 자동 추적" },
  { icon: ZoomIn, label: "자동 줌·프레이밍" },
  { icon: PenLine, label: "판서 중심 화면" },
  { icon: Users, label: "교실·원격 동시 대응" },
  { icon: Crosshair, label: "수업 영상 자동 저장" },
  { icon: ZoomIn, label: "복습 링크 빠른 공유" },
];

export default function AICameraSection() {
  return (
    <section className="bg-[#050708] text-white py-24 md:py-32 px-6 overflow-hidden relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_66%_45%,rgba(110,231,183,0.08),transparent_34%),linear-gradient(90deg,rgba(13,26,18,0.95)_0%,rgba(5,7,8,1)_62%)]" />
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-16 items-center">
        {/* Left copy */}
        <div>
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-[#6EE7B7]"
          >
            BUILT-IN AI TRACKING
          </p>

          <h2
            className="text-4xl md:text-5xl lg:text-[3.5rem] mt-4 leading-tight"
            style={{ letterSpacing: "-1.5px" }}
          >
            설명은 지나가도,
            <br />
            수업은 남습니다.
          </h2>

          <p className="text-lg text-white/70 mt-6 leading-relaxed">
            보드 상단 4K AI 카메라가 교사를 자동으로 추적해 수업 전체를 기록합니다.
            별도 장비나 보조 인력 없이도, 복습 가능한 수업이 자연스럽게 완성됩니다.
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
            src="/images/product/hw/camera/camera-dual-premium-blended.png"
            alt="ClassIn Board AI 트래킹 카메라 클로즈업"
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
