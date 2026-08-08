"use client"

import { memo } from "react"
import type { LucideIcon } from "lucide-react"

import { formatNumber } from "./shared"

interface CategoryCard {
  key: string
  label: string
  icon: LucideIcon
  tone: { bg: string; fg: string }
  warehouse: number
  planned: number
  available: number
  count: number
}

function CategoryCardsSection({ categoryCards }: { categoryCards: CategoryCard[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {categoryCards.map((card) => {
        const CardIcon = card.icon
        return (
          <div
            key={card.key}
            className="min-w-0 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">{card.label}</p>
                <p className="mt-2 flex items-baseline gap-1.5">
                  {/* 음수 창고 = 원장 이상 신호 — Danger 텍스트로 즉시 드러낸다(정상은 중립 유지). */}
                  <span className={`text-[28px] font-bold leading-none tracking-[-0.03em] tabular-nums ${card.warehouse < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
                    {formatNumber(card.warehouse)}
                  </span>
                  <span className="text-[13px] font-semibold text-[#615D59]">창고</span>
                </p>
              </div>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: card.tone.bg, color: card.tone.fg }}
              >
                <CardIcon className="h-[18px] w-[18px]" />
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {/* 상태색은 의미 있을 때만 — 예정 0은 중립으로 가라앉히고, 가용 음수는 Danger로 올린다. */}
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  card.planned > 0 ? "bg-[#FBF1E0] text-[#A8741A]" : "bg-[#F6F5F4] text-[#A39E98]"
                }`}
              >
                예정 {formatNumber(card.planned)}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  card.available < 0 ? "bg-[#FCE9E9] text-[#B43E3E]" : "bg-[#ECFDF5] text-[#084734]"
                }`}
              >
                가용 {formatNumber(card.available)}
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}

export default memo(CategoryCardsSection)
