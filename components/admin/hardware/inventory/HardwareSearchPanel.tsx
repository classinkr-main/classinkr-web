"use client"

import { memo, useState } from "react"
import type { Dispatch, SetStateAction } from "react"
import { Search } from "lucide-react"

import DeleteConfirmDialog from "@/components/admin/DeleteConfirmDialog"

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
} from "./shared"

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
  // hardware.finalize 표시용 — 없으면 검색 결과의 원탭 확정을 비활성한다(강제는 서버 게이트).
  canFinalize: boolean
  setCustomerDetail: Dispatch<SetStateAction<string | null>>
  // 큐에 적어 둔 확정 수량·확정일(없으면 전량·오늘) — 확인 다이얼로그가 보여 주고 그대로 쓴다(하드웨어 라운드 2 H-5).
  describePlannedConfirm?: (movement: HardwareMovement) => { qty: number; occurredAt: string }
  // 지금 확정 중인 예정 id — 카드 버튼이 "확정 중"을 보인다.
  confirmingId?: string | null
  // 내역 탭 필터 전체 초기화 — lot 점프가 일부 축만 지워 상태·기간 필터가 남아 결과가 조용히 좁아지던 것(L-16).
  resetHistoryFilters?: () => void
}

function HardwareSearchPanel({
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
  canFinalize,
  setCustomerDetail,
  describePlannedConfirm,
  confirmingId = null,
  resetHistoryFilters,
}: HardwareSearchPanelProps) {
  // 검색 카드의 확정은 확인을 거친다(H-5) — 예전엔 원탭으로 전량·오늘 확정해 큐에 적은 부분 수량·확정일을 무시했다.
  const [confirmTarget, setConfirmTarget] = useState<HardwareMovement | null>(null)
  const confirmInput = confirmTarget
    ? describePlannedConfirm?.(confirmTarget) ?? { qty: confirmTarget.quantity, occurredAt: todayKey() }
    : null
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
                  <p title={row.product} className="truncate text-[12px] font-bold text-[#111110]">{row.product}</p>
                  <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                    가용 {formatNumber(row.availableStock)} · 예정 {formatNumber(row.plannedOut)} · 창고 {formatNumber(row.warehouseStock)}
                  </p>
                  <div className="mt-1.5 inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] p-0.5">
                    <QuickMoveButton kind="sale" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "sale")} />
                    <QuickMoveButton kind="planned" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "planned")} />
                    <QuickMoveButton kind="inbound" bare product={row.product} onClick={() => prepareQuickEntry(row.itemId, "inbound")} />
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
                    if (resetHistoryFilters) resetHistoryFilters()
                    else {
                      setHistoryType("all")
                      setProductFilter("")
                      setCustomerFilter("")
                      setSearch("")
                    }
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
                  <p title={movement.to_location ?? undefined} className="truncate text-[12px] font-bold text-[#111110]">{movement.to_location ?? "도착지 미정"}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[#615D59]">
                    {movement.product_name} · {formatNumber(movement.quantity)}대 · {formatDate(movement.occurred_at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget(movement)}
                    aria-haspopup="dialog"
                    disabled={plannedConfirmLocked || !canFinalize}
                    title={canFinalize ? undefined : "출고 확정에는 확정 권한(hardware.finalize)이 필요합니다"}
                    className="mt-1.5 cursor-pointer rounded-md border border-[#084734] bg-white px-2 py-1 text-[10.5px] font-bold text-[#084734] transition hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {confirmingId === movement.id ? "확정 중" : "출고 확정"}
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
                  <p title={customer.customer} className="truncate text-[12px] font-bold text-[#111110]">{customer.customer}</p>
                  <p className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#615D59]">
                    예정 {formatNumber(customer.planned)} · 출고 {formatNumber(customer.outbound)} · {customer.lastDate ?? "-"}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <DeleteConfirmDialog
        open={confirmTarget != null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={() => {
          const target = confirmTarget
          setConfirmTarget(null)
          // 큐의 입력값(없으면 전량·오늘)을 그대로 쓴다 — override 를 넘기지 않는다.
          if (target) void confirmPlannedMovement(target)
        }}
        destructive={false}
        title="예정 출고 확정"
        description={
          confirmTarget && confirmInput
            ? `${confirmTarget.to_location ?? "도착지 미정"} · ${confirmTarget.product_name} ${formatNumber(confirmInput.qty)}대를 ${confirmInput.occurredAt} 날짜로 실제 출고로 확정합니다.${
                confirmInput.qty < confirmTarget.quantity ? ` 잔여 ${formatNumber(confirmTarget.quantity - confirmInput.qty)}대는 예정으로 남습니다.` : ""
              } 수량·확정일을 바꾸려면 홈 예상 출고 큐의 그 행에서 고친 뒤 확정하세요.`
            : ""
        }
        confirmLabel="출고 확정"
        cancelLabel="닫기"
      />
    </section>
  )
}

export default memo(HardwareSearchPanel)
