"use client"

import Link from "next/link"
import { TONE, type Tone } from "./theme"

// 세일즈 퍼널을 숫자 타일이 아닌 비례 막대 시각화로. 순수 CSS(Recharts 미사용).

export interface FunnelStage {
  label: string
  value: number
  tone?: Tone
  href?: string
}

export function MiniFunnel({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.value))
  return (
    <div className="space-y-3">
      {stages.map((stage, i) => {
        const width = Math.max(6, Math.round((stage.value / max) * 100))
        const prev = i > 0 ? stages[i - 1].value : null
        const conv = prev && prev > 0 ? Math.round((stage.value / prev) * 100) : null
        const tone: Tone = stage.tone ?? "brand"
        const inner = (
          <>
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-[12px] font-medium text-[#111110]">{stage.label}</span>
              <span className="text-[14px] font-bold tabular-nums tracking-[-0.02em] text-[#111110]">
                {stage.value.toLocaleString()}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#f0f0ec]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${width}%`, background: TONE[tone].fg, opacity: 1 - i * 0.14 }}
              />
            </div>
            {conv != null && <p className="mt-1 text-[10px] text-[#1a1a1a]/40">이전 단계 대비 {conv}% 전환</p>}
          </>
        )
        return stage.href ? (
          <Link
            key={stage.label}
            href={stage.href}
            className="block rounded-lg transition-opacity hover:opacity-90"
          >
            {inner}
          </Link>
        ) : (
          <div key={stage.label}>{inner}</div>
        )
      })}
    </div>
  )
}
