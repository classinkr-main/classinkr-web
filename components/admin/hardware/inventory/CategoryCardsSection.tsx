"use client"

import { memo } from "react"
import { Package } from "lucide-react"

import { formatNumber } from "./shared"
import StockAvailabilityGauge from "./StockAvailabilityGauge"

// 호출부가 넘기는 icon·tone(옛 아이콘 칩)은 렌더하지 않는다.
export interface CategoryCard {
  key: string
  label: string
  warehouse: number
  planned: number
  available: number
  count: number
  // 판촉(promoted) 라인 창고 재고 — 실판매 헤드라인과 분리 집계. 해당 라인이 없으면 null.
  promoted: number | null
  // 사무실 밖에 나간 샘플 유닛 수(유닛 정본, 원장 위치 잔량 아님). 없으면 칸을 숨긴다.
  samples?: number | null
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
    <section className="space-y-3" aria-labelledby="hardware-category-cards-title">
      <h2 id="hardware-category-cards-title" className="sr-only">제품군별 재고</h2>
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-4">
        {categoryCards.map((card) => {
          // 가용 0 이하(소진·예정 초과)만 앰버 외곽선 — 카드 단위 발주 기준선은 아직 없다.
          const short = card.available <= 0
          return (
            <article
              key={card.key}
              className={`flex min-w-0 flex-col gap-3.5 rounded-xl border bg-white p-5 ${short ? "border-[#C9973F]" : "border-[rgba(0,0,0,0.08)]"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h3 className="text-[15px] font-bold text-[#111110]">{card.label}</h3>
                {/* 음수 창고 = 원장 이상 신호 — Danger 텍스트로 즉시 드러낸다(정상은 중립 유지). */}
                <span className={`text-[13px] tabular-nums ${card.warehouse < 0 ? "font-semibold text-[#B43E3E]" : "text-[#615D59]"}`}>
                  창고 총 {formatNumber(card.warehouse)}대
                </span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-[#615D59]">가용</p>
                  <p className={`mt-0.5 text-[56px] font-bold leading-[0.95] tracking-[-0.04em] tabular-nums md:text-[64px] ${card.available < 0 ? "text-[#B43E3E]" : "text-[#111110]"}`}>
                    {formatNumber(card.available)}
                  </p>
                </div>
                <dl className="flex gap-4 text-right">
                  <div>
                    <dt className="text-[12px] font-semibold text-[#615D59]">예정</dt>
                    <dd className={`mt-0.5 text-[26px] font-bold leading-none tabular-nums ${card.planned > 0 ? "text-[#8A5A0E]" : "text-[#615D59]"}`}>
                      {formatNumber(card.planned)}
                    </dd>
                  </div>
                  {typeof card.samples === "number" ? (
                    <div>
                      <dt className="text-[12px] font-semibold text-[#615D59]">샘플</dt>
                      <dd className="mt-0.5 text-[26px] font-bold leading-none tabular-nums text-[#615D59]">{formatNumber(card.samples)}</dd>
                    </div>
                  ) : null}
                </dl>
              </div>
              <div className="mt-auto">
                <StockAvailabilityGauge
                  size="lg"
                  warehouse={card.warehouse}
                  available={card.available}
                  planned={card.planned}
                  annotation={card.promoted != null ? (
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        card.promoted < 0 ? "border-[#B43E3E] text-[#B43E3E]" : "border-[rgba(0,0,0,0.12)] text-[#615D59]"
                      }`}
                      title={
                        card.promoted < 0
                          ? "판촉형 라인 창고가 음수 — 원본 유형(판촉형 판정) 또는 시트 수치 점검 필요"
                          : "판촉형 라인 창고 재고 — 실판매 수치와 분리 집계"
                      }
                    >
                      판촉 {formatNumber(card.promoted)}
                      {card.promoted < 0 ? " · 점검" : ""}
                    </span>
                  ) : null}
                />
              </div>
            </article>
          )
        })}
      </div>
      {etcSummary && etcSummary.count > 0 && (
        <details><summary className="cursor-pointer text-[11px] text-[#615D59]">액세서리 · 기타 {etcSummary.count}종 · 창고 {formatNumber(etcSummary.warehouse)}대</summary><div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-4 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
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
            <span className="rounded-full border border-[#C9973F] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-[#8A5A0E]">
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
        </div></details>
      )}
    </section>
  )
}

export default memo(CategoryCardsSection)
