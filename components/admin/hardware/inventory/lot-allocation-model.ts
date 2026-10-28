// 확정 때 물류번호 나누기 — 물류번호 없는 배송 예정을 확정할 때, 확정 수량을 여러 로트에 나눠 담는다
// (정의서: 매니저가 직접 고른다, 잔여 1대 이상만, 잔여 초과 차단 — 결정 D2·D6). 순수 함수만 둔다.

import type { LotRemaining } from "@/lib/hardware/inventory-process"

export interface LotAllocation {
  lotNo: string
  quantity: number
}

/** 고를 수 있는 로트 — 잔여 1대 이상만. 서버가 준 순서(수입 순)를 그대로 둔다. */
export function selectableLots(lots: readonly LotRemaining[]): LotRemaining[] {
  return lots.filter((lot) => lot.lotNo.trim() !== "" && Number.isFinite(lot.remaining) && lot.remaining >= 1)
}

/** 같은 로트 줄을 합치고 0·음수·빈 로트 줄을 버린다. */
export function normalizeAllocations(allocations: readonly LotAllocation[]): LotAllocation[] {
  const merged = new Map<string, number>()
  for (const allocation of allocations) {
    const lotNo = allocation.lotNo.trim()
    const quantity = Math.floor(Number(allocation.quantity))
    if (!lotNo || !Number.isFinite(quantity) || quantity <= 0) continue
    merged.set(lotNo, (merged.get(lotNo) ?? 0) + quantity)
  }
  return [...merged].map(([lotNo, quantity]) => ({ lotNo, quantity }))
}

export function allocatedTotal(allocations: readonly LotAllocation[]): number {
  return normalizeAllocations(allocations).reduce((sum, allocation) => sum + allocation.quantity, 0)
}

/**
 * 앞서 나눈 줄이 쓴 만큼 잔여를 뺀다 — 같은 품목 예정 여러 건을 한 번에 확정할 때 두 번째 건이 첫 건이 가져간
 * 로트 수량을 다시 고르지 않게 한다(서버도 순서대로 막지만 화면이 먼저 맞춘다).
 */
export function consumeLots(lots: readonly LotRemaining[], consumed: readonly LotAllocation[]): LotRemaining[] {
  const used = new Map(normalizeAllocations(consumed).map((allocation) => [allocation.lotNo, allocation.quantity]))
  return lots.map((lot) => ({ lotNo: lot.lotNo, remaining: Math.max(0, lot.remaining - (used.get(lot.lotNo) ?? 0)) }))
}

/** 제안 — 고를 수 있는 로트를 순서대로 채운다. 채우지 못한 수량은 shortage. 사용자가 고친다. */
export function suggestLotSplit(lots: readonly LotRemaining[], quantity: number): { allocations: LotAllocation[]; shortage: number } {
  let left = Math.max(0, Math.floor(quantity))
  const allocations: LotAllocation[] = []
  for (const lot of selectableLots(lots)) {
    if (left <= 0) break
    const take = Math.min(left, Math.floor(lot.remaining))
    if (take > 0) allocations.push({ lotNo: lot.lotNo, quantity: take })
    left -= take
  }
  return { allocations, shortage: left }
}

/** 나눈 결과 검사 — 합계가 확정 수량과 같아야 하고, 로트마다 잔여를 넘지 않아야 한다. */
export function validateLotAllocations(input: {
  productName: string
  target: number
  lots: readonly LotRemaining[]
  allocations: readonly LotAllocation[]
}): string | null {
  const allocations = normalizeAllocations(input.allocations)
  if (allocations.length === 0) return `${input.productName}의 물류번호를 고르세요.`
  for (const allocation of allocations) {
    const lot = input.lots.find((candidate) => candidate.lotNo === allocation.lotNo)
    const remaining = lot?.remaining ?? 0
    if (allocation.quantity > remaining) {
      return `${input.productName} ${allocation.lotNo} 잔여는 ${remaining}대입니다(나눈 수량 ${allocation.quantity}대).`
    }
  }
  const total = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0)
  if (total !== input.target) {
    return `${input.productName} 확정 수량 ${input.target}대 중 ${total}대만 나눴습니다. 합계를 맞추세요.`
  }
  return null
}

/** confirm-planned 본문 조각 — 로트 하나면 lotNo, 여럿이면 lotAllocations. */
export function confirmLotPayload(allocations: readonly LotAllocation[]): { lotNo: string } | { lotAllocations: LotAllocation[] } | Record<string, never> {
  const normalized = normalizeAllocations(allocations)
  if (normalized.length === 0) return {}
  if (normalized.length === 1) return { lotNo: normalized[0].lotNo }
  return { lotAllocations: normalized }
}

/**
 * 확정 전에 물류번호를 골라야 하는 예정 행인가 — 이미 로트가 있으면 아니다. 품목이 "수량만 관리"로
 * 표시돼 있으면(lot_tracked === false) 아니다. 칸이 없는 구응답은 관리 품목으로 보고 lots 조회 결과
 * (lotTracked)로 최종 판정한다.
 */
export function plannedRowMayNeedLot(
  movement: { lot_no: string | null },
  item: { lot_tracked?: boolean } | null | undefined
): boolean {
  if ((movement.lot_no ?? "").trim()) return false
  return item?.lot_tracked !== false
}
