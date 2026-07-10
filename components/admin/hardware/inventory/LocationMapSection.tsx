"use client"

import type { Dispatch, SetStateAction } from "react"
import { ChevronDown } from "lucide-react"

import { formatNumber, QuickMoveButton } from "./shared"

interface LocationMapRow {
  itemId: string
  product: string
  sampleTotal: number
  cells: Array<{ label: string; qty: number; tone: string; pct: string }>
}

interface LocationMapData {
  locationTotals: Array<{ name: string; desc: string; quantity: number; tone: string; pct: string }>
  featuredRows: LocationMapRow[]
  restRows: LocationMapRow[]
}

interface LocationMapSectionProps {
  locationMap: LocationMapData
  locationMapExpanded: boolean
  setLocationMapExpanded: Dispatch<SetStateAction<boolean>>
  prepareQuickEntry: (itemId: string, presetKey: string) => void
}

export default function LocationMapSection({
  locationMap,
  locationMapExpanded,
  setLocationMapExpanded,
  prepareQuickEntry,
}: LocationMapSectionProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
        <p className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">재고 위치 맵</p>
        <p className="mt-1 text-[12px] text-[#615D59]">칠판(장비) 기준으로 창고 · 가용 · 예정 · 샘플(남은/나간)을 봅니다. 핵심 품목만 펼쳐 두고 나머지는 상세보기로.</p>
      </div>
      <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-[18px] lg:border-b-0 lg:border-r">
          <p className="text-[12px] font-bold text-[#111110]">위치별 총량</p>
          <div className="mt-3.5 flex flex-col gap-3">
            {locationMap.locationTotals.map((loc) => (
              <div key={loc.name}>
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span className="min-w-0 truncate font-semibold text-[#31302E]" title={loc.desc}>{loc.name}</span>
                  <span className="font-bold tabular-nums text-[#111110]">{formatNumber(loc.quantity)}대</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                  <div className="h-full rounded-full" style={{ backgroundColor: loc.tone, width: loc.pct }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            {[...locationMap.featuredRows, ...(locationMapExpanded ? locationMap.restRows : [])].map((row) => (
              <div
                key={row.itemId}
                className="grid grid-cols-[200px_minmax(0,1fr)_150px] items-center gap-4 border-t border-[rgba(0,0,0,0.06)] px-5 py-3.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <p title={row.product} className="truncate text-[13px] font-bold text-[#111110]">{row.product}</p>
                  {row.sampleTotal > 0 && (
                    <p className="mt-1 text-[11px] tabular-nums text-[#615D59]">샘플 총 {formatNumber(row.sampleTotal)}대</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-5">
                  {row.cells.map((cell) => (
                    <div key={cell.label} className="min-w-0">
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="truncate font-semibold text-[#615D59]">{cell.label}</span>
                        <span className="font-bold tabular-nums text-[#111110]">{formatNumber(cell.qty)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F6F5F4]">
                        <div className="h-full rounded-full" style={{ backgroundColor: cell.tone, width: cell.pct }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-1.5">
                  <QuickMoveButton kind="sale" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                  <QuickMoveButton kind="planned" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                  <QuickMoveButton kind="inbound" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                </div>
              </div>
            ))}
            {locationMap.restRows.length > 0 && (
              <div className="border-t border-[rgba(0,0,0,0.06)] px-5 py-2.5">
                <button
                  type="button"
                  onClick={() => setLocationMapExpanded((value) => !value)}
                  aria-expanded={locationMapExpanded}
                  className="inline-flex items-center gap-1 cursor-pointer rounded-md px-2 py-1 text-[12px] font-semibold text-[#615D59] transition hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                >
                  {locationMapExpanded ? "접기" : `상세보기 (${formatNumber(locationMap.restRows.length)}개 더)`}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${locationMapExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
            {locationMap.featuredRows.length === 0 && locationMap.restRows.length === 0 && (
              <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">재고 데이터가 없습니다.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
