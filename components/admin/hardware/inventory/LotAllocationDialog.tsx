"use client"

// 확정 때 물류번호 고르기 — 물류번호 없는 배송 예정(오더 승인으로 만든 예정 등)을 확정할 때, 확정 수량을
// 잔여 있는 로트에 나눠 담는다(결정 D2·D6). 확정 버튼(예상 출고 패널·검색·상세)이 모두 이 대화상자를 거친다.
//
// useLotAllocationPrompt().request(entries) 는 Promise 를 돌려준다 — 고를 필요가 없으면 바로 빈 Map,
// 사용자가 취소하면 null. 부모의 확정 루프는 결과 Map 을 movement id 로 읽어 본문에 싣는다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, X } from "lucide-react"

import type { LotRemaining } from "@/lib/hardware/inventory-process"

import { fetchHardwareLots } from "./hardware-lookups"
import {
  allocatedTotal,
  consumeLots,
  normalizeAllocations,
  plannedRowMayNeedLot,
  selectableLots,
  suggestLotSplit,
  validateLotAllocations,
  type LotAllocation,
} from "./lot-allocation-model"
import { formatNumber, type HardwareItem, type HardwareMovement } from "./shared"

/** 물류번호를 고를 한 줄 — 확정할 예정 행 또는 새로 만들 출고(CRM 오더 대사 등록). */
export interface LotAllocationRequestEntry {
  /** 결과 Map 의 키 — 예정 행이면 movement id. */
  key: string
  itemId: string | null
  productName: string
  destination: string | null
  /** 이미 로트가 있으면 고르지 않는다. */
  lotNo: string | null
  /** 확정·등록 수량 — 나눈 합계가 이 값과 같아야 한다. */
  quantity: number
  /** 잔여 계산에서 뺄 예정 행(확정 중인 자기 자신). */
  excludeMovementId?: string | null
}

/** 예정 행 → 요청 줄. */
export function plannedLotRequest(movement: HardwareMovement, quantity: number): LotAllocationRequestEntry {
  return {
    key: movement.id,
    itemId: movement.item_id || null,
    productName: movement.product_name,
    destination: movement.to_location,
    lotNo: movement.lot_no,
    quantity,
    excludeMovementId: movement.id,
  }
}

interface DialogRow {
  entry: LotAllocationRequestEntry
  lots: LotRemaining[]
  /** lotNo → 입력 문자열. */
  inputs: Record<string, string>
}

export type LotAllocationResult = Map<string, LotAllocation[]>

/** 앞줄이 같은 품목 로트를 쓴 만큼 뺀 잔여 — 대화상자와 테스트가 같은 계산을 쓴다. */
export function rowsWithConsumedLots<T extends { entry: Pick<LotAllocationRequestEntry, "itemId" | "productName">; lots: LotRemaining[]; allocations: LotAllocation[] }>(
  rows: readonly T[]
): Array<T & { available: LotRemaining[] }> {
  return rows.map((row, index) => {
    const earlier = rows.slice(0, index).filter((other) => sameProduct(other.entry, row.entry))
    return { ...row, available: consumeLots(row.lots, earlier.flatMap((other) => other.allocations)) }
  })
}

function sameProduct(a: Pick<LotAllocationRequestEntry, "itemId" | "productName">, b: Pick<LotAllocationRequestEntry, "itemId" | "productName">) {
  return a.itemId && b.itemId ? a.itemId === b.itemId : a.productName.trim() === b.productName.trim()
}

function inputsToAllocations(inputs: Record<string, string>): LotAllocation[] {
  return normalizeAllocations(Object.entries(inputs).map(([lotNo, value]) => ({ lotNo, quantity: Number(value) })))
}

export function useLotAllocationPrompt(items: readonly HardwareItem[] | undefined) {
  const [rows, setRows] = useState<DialogRow[] | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const resolverRef = useRef<((result: LotAllocationResult | null) => void) | null>(null)

  const request = useCallback(
    async (entries: readonly LotAllocationRequestEntry[]): Promise<LotAllocationResult | null> => {
      const candidates = entries.filter((entry) =>
        plannedRowMayNeedLot({ lot_no: entry.lotNo }, items?.find((item) => (entry.itemId ? item.id === entry.itemId : item.name === entry.productName)))
      )
      if (candidates.length === 0) return new Map()
      setPreparing(true)
      const failed: string[] = []
      const loaded = await Promise.all(
        candidates.map(async (entry) => {
          try {
            const lots = await fetchHardwareLots({
              itemId: entry.itemId,
              product: entry.productName,
              excludeMovementId: entry.excludeMovementId,
            })
            return lots.lotTracked ? { entry, lots: lots.lots, inputs: {} } : null
          } catch {
            // 잔여를 못 읽으면 화면은 묻지 않고 서버 판정에 맡긴다(구서버 호환). 사유는 대화상자에 남긴다.
            failed.push(entry.productName)
            return null
          }
        })
      )
      setPreparing(false)
      const needed = loaded.filter((row): row is DialogRow => row != null)
      if (needed.length === 0) return new Map()
      setNotice(failed.length > 0 ? `${failed.join(", ")} 잔여를 불러오지 못해 물류번호 없이 보냅니다(서버가 확인합니다).` : null)
      // 앞 요청이 아직 열려 있으면(연타) 취소로 끝낸다 — 기다리는 확정 루프가 영영 멈추지 않게.
      resolverRef.current?.(null)
      setRows(needed)
      return new Promise<LotAllocationResult | null>((resolve) => {
        resolverRef.current = resolve
      })
    },
    [items]
  )

  const close = useCallback((result: LotAllocationResult | null) => {
    resolverRef.current?.(result)
    resolverRef.current = null
    setRows(null)
    setNotice(null)
  }, [])

  const setInput = useCallback((rowIndex: number, lotNo: string, value: string) => {
    setRows((current) =>
      current ? current.map((row, index) => (index === rowIndex ? { ...row, inputs: { ...row.inputs, [lotNo]: value } } : row)) : current
    )
  }, [])

  const autofill = useCallback(() => {
    setRows((current) => {
      if (!current) return current
      const next: DialogRow[] = []
      for (const row of current) {
        const earlier = next.filter((other) => sameProduct(other.entry, row.entry))
        const available = consumeLots(row.lots, earlier.flatMap((other) => inputsToAllocations(other.inputs)))
        const { allocations } = suggestLotSplit(available, row.entry.quantity)
        next.push({ ...row, inputs: Object.fromEntries(allocations.map((allocation) => [allocation.lotNo, String(allocation.quantity)])) })
      }
      return next
    })
  }, [])

  return { request, preparing, dialog: { rows, notice, setInput, autofill, close } }
}

