"use client"

import { memo } from "react"
import type { Dispatch, SetStateAction } from "react"
import { History, PackagePlus, Search } from "lucide-react"

import ExportActions from "./ExportActions"
import { buildInboundLotsExportRows, buildLotCompositionRows } from "./hardware-export"

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
  // 핵심 3종(86·75·T1) 밖의 품목(A1·OPS·케이블 등)까지 포함한 전 품목 입고 대수 —
  // 헤더 집계에서 어떤 품목도 안 보이게 사라지지 않도록 병기한다.
  totalQtyAll: number
  totalAmount: number
  hasAnyAmount: boolean
  totalCny: number
  hasAnyCny: boolean
}

interface InboundLotsSectionProps {
  inboundSearch: string
  setInboundSearch: Dispatch<SetStateAction<string>>
  inboundLots: InboundLotsData
  // lot 허브(하드웨어 라운드 2 E-2) — 카드에서 내역(lot 필터)으로, 같은 물량에 추가 입고로 한 번에 간다.
  onShowLotHistory?: (lot: string) => void
  onAddToLot?: (lot: string) => void
  canWrite?: boolean
}

const CARD_ACTION_CLASS =
  "inline-flex cursor-pointer items-center gap-1 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 py-1 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:pointer-events-none disabled:opacity-50"

function InboundLotsSection({ inboundSearch, setInboundSearch, inboundLots, onShowLotHistory, onAddToLot, canWrite = true }: InboundLotsSectionProps) {
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
              placeholder="물량번호·품목·수입자 검색"
              className="h-9 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-8 pr-3 text-[12.5px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 sm:w-[210px]"
            />
          </label>
          {/* 보이는(검색된) lot 의 품목 줄 전체를 가져간다(하드웨어 라운드 2 E-3). */}
          <ExportActions
            subject="입고 물량"
            fileBaseName="하드웨어_입고물량"
            rowCount={inboundLots.lots.length}
            buildRows={() => buildInboundLotsExportRows(inboundLots.lots)}
            showCopy={false}
            size="xs"
          />
          <div className="flex gap-5">
            <div className="text-right">
              <p className="text-[11px] font-semibold text-[#615D59]">총 입고 <span className="font-normal text-[#A39E98]">(86·75·T1)</span></p>
              <p className="mt-0.5 text-[17px] font-bold tracking-[-0.02em] tabular-nums text-[#111110]">{formatNumber(inboundLots.totalQty)}대</p>
              {inboundLots.totalQtyAll > inboundLots.totalQty && (
                <p className="mt-0.5 text-[11.5px] font-semibold tabular-nums text-[#A39E98]">전 품목 {formatNumber(inboundLots.totalQtyAll)}대</p>
              )}
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
              <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  {/* 구성 복사 = 입고표 붙여넣기 형식(품목·수량·단가) — 되돌려 붙이면 같은 구성이 된다. */}
                  <ExportActions
                    subject={`${lot.displayLot} 구성`}
                    fileBaseName={`하드웨어_${lot.displayLot}_구성`}
                    rowCount={lot.items.length}
                    buildRows={() => buildLotCompositionRows(lot)}
                    showCsv={false}
                    size="xs"
                  />
                  {onShowLotHistory ? (
                    <button type="button" onClick={() => onShowLotHistory(lot.lot)} className={CARD_ACTION_CLASS} aria-label={`${lot.displayLot} 내역 보기`}>
                      <History className="h-3.5 w-3.5" aria-hidden />
                      내역
                    </button>
                  ) : null}
                  {onAddToLot ? (
                    <button
                      type="button"
                      onClick={() => onAddToLot(lot.lot)}
                      disabled={!canWrite}
                      title={canWrite ? "이 물량번호로 입고표를 엽니다" : "읽기 권한 계정은 입고할 수 없습니다"}
                      className={CARD_ACTION_CLASS}
                      aria-label={`${lot.displayLot}에 추가 입고`}
                    >
                      <PackagePlus className="h-3.5 w-3.5" aria-hidden />
                      추가 입고
                    </button>
                  ) : null}
                </span>
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

export default memo(InboundLotsSection)
