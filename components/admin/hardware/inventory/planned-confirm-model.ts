// 예상 출고 확정 확인창의 순수 판정(하드웨어 라운드 3 H-9) — 행별 배정 문구·확정일·합계.
// 선택 확정과 딜 "전체 확정"이 같은 확인창을 쓴다. 예전엔 선택 확정만 확정일을 말했고(배정 없음), 딜 전체 확정은
// window.confirm 한 줄이라 날짜도 배정도 보이지 않았다. React 렌더 하네스가 없는 저장소라 판정을 여기 떼어 테스트로 고정한다
// (tests/admin/hardware-planned-confirm-model.test.ts).

import { formatLotLabel, formatNumber, type PlannedFifoPreview } from "./shared"

export interface PlannedConfirmEntry {
  id: string
  productName: string
  customer: string
  quantity: number
  // 확정일 YYYY-MM-DD — 선택 확정은 공통 날짜, 딜 전체 확정은 행마다 입력한 날짜.
  occurredAt: string
  preview: PlannedFifoPreview
}

export type AllocationTone = "ok" | "warn" | "danger" | "muted"

export interface AllocationSegment {
  text: string
  tone: AllocationTone
}

export interface PlannedConfirmRejection {
  id: string
  productName: string
  label: string
  available: number
  quantity: number
}

export interface PlannedConfirmSummary {
  count: number
  quantity: number
  customers: number
  // lot 으로 배정될 대수(지정 lot 포함).
  lotAssigned: number
  // 로트 미지정으로 기록될 대수(lot 이 모자란 나머지 + lot 추적 대상이 아닌 품목).
  unassigned: number
  // 미리보기가 없는 대수(재고 행을 못 찾음) — 서버가 확정 때 배정한다.
  unknown: number
  // 지정 lot 잔량이 모자라 서버가 거절할 행.
  rejected: PlannedConfirmRejection[]
  // 고유 확정일(오름차순).
  dates: string[]
  // 오늘이 아닌 확정일이 하나라도 있는지.
  nonToday: boolean
}

function lotLabel(lot: string): string {
  return formatLotLabel(lot) ?? lot
}

/** 확인창 "확정 시 배정" 칸 — 짧은 형태(대 생략). 톤은 행 미리보기와 같다(배정 그린 · 미지정 주황 · 거절 빨강). */
export function plannedAllocationSegments(preview: PlannedFifoPreview, quantity: number): AllocationSegment[] {
  switch (preview.kind) {
    case "assigned":
      return [{ text: `${preview.label} ${formatNumber(quantity)}`, tone: "ok" }]
    case "assigned-short":
      return [{ text: `${preview.label} 잔량 ${formatNumber(preview.available)} — 거절`, tone: "danger" }]
    case "unavailable":
      return [{ text: "확정 때 배정", tone: "muted" }]
    case "no-lot-records":
      return [{ text: `미지정 ${formatNumber(quantity)}`, tone: "warn" }]
    case "fifo": {
      const segments: AllocationSegment[] = []
      if (preview.plan.length > 0) {
        segments.push({
          text: preview.plan.map((lot) => `${lotLabel(lot.lot)} ${formatNumber(lot.quantity)}`).join(" · "),
          tone: "ok",
        })
      }
      if (preview.unassignedQty > 0) segments.push({ text: `미지정 ${formatNumber(preview.unassignedQty)}`, tone: "warn" })
      return segments
    }
  }
}

export function summarizePlannedConfirm(entries: readonly PlannedConfirmEntry[], today: string): PlannedConfirmSummary {
  const customers = new Set<string>()
  const dates = new Set<string>()
  const rejected: PlannedConfirmRejection[] = []
  let quantity = 0
  let lotAssigned = 0
  let unassigned = 0
  let unknown = 0
  for (const entry of entries) {
    quantity += entry.quantity
    customers.add(entry.customer)
    dates.add(entry.occurredAt)
    const preview = entry.preview
    if (preview.kind === "assigned") lotAssigned += entry.quantity
    else if (preview.kind === "assigned-short") {
      rejected.push({
        id: entry.id,
        productName: entry.productName,
        label: preview.label,
        available: preview.available,
        quantity: entry.quantity,
      })
    } else if (preview.kind === "unavailable") unknown += entry.quantity
    else if (preview.kind === "no-lot-records") unassigned += entry.quantity
    else {
      lotAssigned += preview.plan.reduce((sum, lot) => sum + lot.quantity, 0)
      unassigned += preview.unassignedQty
    }
  }
  const sortedDates = Array.from(dates).sort()
  return {
    count: entries.length,
    quantity,
    customers: customers.size,
    lotAssigned,
    unassigned,
    unknown,
    rejected,
    dates: sortedDates,
    nonToday: sortedDates.some((date) => date !== today),
  }
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const

/** YYYY-MM-DD → "2026년 9월 22일 (월)". 날짜가 아니면 입력을 그대로 돌려준다. */
export function formatConfirmDateLong(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return key
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `${year}년 ${month}월 ${day}일 (${WEEKDAYS[weekday]})`
}

/** YYYY-MM-DD → "9월 22일". */
export function formatConfirmDateShort(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  return match ? `${Number(match[2])}월 ${Number(match[3])}일` : key
}
