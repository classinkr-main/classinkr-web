"use client"

import type { Dispatch, SetStateAction } from "react"
import { Search } from "lucide-react"

import {
  formatDate,
  formatLotLabel,
  formatNumber,
  QuickMoveButton,
  todayKey,
  type HardwareMovement,
  type HardwareMovementType,
  type HardwareStockRow,
  type HardwareTab,
  type ProductFilterKey,
} from "@/components/admin/hardware/HardwareInventoryClient"

interface HardwareSearchResults {
  products: HardwareStockRow[]
  lots: Array<{ lot: string; total: number; products: string[]; rank: number | null }>
  planned: HardwareMovement[]
  customers: Array<{ customer: string; planned: number; outbound: number; lastDate: string | null }>
}

interface HardwareSearchPanelProps {
  hardwareSearch: string
  setHardwareSearch: Dispatch<SetStateAction<string>>
  hardwareSearchResults: HardwareSearchResults | null
  prepareQuickEntry: (itemId: string, presetKey: string) => void
  setActiveTab: Dispatch<SetStateAction<HardwareTab>>
  setHistoryType: Dispatch<SetStateAction<HardwareMovementType | "all" | "sample">>
  setProductFilter: Dispatch<SetStateAction<ProductFilterKey>>
  setCustomerFilter: Dispatch<SetStateAction<string>>
  setSearch: Dispatch<SetStateAction<string>>
  setLotFilter: Dispatch<SetStateAction<string>>
  setMovementsPage: Dispatch<SetStateAction<number>>
  confirmPlannedMovement: (movement: HardwareMovement, override?: { quantity?: number; occurredAt?: string }) => Promise<void>
  plannedConfirmLocked: boolean
  setCustomerDetail: Dispatch<SetStateAction<string | null>>
}

export default function HardwareSearchPanel({
  hardwareSearch,
  setHardwareSearch,
  hardwareSearchResults,
  prepareQuickEntry,
  setActiveTab,
  setHistoryType,
  setProductFilter,
  setCustomerFilter,
  setSearch,
  setLotFilter,
  setMovementsPage,
  confirmPlannedMovement,
  plannedConfirmLocked,
  setCustomerDetail,
}: HardwareSearchPanelProps) {
  return (
    <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A39E98]" />
            <input
              value={hardwareSearch}
              onChange={(event) => setHardwareSearch(event.target.value)}
              aria-label="하드웨어 통합 검색"
              placeholder="제품·lot·고객·담당자 검색"
              className="h-11 w-full rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] pl-9 pr-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["부족 품목", "오늘 출고", "오래된 lot", "내 담당"].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setHardwareSearch(chip)}
                aria-pressed={hardwareSearch === chip}
                className="cursor-pointer rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1 text-[11px] font-bold text-[#615D59] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                {chip}
              </button>
            ))}
            {hardwareSearch && (
              <button
                type="button"
                onClick={() => setHardwareSearch("")}
                className="cursor-pointer rounded-full px-2.5 py-1 text-[11px] font-bold text-[#A39E98] transition hover:bg-[#F6F5F4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
              >
                검색 초기화
              </button>
            )}
          </div>
        </div>
        <div className="text-[12px] font-semibold text-[#615D59] lg:text-right">
          <p>자주 묻는 질문형 검색</p>
          <p className="mt-0.5 text-[#A39E98]">예: H8, 카메라, 86 재고, OO학원 출고</p>
        </div>
      </div>

      {hardwareSearchResults && (
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
            <p className="text-[12px] font-bold text-[#111110]">제품</p>
            <div className="mt-2 space-y-2">
              {hardwareSearchResults.products.length === 0 ? (
                <p className="text-[11px] text-[#A39E98]">결과 없음</p>
              ) : hardwareSearchResults.products.map((row) => (
                <div key={row.itemId} className="rounded-md bg-white px-2.5 py-2">
                  <p className="truncate text-[12px] font-bold text-[#111110]">{row.product}</p>
                  <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                    가용 {formatNumber(row.availableStock)} · 예정 {formatNumber(row.plannedOut)} · 창고 {formatNumber(row.warehouseStock)}
                  </p>
                  <div className="mt-1.5 flex gap-1">
                    <QuickMoveButton kind="sale" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                    <QuickMoveButton kind="planned" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                    <QuickMoveButton kind="inbound" product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
            <p className="text-[12px] font-bold text-[#111110]">Lot</p>
            <div className="mt-2 space-y-2">
              {hardwareSearchResults.lots.length === 0 ? (
                <p className="text-[11px] text-[#A39E98]">결과 없음</p>
              ) : hardwareSearchResults.lots.map((lot) => (
                <button
                  key={lot.lot}
                  type="button"
                  onClick={() => {
                    setActiveTab("history")
                    setHistoryType("all")
                    setProductFilter("")
                    setCustomerFilter("")
                    setSearch("")
                    setLotFilter(lot.lot)
                    setMovementsPage(1)
                  }}
                  className="block w-full cursor-pointer rounded-md bg-white px-2.5 py-2 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                >
                  <p className="text-[12px] font-bold text-[#084734]">{formatLotLabel(lot.lot) ?? lot.lot}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#615D59]">
                    {formatNumber(lot.total)}대 · {lot.products.slice(0, 2).join(", ")}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
            <p className="text-[12px] font-bold text-[#111110]">예정 출고</p>
            <div className="mt-2 space-y-2">
              {hardwareSearchResults.planned.length === 0 ? (
                <p className="text-[11px] text-[#A39E98]">결과 없음</p>
              ) : hardwareSearchResults.planned.map((movement) => (
                <div key={movement.id} className="rounded-md bg-white px-2.5 py-2">
                  <p className="truncate text-[12px] font-bold text-[#111110]">{movement.to_location ?? "도착지 미정"}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#615D59]">
                    {movement.product_name} · {formatNumber(movement.quantity)}대 · {formatDate(movement.occurred_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void confirmPlannedMovement(movement, {
                      quantity: movement.quantity,
                      occurredAt: todayKey(),
                    })}
                    disabled={plannedConfirmLocked}
                    className="mt-1.5 rounded bg-[#084734] px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                  >
                    출고 확정
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-3">
            <p className="text-[12px] font-bold text-[#111110]">고객/작업</p>
            <div className="mt-2 space-y-2">
              {hardwareSearchResults.customers.length === 0 ? (
                <p className="text-[11px] text-[#A39E98]">결과 없음</p>
              ) : hardwareSearchResults.customers.map((customer) => (
                <button
                  key={customer.customer}
                  type="button"
                  onClick={() => setCustomerDetail(customer.customer)}
                  className="block w-full cursor-pointer rounded-md bg-white px-2.5 py-2 text-left transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
                >
                  <p className="truncate text-[12px] font-bold text-[#111110]">{customer.customer}</p>
                  <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                    예정 {formatNumber(customer.planned)} · 출고 {formatNumber(customer.outbound)} · {customer.lastDate ?? "-"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
