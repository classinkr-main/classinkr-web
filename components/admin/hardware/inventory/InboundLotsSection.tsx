"use client"

import type { Dispatch, SetStateAction } from "react"
import { Search } from "lucide-react"

import {
  formatCurrency,
  formatNumber,
  type HardwareMovement,
} from "./shared"

interface InboundLot {
  lot: string
  displayLot: string
  date: string
  importer: string | null
  items: HardwareMovement[]
  totalQty: number
  totalAmount: number
  hasAmount: boolean
  totalCny: number
  hasCny: boolean
}

interface InboundLotsData {
  lots: InboundLot[]
  latestLot: InboundLot | null
  totalQty: number
  totalAmount: number
  hasAnyAmount: boolean
  totalCny: number
  hasAnyCny: boolean
}

interface InboundLotsSectionProps {
  inboundSearch: string
  setInboundSearch: Dispatch<SetStateAction<string>>
  inboundLots: InboundLotsData
}

export default function InboundLotsSection({ inboundSearch, setInboundSearch, inboundLots }: InboundLotsSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">입고 물량 (물량번호별)</p>
          <p className="mt-1 text-[12px] text-[#615D59]">한 물량번호(lot)에 여러 품목이 함께 입고됩니다. 물량번호·품목으로 검색하세요. 매입 단가는 USD 기준이며, 본사 책정 CNY(위안)를 기준점으로 병기합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A39E98]" />
            <input
              value={inboundSearch}
              onChange={(event) => setInboundSearch(event.target.value)}
              aria-label="입고 lot 검색"
              placeholder="물량번호·품목 검색"
              className="h-9 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-8 pr-3 text-[12.5px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 sm:w-[210px]"
            />
          </label>
          <div className="flex gap-5">
            <div className="text-right">
              <p className="text-[11px] font-semibold text-[#615D59]">총 입고 <span className="font-normal text-[#A39E98]">(86·75·T1)</span></p>
              <p className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{formatNumber(inboundLots.totalQty)}대</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold text-[#615D59]">총 매입액 <span className="font-normal text-[#A39E98]">(86·75·T1)</span></p>
              <p className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] tabular-nums text-[#084734]">
                {inboundLots.hasAnyAmount ? formatCurrency(inboundLots.totalAmount, "USD") : "-"}
              </p>
              {inboundLots.hasAnyCny ? (
                <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-[#A39E98]">{formatCurrency(inboundLots.totalCny, "CNY")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        {inboundLots.lots.map((lot) => (
          <div key={lot.lot} className="border-t border-[rgba(0,0,0,0.06)] px-5 py-4 first:border-t-0">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="inline-flex rounded-md bg-[#ECFDF5] px-2.5 py-1 text-[14px] font-bold tracking-[0.02em] text-[#084734]">{lot.displayLot}</span>
                <span className="text-[12px] text-[#615D59]">
                  {lot.date} · {lot.importer ?? "수입자 미상"} · {formatNumber(lot.items.length)}개 품목
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[12px] font-semibold text-[#615D59]">
                  총 <span className="font-bold tabular-nums text-[#111110]">{formatNumber(lot.totalQty)}대</span>
                </span>
                <span className="flex flex-col items-end leading-tight tabular-nums">
                  <span className="text-[13px] font-bold text-[#084734]">{lot.hasAmount ? formatCurrency(lot.totalAmount, "USD") : "-"}</span>
                  {lot.hasCny ? <span className="mt-0.5 text-[11px] font-semibold text-[#A39E98]">{formatCurrency(lot.totalCny, "CNY")}</span> : null}
                </span>
              </div>
            </div>
            <div className="mt-2.5 overflow-x-auto rounded-lg border border-[rgba(0,0,0,0.06)]">
              <div className="min-w-[520px]">
                <div className="grid grid-cols-[1.6fr_80px_110px_120px] gap-2.5 bg-[#F6F5F4] px-3.5 py-2 text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#615D59]">
                  <span>품목</span>
                  <span className="text-right">수량</span>
                  <span className="text-right">단가</span>
                  <span className="text-right">금액</span>
                </div>
                {lot.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1.6fr_80px_110px_120px] items-center gap-2.5 border-t border-[rgba(0,0,0,0.05)] px-3.5 py-2">
                    <span title={item.product_name} className="truncate text-[12.5px] font-semibold text-[#111110]">{item.product_name}</span>
                    <span className="text-right text-[13px] font-bold tabular-nums text-[#111110]">{formatNumber(item.quantity)}대</span>
                    <span className="flex flex-col items-end leading-tight tabular-nums">
                      <span className="text-[12px] text-[#615D59]">{item.unit_price != null ? formatCurrency(item.unit_price, "USD") : "-"}</span>
                      {item.amount_cny != null && item.quantity ? (
                        <span className="mt-0.5 text-[10.5px] text-[#A39E98]">{formatCurrency(item.amount_cny / item.quantity, "CNY")}</span>
                      ) : null}
                    </span>
                    <span className="flex flex-col items-end leading-tight tabular-nums">
                      <span className="text-[12.5px] font-bold text-[#084734]">{item.amount_usd != null ? formatCurrency(item.amount_usd, "USD") : "-"}</span>
                      {item.amount_cny != null ? (
                        <span className="mt-0.5 text-[10.5px] font-semibold text-[#A39E98]">{formatCurrency(item.amount_cny, "CNY")}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {inboundLots.lots.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">
            {inboundSearch.trim() ? "검색 결과가 없습니다." : "입고 기록이 없습니다. 빠른 기록에서 입고를 등록하거나 시트를 가져오세요."}
          </p>
        )}
      </div>
    </section>
  )
}
