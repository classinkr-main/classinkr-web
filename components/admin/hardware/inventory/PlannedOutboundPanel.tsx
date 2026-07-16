"use client"

import type { Dispatch, SetStateAction } from "react"
import { CheckCheck, Clock3 } from "lucide-react"

import type { AdminListPaginationResult } from "@/lib/admin-list-pagination"
import {
  formatDate,
  formatLotLabel,
  formatNumber,
  PaginationControls,
  previewFifoLots,
  todayKey,
  type HardwareDashboard,
  type HardwareMovement,
} from "./shared"

interface PlannedGroup {
  key: string
  customer: string
  owner: string | null
  date: string | null
  lot: string | null
  totalQty: number
  items: HardwareMovement[]
}

interface PlannedOutboundPanelProps {
  data: HardwareDashboard | null
  plannedMovementQuantity: number
  startPlannedEntry: () => void
  plannedConfirmLocked: boolean
  plannedPagination: AdminListPaginationResult<PlannedGroup>
  setPlannedPage: Dispatch<SetStateAction<number>>
  confirmQtys: Record<string, string>
  setConfirmQtys: Dispatch<SetStateAction<Record<string, string>>>
  plannedConfirmResults: Record<string, { ok: boolean; message: string }>
  confirmDates: Record<string, string>
  setConfirmDates: Dispatch<SetStateAction<Record<string, string>>>
  editMovement: (movement: HardwareMovement) => void
  confirmingId: string | null
  confirmingGroupKey: string | null
  confirmPlannedGroup: (group: { key: string; customer: string; items: HardwareMovement[] }) => Promise<void>
  confirmPlannedMovement: (movement: HardwareMovement, override?: { quantity?: number; occurredAt?: string }) => Promise<void>
}

