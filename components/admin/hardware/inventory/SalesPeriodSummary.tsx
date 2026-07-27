"use client"

import { memo } from "react"

import { formatCurrency, formatNumber } from "./shared"

export interface SalesPeriodSummaryRow {
  granularity: "month" | "quarter" | "year"
  /** 블록 제목 — 이번 달 / 이번 분기 / 연간 */
  title: string
  /** 기간 라벨 — periodKey와 동일 규약("2026년 7월", "26-27 회계연도 2분기", "2026년") */
  label: string
  qty: number
  revenue: number
  hasRevenue: boolean
  prevTitle: string
  prevQty: number
  chips: Array<{ product: string; qty: number }>
}

interface SalesPeriodSummaryProps {
  summary: SalesPeriodSummaryRow[]
  onOpenDetail: () => void
}

// 홈 탭 판매·설치 요약 — 이번 달/이번 분기/올해 확정 출고를 한 카드에서 같이 본다.
// 상세(버킷 전체·고객사 펼침)는 입출고 탭 "출고 · 기간 집계"가 담당하고 여기는 현황판 역할만.
function SalesPeriodSummary({ summary, onOpenDetail }: SalesPeriodSummaryProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div>
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">판매 · 설치</p>
          <p className="mt-1 text-[12px] text-[#615D59]">확정 출고(샘플·수리 제외) 기준 · 매출은 실판매(USD) · 분기는 회계연도(4월 시작)</p>
        </div>
        <button
          type="button"
          onClick={onOpenDetail}
          className="-mx-2 cursor-pointer rounded px-2 py-1 text-[11px] font-bold text-[#084734] transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
        >
          기간별 상세 →
        </button>
      </div>
      <div className="grid divide-y divide-[rgba(0,0,0,0.06)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {summary.map((row) => (
          <div key={row.granularity} className="min-w-0 px-5 py-4">
            <p className="text-[11px] font-bold tracking-[0.04em] text-[#615D59]">
              {row.title}
              <span className="ml-1.5 font-semibold text-[#A39E98]">{row.label}</span>
            </p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[#111110]">{formatNumber(row.qty)}</span>
              <span className="text-[13px] font-semibold text-[#615D59]">대</span>
              <span className="ml-auto text-[13px] font-bold tabular-nums text-[#084734]">
                {row.hasRevenue ? formatCurrency(row.revenue, "USD") : "-"}
              </span>
            </p>
            <p className="mt-1.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
              {row.prevTitle} {formatNumber(row.prevQty)}대
            </p>
            {row.chips.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {row.chips.map((chip) => (
                  <span key={chip.product} className="inline-flex items-center gap-1 rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[10.5px] font-semibold text-[#31302E]">
                    {chip.product}
                    <span className="font-bold tabular-nums text-[#111110]">{formatNumber(chip.qty)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default memo(SalesPeriodSummary)
