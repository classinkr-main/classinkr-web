"use client"

import { memo } from "react"

import type { CategoryCard } from "./CategoryCardsSection"
import { formatNumber } from "./shared"

type TotalsCard = Pick<CategoryCard, "key" | "available" | "warehouse" | "planned">

const ZERO = { available: 0, warehouse: 0, planned: 0 }
const COLOR_86 = "#084734"
const COLOR_75 = "#6E9C88"

// 전자칠판(86"·75") 헤드라인 — categoryCards.cards 의 숫자를 그대로 더한다(판촉 라인은 카드에서 이미 제외).
function HardwareTotalsBand({ cards }: { cards: readonly TotalsCard[] }) {
  const c86 = cards.find((card) => card.key === "ifp86") ?? ZERO
  const c75 = cards.find((card) => card.key === "ifp75") ?? ZERO
  const total = c86.available + c75.available
  const planned = c86.planned + c75.planned
  const warehouse = c86.warehouse + c75.warehouse
  // 막대는 음수를 0으로 막는다 — 숫자는 실제 값을 그대로 보여준다.
  const seg86 = Math.max(0, c86.available)
  const seg75 = Math.max(0, c75.available)
  const segTotal = seg86 + seg75
  const pct86 = segTotal > 0 ? Math.round((seg86 / segTotal) * 100) : 0
  const pct75 = segTotal > 0 ? 100 - pct86 : 0
  const tone = (value: number, normal = "text-[#111110]") => (value < 0 ? "text-[#B43E3E]" : normal)
  const barLabel = segTotal > 0
    ? `전자칠판 가용 ${formatNumber(total)}대 — 86인치 ${formatNumber(c86.available)}대 ${pct86}% · 75인치 ${formatNumber(c75.available)}대 ${pct75}%`
    : "가용 재고 없음"

  return (
    <section aria-label="전자칠판 합계" className="flex flex-col gap-5 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white px-5 py-5 lg:flex-row lg:items-center lg:px-6">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-7 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-[#615D59]">전자칠판 가용 합계</span>
          <p className="flex items-baseline gap-2">
            <span className={`text-[52px] font-bold leading-[0.95] tracking-[-0.04em] tabular-nums md:text-[80px] ${tone(total)}`}>{formatNumber(total)}</span>
            <span className="text-[18px] font-semibold text-[#615D59] md:text-[20px]">대</span>
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-[#615D59]">86&quot; / 75&quot;</span>
          <p className="text-[32px] font-bold leading-none tracking-[-0.02em] tabular-nums md:text-[36px]">
            <span className={tone(c86.available)}>{formatNumber(c86.available)}</span>
            <span className="mx-1.5 font-medium text-[#9A958F]">/</span>
            <span className={tone(c75.available)}>{formatNumber(c75.available)}</span>
          </p>
        </div>
        <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-2.5">
          <div role="img" aria-label={barLabel} title={barLabel} className="flex h-[18px] w-full overflow-hidden rounded-md bg-[#EFEDEA] md:h-5">
            {segTotal > 0 ? <>
              <span aria-hidden className="h-full" style={{ width: `${(seg86 / segTotal) * 100}%`, backgroundColor: COLOR_86 }} />
              <span aria-hidden className="h-full" style={{ width: `${(seg75 / segTotal) * 100}%`, backgroundColor: COLOR_75 }} />
            </> : null}
          </div>
          {segTotal > 0 ? (
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] tabular-nums text-[#31302E]">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: COLOR_86 }} />86&quot; {formatNumber(c86.available)}대 · {pct86}%</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: COLOR_75 }} />75&quot; {formatNumber(c75.available)}대 · {pct75}%</span>
            </p>
          ) : (
            <p className="text-[13px] font-semibold text-[#615D59]">가용 재고 없음</p>
          )}
        </div>
      </div>
      <dl className="flex gap-6 border-t border-[rgba(0,0,0,0.08)] pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <div className="flex flex-col gap-1">
          <dt className="text-[13px] font-semibold text-[#615D59]">배송 예정</dt>
          <dd className={`text-[32px] font-bold leading-none tabular-nums md:text-[36px] ${planned > 0 ? "text-[#8A5A0E]" : "text-[#615D59]"}`}>{formatNumber(planned)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[13px] font-semibold text-[#615D59]">창고 합계</dt>
          <dd className={`text-[32px] font-bold leading-none tabular-nums md:text-[36px] ${tone(warehouse, "text-[#615D59]")}`}>{formatNumber(warehouse)}</dd>
        </div>
      </dl>
    </section>
  )
}

export default memo(HardwareTotalsBand)
