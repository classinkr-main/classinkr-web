"use client"

import { memo } from "react"
import { Package, type LucideIcon } from "lucide-react"

import { formatNumber } from "./shared"
import StockAvailabilityGauge from "./StockAvailabilityGauge"

interface CategoryCard {
  key: string
  label: string
  icon: LucideIcon
  tone: { bg: string; fg: string }
  warehouse: number
  planned: number
  available: number
  count: number
  // 판촉(promoted) 라인 창고 재고 — 실판매 헤드라인과 분리 집계. 해당 라인이 없으면 null.
  promoted: number | null
}

// 4축 카드에 안 잡히는 나머지(액세서리·비주력 보드 등) 요약 — 어떤 품목도 화면에서 사라지지 않게
// 카드 합계 + 기타 스트립 = 전체 재고가 되도록 잔여 전부를 모은다.
export interface EtcStockSummary {
  warehouse: number
  planned: number
  available: number
  count: number
  chips: Array<{ label: string; qty: number }>
}

function CategoryCardsSection({ categoryCards, etcSummary }: { categoryCards: CategoryCard[]; etcSummary: EtcStockSummary | null }) {
  return (
    <section className="space-y-3" aria-label="제품군별 재고">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-bold text-[#111110]">제품군별 재고</h2>
        <p className="text-[11px] text-[#615D59]">녹색 가용 · 황색 예정 · 적색 예정 초과</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {categoryCards.map((card) => {
          const CardIcon = card.icon
          return (
            <div
              key={card.key}
              className="flex min-w-0 flex-col rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-[#31302E]">{card.label}</p>
                  <p className="mt-3 flex flex-wrap items-baseline gap-1.5">
                    {/* 음수 창고 = 원장 이상 신호 — Danger 텍스트로 즉시 드러낸다(정상은 중립 유지). */}
                    <span className={`text-[40px] font-bold leading-none tracking-[-0.04em] tabular-nums ${card.warehouse < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
                      {formatNumber(card.warehouse)}
                    </span>
                    <span className="text-[12px] font-semibold text-[#615D59]">대 · 창고</span>
                  </p>
                </div>
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: card.tone.bg, color: card.tone.fg }}
                >
                  <CardIcon className="h-[18px] w-[18px]" />
                </span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[11px] text-[#615D59]">가용</dt>
                  <dd className={`mt-1 text-[20px] font-bold tabular-nums ${card.available < 0 ? "text-[#B43E3E]" : "text-[#084734]"}`}>
                    {formatNumber(card.available)}<span className="ml-1 text-[11px] font-medium">대</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[#615D59]">예정 출고</dt>
                  <dd className={`mt-1 text-[20px] font-bold tabular-nums ${card.planned > 0 ? "text-[#A8741A]" : "text-[#615D59]"}`}>
                    {formatNumber(card.planned)}<span className="ml-1 text-[11px] font-medium">대</span>
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex min-h-5 flex-wrap gap-1.5">
                {/* 판촉 라인은 헤드라인과 분리 — 합산하면 promoted 원장 이상(음수)이 실판매 수치를
                    오염시킨다(STD1 35 + 판촉 −16 = 19로 보이던 문제). 음수는 점검 신호로 올린다. */}
                {card.promoted != null && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      card.promoted < 0 ? "bg-[#FCE9E9] text-[#B43E3E]" : "bg-[#F6F5F4] text-[#615D59]"
                    }`}
                    title={
                      card.promoted < 0
                        ? "판촉(promoted) 라인 창고가 음수 — 원장 유형(promoted 판정) 또는 시트 수치 점검 필요"
                        : "판촉(promoted) 라인 창고 재고 — 실판매 수치와 분리 집계"
                    }
                  >
                    판촉 {formatNumber(card.promoted)}
                    {card.promoted < 0 ? " · 점검" : ""}
                  </span>
                )}
              </div>
              <div className="mt-auto pt-4">
                <StockAvailabilityGauge warehouse={card.warehouse} available={card.available} planned={card.planned} />
              </div>
            </div>
          )
        })}
      </div>
      {etcSummary && etcSummary.count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#615D59]">
            <Package className="h-4 w-4" />
          </span>
          <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">
            액세서리 · 기타 <span className="font-semibold text-[#A39E98]" title="위치맵에서 숨긴 내부 코드(A1·B1·D2)도 이 합계에는 포함됩니다">· 내부 코드 포함</span>
          </p>
          <p className="text-[12.5px] font-bold tabular-nums text-[#111110]">
            창고 {formatNumber(etcSummary.warehouse)}대
            <span className="ml-1 font-semibold text-[#A39E98]">· {formatNumber(etcSummary.count)}종</span>
          </p>
          {etcSummary.planned > 0 && (
            <span className="rounded-full bg-[#FBF1E0] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#A8741A]">
              예정 {formatNumber(etcSummary.planned)}
            </span>
          )}
          <span className="hidden h-4 w-px bg-[rgba(0,0,0,0.08)] sm:block" aria-hidden />
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            {etcSummary.chips.map((chip) => (
              <span key={chip.label} className="rounded-full bg-[#F6F5F4] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                {chip.label} {formatNumber(chip.qty)}
              </span>
            ))}
          </span>
        </div>
      )}
    </section>
  )
}

export default memo(CategoryCardsSection)