export default function PlannedOutboundPanel({
  data,
  plannedMovementQuantity,
  startPlannedEntry,
  plannedConfirmLocked,
  plannedPagination,
  setPlannedPage,
  confirmQtys,
  setConfirmQtys,
  plannedConfirmResults,
  confirmDates,
  setConfirmDates,
  editMovement,
  confirmingId,
  confirmingGroupKey,
  confirmPlannedGroup,
  confirmPlannedMovement,
}: PlannedOutboundPanelProps) {
  return (
    <section
      data-testid="hardware-planned-info-panel"
      className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#FBF1E0] text-[#A8741A]">
            <Clock3 className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-bold tracking-[-0.01em] text-[#111110]">예상 출고</span>
            <span className="mt-1 block text-[12px] text-[#615D59]">배송 예정 물량을 확정하면 현재 lot 재고를 기준으로 FIFO 배정 후 실제 출고로 전환됩니다.</span>
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span className="text-[11px] font-semibold text-[#615D59]">
            {formatNumber(data?.plannedMovements.length ?? 0)}건 · {formatNumber(plannedMovementQuantity)}대
          </span>
          <button
            type="button"
            onClick={startPlannedEntry}
            disabled={plannedConfirmLocked}
            className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-[#084734] px-3 py-2 text-[12px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Clock3 className="h-3.5 w-3.5" />
            예상 출고 등록
          </button>
        </div>
      </div>
      {(data?.plannedMovements.length ?? 0) === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] text-[#615D59]">
          현재 배송 예정 기록이 없습니다. 예상 출고 등록으로 미리 차감할 물량을 잡아두세요.
        </p>
      ) : (
        <>
          <div className="divide-y divide-[rgba(0,0,0,0.06)]">
            {plannedPagination.pageItems.map((group) => (
              <div key={group.key} data-testid="hardware-planned-info-group" className="px-5 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p title={group.customer} className="truncate text-[13.5px] font-bold text-[#111110]">{group.customer}</p>
                    <p className="mt-0.5 text-[11px] text-[#615D59]">
                      {group.date ? formatDate(group.date) : "일자 미정"} · {group.owner ?? "담당자 미정"}
                      {group.lot ? ` · ${formatLotLabel(group.lot) ?? group.lot}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <span className="rounded-full bg-[#FBF1E0] px-2.5 py-1 text-[11px] font-bold tabular-nums text-[#7A520F]">
                      {formatNumber(group.totalQty)}대 · {formatNumber(group.items.length)}품목
                    </span>
                    <button
                      type="button"
                      onClick={() => void confirmPlannedGroup(group)}
                      disabled={plannedConfirmLocked}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-[#084734] px-2.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {confirmingGroupKey === group.key ? "확정 중" : "전체 확정"}
                    </button>
                  </div>
                </div>
                <div className="mt-2 divide-y divide-[rgba(0,0,0,0.05)] overflow-hidden rounded-lg border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8]">
                  {group.items.map((movement) => {
                    const confirmQty = Math.max(
                      1,
                      Math.min(movement.quantity, Math.floor(Number(confirmQtys[movement.id] ?? movement.quantity) || movement.quantity))
                    )
                    const stockRow = data?.stock.find((row) => row.itemId === movement.item_id || row.product === movement.product_name)
                    const plannedFifoPreview =
                      movement.lot_no || !stockRow ? null : previewFifoLots(stockRow.lotBalances, confirmQty)
                    const confirmResult = plannedConfirmResults[movement.id]
                    return (
                      <div
                        key={movement.id}
                        data-testid="hardware-planned-info-row"
                        data-movement-id={movement.id}
                        className="grid gap-2 px-3 py-2 md:grid-cols-[1fr_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <p title={movement.product_name} className="truncate text-[12.5px] font-semibold text-[#111110]">
                            {movement.product_name} <span className="tabular-nums text-[#7A520F]">· {formatNumber(movement.quantity)}대</span>
                          </p>
                          <p className="mt-1 truncate text-[11px] font-bold text-[#084734]">
                            {movement.lot_no
                              ? `지정 lot ${formatLotLabel(movement.lot_no) ?? movement.lot_no}`
                              : plannedFifoPreview
                                ? `FIFO 예상 ${plannedFifoPreview.plan.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${formatNumber(lot.quantity)}대`).join(" · ")}${plannedFifoPreview.shortage > 0 ? ` · 부족 ${formatNumber(plannedFifoPreview.shortage)}대` : ""}`
                                : "FIFO 예상 없음"}
                          </p>
                          {confirmResult && (
                            <p className={`mt-1 truncate text-[11px] font-bold ${confirmResult.ok ? "text-[#084734]" : "text-[#8F2C2C]"}`}>
                              {confirmResult.message}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={movement.quantity}
                            value={confirmQtys[movement.id] ?? String(movement.quantity)}
                            onChange={(event) => setConfirmQtys((current) => ({ ...current, [movement.id]: event.target.value }))}
                            disabled={plannedConfirmLocked}
                            aria-label="확정 수량"
                            title="확정 수량 (부분 확정 가능)"
                            className="h-8 w-14 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-center text-[11px] font-bold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                          />
                          <input
                            type="date"
                            value={confirmDates[movement.id] ?? todayKey()}
                            onChange={(event) => setConfirmDates((current) => ({ ...current, [movement.id]: event.target.value }))}
                            disabled={plannedConfirmLocked}
                            aria-label="출고 확정일"
                            title="출고 확정일"
                            className="h-8 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-[11px] font-semibold text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15 disabled:cursor-not-allowed disabled:bg-[#F6F5F4] disabled:text-[#A39E98]"
                          />
                          <button
                            type="button"
                            onClick={() => editMovement(movement)}
                            disabled={plannedConfirmLocked}
                            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            수정
                          </button>
                          <button
                            type="button"
                            onClick={() => void confirmPlannedMovement(movement)}
                            disabled={plannedConfirmLocked}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#084734] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-sm transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-95 motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            {confirmingId === movement.id ? "확정 중" : "출고 확정"}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
          <PaginationControls pagination={plannedPagination} label="딜" onPageChange={setPlannedPage} />
        </>
      )}
    </section>
  )
}
