"use client";

import { motion, useInView } from "framer-motion";
import { Monitor, Camera, Layers, ArrowRight } from "lucide-react";
import { useRef } from "react";

const pillars = [
  {
    icon: Monitor,
    tag: "SMART BOARD",
    title: "50페이지 무한 판서",
    desc: "지우지 않고 넘기세요. 50페이지 캔버스에 공간 걱정 없이 수업하고, 쓰는 즉시 전 학생 기기에 실시간 동기화됩니다.",
    accent: "bg-[#084734]",
    accentLight: "bg-[#ECFDF5]",
    accentText: "text-[#084734]",
  },
  {
    icon: Camera,
    tag: "AI CAMERA",
    title: "수업 영상, 자동으로 완성",
    desc: "4K AI 카메라가 교사를 자동 추적하며 수업을 녹화합니다. 수업이 끝나는 순간, 편집 없이 수업 영상이 즉시 업로드됩니다.",
    accent: "bg-[#084734]",
    accentLight: "bg-[#ECFDF5]",
    accentText: "text-[#084734]",
  },
  {
    icon: Layers,
    tag: "SW ECOSYSTEM",
    title: "판서 + 영상, 한 번에 복습",
    desc: "50페이지 판서 노트는 PDF로, 수업 영상은 LMS에 자동 저장. 학생은 수업 직후부터 영상과 판서를 동시에 복습합니다.",
    accent: "bg-[#084734]",
    accentLight: "bg-[#ECFDF5]",
    accentText: "text-[#084734]",
  },
];

const fadeUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6 },
};

export default function ClassroomStudioSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-24 md:py-32 bg-white" ref={ref}>
      <div className="container mx-auto px-4 lg:px-8">
        {/* Header */}
        <motion.div className="text-center mb-8" {...fadeUp}>
          <p className="text-sm font-semibold text-[#084734] tracking-wider uppercase mb-3">
            CLASSROOM STUDIO
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
            보드, 카메라, 소프트웨어.
            <br />
            <span className="text-[#084734]">하나의 수업 스튜디오</span>가 됩니다.
          </h2>
        </motion.div>

        {/* Subline */}
        <motion.p
          {...fadeUp}
          className="text-center text-lg md:text-xl text-[#615D59] max-w-2xl mx-auto mb-16 leading-relaxed"
        >
          수업이 끝나는 순간, 판서 노트와 수업 영상이 동시에 올라갑니다.
          <br className="hidden sm:block" />{" "}
          필기 대신 수업에 집중하세요 — 기록은 시스템이 합니다.
        </motion.p>

        {/* Three pillars */}
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 40 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-8 hover:shadow-lg hover:border-[#084734]/20 transition-all duration-300 group"
              >
                <div className={`w-12 h-12 rounded-xl ${p.accentLight} flex items-center justify-center mb-5 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-6 h-6 ${p.accentText}`} />
                </div>
                <div className="text-[10px] font-bold text-[#A39E98] uppercase tracking-[0.15em] mb-3">
                  {p.tag}
                </div>
                <h3 className="text-xl font-bold text-[#111110] mb-3 leading-snug">
                  {p.title}
                </h3>
                <p className="text-sm text-[#615D59] leading-relaxed">
                  {p.desc}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Synergy flow — horizontal connector */}
        <motion.div
          {...fadeUp}
          className="max-w-3xl mx-auto"
        >
          <div className="rounded-2xl bg-[#0d1a12] p-8 md:p-10 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,_rgba(110,231,183,0.12)_0%,_transparent_100%)]" />
            <div className="relative">
              {/* Flow icons */}
              <div className="flex items-center justify-center gap-3 md:gap-5 mb-6">
                {[
                  { icon: Monitor, label: "판서" },
                  { icon: Camera, label: "영상" },
                  { icon: Layers, label: "LMS" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 md:gap-5">
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">
                        <item.icon className="w-5 h-5 text-[#6EE7B7]" />
                      </div>
                      <span className="text-[10px] text-white/40 font-medium">{item.label}</span>
                    </div>
                    {i < 2 && (
                      <ArrowRight className="w-4 h-4 text-[#6EE7B7]/40 shrink-0" />
                    )}
                  </div>
                ))}
              </div>

              <p className="text-white text-lg md:text-xl font-bold leading-snug mb-2">
                수업 종료 → 판서 PDF + 수업 영상
                <span className="text-[#6EE7B7]"> 동시 업로드</span>
              </p>
              <p className="text-white/50 text-sm">
                별도 편집도, 수동 업로드도 필요 없습니다. 시스템이 알아서 합니다.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