export type LotAllocationDialogState = ReturnType<typeof useLotAllocationPrompt>["dialog"]

export default function LotAllocationDialog({ state }: { state: LotAllocationDialogState }) {
  const { rows, notice, setInput, autofill, close } = state
  const panelRef = useRef<HTMLDivElement | null>(null)
  const open = rows != null
  // 열리면 대화상자로 포커스를 옮긴다 — Escape 가 뒤의 시트가 아니라 이 대화상자를 닫게.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  const computed = useMemo(() => {
    if (!rows) return []
    return rowsWithConsumedLots(rows.map((row) => ({ ...row, allocations: inputsToAllocations(row.inputs) }))).map((row) => ({
      ...row,
      error: validateLotAllocations({
        productName: row.entry.productName,
        target: row.entry.quantity,
        lots: row.available,
        allocations: row.allocations,
      }),
    }))
  }, [rows])

  if (!rows) return null
  const ready = computed.every((row) => row.error == null)

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={() => close(null)}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lot-allocation-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            close(null)
          }
        }}
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-xl outline-none border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_16px_40px_rgba(0,0,0,0.12)] sm:max-w-lg sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
          <div>
            <p id="lot-allocation-title" className="text-[15px] font-bold text-[#111110]">
              확정할 물류번호 고르기
            </p>
            <p className="mt-1 text-[12px] text-[#615D59]">물류번호 관리 품목입니다. 수량을 잔여 있는 물류번호에 나눠 담으세요(잔여 1대 이상만 보입니다).</p>
          </div>
          <button
            type="button"
            onClick={() => close(null)}
            aria-label="닫기"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[#615D59] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {notice ? <p className="rounded-md bg-[#FBF1E0] px-3 py-2 text-[11.5px] font-semibold text-[#7A520F]">{notice}</p> : null}
          {computed.map((row, rowIndex) => {
            const lots = selectableLots(row.available)
            const total = allocatedTotal(row.allocations)
            return (
              <div key={row.entry.key} className="rounded-lg border border-[rgba(0,0,0,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-3 py-2">
                  <p className="min-w-0 truncate text-[12.5px] font-bold text-[#111110]">
                    {row.entry.productName}
                    <span className="ml-1 font-semibold text-[#615D59]">· {row.entry.destination ?? "도착지 미정"}</span>
                  </p>
                  <span className={`text-[11.5px] font-bold tabular-nums ${total === row.entry.quantity ? "text-[#084734]" : "text-[#A8741A]"}`}>
                    {formatNumber(total)} / {formatNumber(row.entry.quantity)}대
                  </span>
                </div>
                {lots.length === 0 ? (
                  <p className="px-3 py-3 text-[12px] font-semibold text-[#8F2C2C]">잔여 있는 물류번호가 없습니다. 입고·재고 조정을 먼저 확인하세요.</p>
                ) : (
                  <ul className="divide-y divide-[rgba(0,0,0,0.05)]">
                    {lots.map((lot) => (
                      <li key={lot.lotNo} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span className="text-[12.5px] font-bold text-[#111110]">
                          {lot.lotNo}
                          <span className="ml-1.5 text-[11px] font-semibold text-[#615D59]">잔여 {formatNumber(lot.remaining)}대</span>
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={lot.remaining}
                          inputMode="numeric"
                          aria-label={`${row.entry.productName} ${lot.lotNo} 수량`}
                          value={rows[rowIndex]?.inputs[lot.lotNo] ?? ""}
                          onChange={(event) => setInput(rowIndex, lot.lotNo, event.target.value)}
                          placeholder="0"
                          className="h-9 w-20 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-2 text-center text-[12px] font-bold tabular-nums text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {row.error ? <p className="border-t border-[rgba(0,0,0,0.05)] px-3 py-2 text-[11px] font-semibold text-[#8F2C2C]">{row.error}</p> : null}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(0,0,0,0.08)] px-5 py-3">
          <button
            type="button"
            onClick={autofill}
            className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
          >
            앞 물류번호부터 채우기
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => close(null)}
              className="cursor-pointer rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-2 text-[12px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40"
            >
              취소
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() => close(new Map(computed.map((row) => [row.entry.key, row.allocations])))}
              className="cursor-pointer rounded-md bg-[#084734] px-3.5 py-2 text-[12px] font-bold text-white transition hover:bg-[#065c41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              이대로 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 잔여 조회 중 표시 — 확정 버튼을 누른 직후 잠깐 보인다. */
export function LotAllocationPreparing({ preparing }: { preparing: boolean }) {
  if (!preparing) return null
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#111110] px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      물류번호 잔여 확인 중
    </div>
  )
}
