"use client";

import { motion, useInView } from "framer-motion";
import { Monitor, Camera, Layers, ArrowRight } from "lucide-react";
import { useRef } from "react";

const pillars = [
  {
    icon: Monitor,
    tag: "SMART BOARD",
    title: "판서는 끊기지 않고 이어집니다",
    desc: "50페이지 캔버스 위에 수업 흐름을 그대로 남깁니다. 쓰는 순간 학생 기기에도 같은 내용이 함께 반영됩니다.",
    accent: "bg-[#084734]",
    accentLight: "bg-[#ECFDF5]",
    accentText: "text-[#084734]",
  },
  {
    icon: Camera,
    tag: "AI CAMERA",
    title: "설명은 그대로 기록됩니다",
    desc: "4K AI 카메라가 교사를 자동으로 추적해 수업을 기록합니다. 끝나면 복습 가능한 영상으로 자연스럽게 이어집니다.",
    accent: "bg-[#084734]",
    accentLight: "bg-[#ECFDF5]",
    accentText: "text-[#084734]",
  },
  {
    icon: Layers,
    tag: "SW ECOSYSTEM",
    title: "복습은 수업의 흐름을 따라갑니다",
    desc: "판서 노트는 PDF로, 수업 영상은 LMS에 저장됩니다. 학생은 교실에서 듣던 흐름 그대로 다시 따라갈 수 있습니다.",
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
          <p className="text-sm font-semibold text-[#22A366] tracking-wider uppercase mb-3">
            CLASSROOM STUDIO
          </p>
          <h2 className="text-3xl md:text-4xl lg:text-5xl text-[#1a1a19] leading-tight">
            복잡한 장비 없이 Classin 하나로
            <br />
            <span className="text-[#22A366]">함께 작동할 때 교실이 완성됩니다.</span>
          </h2>
        </motion.div>

        {/* Subline */}
        <motion.p
          {...fadeUp}
          className="text-center text-lg md:text-xl text-[#615D59] max-w-2xl mx-auto mb-16 leading-relaxed"
        >
          판서, 기록, 저장, 공유가 하나의 흐름으로 이어질 때
          <br className="hidden sm:block" />
          수업의 완성도와 운영의 안정감이 함께 올라갑니다.
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
                className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-8 hover:shadow-lg hover:border-[#22A366]/20 transition-all duration-300 group"
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
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,_rgba(34,163,102,0.12)_0%,_transparent_100%)]" />
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
                수업이 끝나는 순간,
                <span className="text-[#6EE7B7]"> 판서와 영상이 함께 남습니다</span>
              </p>
              <p className="text-white/50 text-sm">
                따로 정리하고 업로드하지 않아도, 수업 직후 바로 복습 가능한 상태가 됩니다.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
