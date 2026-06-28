"use client"

import { motion } from "framer-motion"
import { GraduationCap, Users, Building2, Globe2 } from "lucide-react"

const SCALE = [
  { value: "3,000만+", label: "월간 수업", icon: GraduationCap },
  { value: "5,000만+", label: "교사 · 학습자", icon: Users },
  { value: "6만+", label: "교육기관", icon: Building2 },
  { value: "160+", label: "서비스 국가", icon: Globe2 },
]

export function GlobalScale() {
  return (
    <section className="border-y border-[rgba(0,0,0,0.06)] bg-[#ECFDF5] py-20 md:py-28">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mb-14 max-w-2xl text-center"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[#084734]">
            Global Scale
          </p>
          <h2 className="text-3xl font-bold leading-tight tracking-[-1px] text-[#111110] md:text-[40px]">
            전 세계가 클래스인으로 수업합니다
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4A6B5C]">
            클래스인은 글로벌 에듀테크 유니콘 EEO(Empower Education Online)가 만든 교육 플랫폼입니다.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-[rgba(8,71,52,0.10)] bg-[rgba(8,71,52,0.10)] lg:grid-cols-4">
          {SCALE.map((s, i) => {
            const Icon = s.icon
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center bg-white px-4 py-10 text-center"
              >
                <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ECFDF5] text-[#084734]">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <div className="text-[40px] font-bold leading-none tracking-[-1.5px] text-[#084734] md:text-[44px]">
                  {s.value}
                </div>
                <div className="mt-2.5 text-[13px] font-medium text-[#615D59]">{s.label}</div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
