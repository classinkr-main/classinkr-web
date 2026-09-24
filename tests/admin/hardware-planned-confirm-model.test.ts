import { describe, expect, it } from "vitest"

import {
  formatConfirmDateLong,
  formatConfirmDateShort,
  plannedAllocationSegments,
  summarizePlannedConfirm,
  type PlannedConfirmEntry,
} from "@/components/admin/hardware/inventory/planned-confirm-model"
import { resolvePlannedFifoPreview, type HardwareStockRow } from "@/components/admin/hardware/inventory/shared"
import { summarizeStockTotals } from "@/lib/hardware/stock-attention"

// 하드웨어 라운드 3 — 예상 출고 확정 미리보기(H-3)·확인창(H-9)·요약 밴드 합계(H-10) 순수 판정.
// React 렌더 하네스가 없어 확인창·행 표시는 그리지 못한다 — 그 화면이 읽는 판정만 고정한다.

const TODAY = "2026-09-24"

function stockRow(overrides: Partial<HardwareStockRow> = {}): HardwareStockRow {
  return {
    itemId: "item-1",
    product: '86" IFP',
    category: "전자칠판",
    reorderPoint: 2,
    leadTimeDays: 14,
    warehouseStock: 0,
    plannedOut: 0,
    availableStock: 0,
    outbound30d: 0,
    weeklyOutboundAvg: 0,
    trendOrderPoint: 0,
    daysUntilStockout: null,
    low: false,
    orderRecommended: false,
    locationBalances: [],
    lotBalances: [],
    ...overrides,
  }
}

describe("resolvePlannedFifoPreview — 자기 제외 잔량(H-3)", () => {
  it("availability(이 행을 뺀 잔량)로 배정한다 — 품목 잔량이 이 예약을 이미 뺐어도 로트를 모자라게 말하지 않는다", () => {
    // 품목 잔량 H8 1(이 행 3대 예약을 이미 뺀 값) → 예전엔 "H8 1대 · 미지정 2대". 확정은 이 행을 빼고 H8 4 로 배정한다.
    const row = stockRow({ lotBalances: [{ lot: "H8", quantity: 1 }] })
    const preview = resolvePlannedFifoPreview({ lot_no: null }, row, 3, { lots: [{ lot: "H8", quantity: 4 }], tracked: true })
    expect(preview).toEqual({ kind: "fifo", matchedText: "H8 3대", unassignedQty: 0, plan: [{ lot: "H8", quantity: 3 }] })
  })

  it("서버가 준 FIFO 순서를 그대로 쓴다 — 화면이 다시 정렬하지 않는다", () => {
    // C1 이 앞(서버 compareLotsFifo 가 처음 본 날짜순으로 앞에 둔 경우). 화면 정렬(라벨순)로 바꾸면 Sample 이 먼저 나간다.
    const preview = resolvePlannedFifoPreview({ lot_no: null }, undefined, 3, {
      lots: [
        { lot: "C1", quantity: 2 },
        { lot: "Sample", quantity: 5 },
      ],
      tracked: true,
    })
    expect(preview).toMatchObject({ kind: "fifo", plan: [{ lot: "C1", quantity: 2 }, { lot: "Sample", quantity: 1 }], unassignedQty: 0 })
  })

  it("lot 을 다 써도 추적 품목이면 로트 미지정 수량으로 말한다", () => {
    const preview = resolvePlannedFifoPreview({ lot_no: null }, undefined, 4, { lots: [{ lot: "H8", quantity: 1 }], tracked: true })
    expect(preview).toEqual({ kind: "fifo", matchedText: "H8 1대", unassignedQty: 3, plan: [{ lot: "H8", quantity: 1 }] })
  })

  it("lot 추적 대상이 아닌 품목은 로트 기록 없음", () => {
    expect(resolvePlannedFifoPreview({ lot_no: null }, undefined, 2, { lots: [], tracked: false })).toEqual({ kind: "no-lot-records" })
  })

  it("지정 lot 잔량이 확정 수량보다 적으면 거절 예상(assigned-short)", () => {
    const availability = { lots: [{ lot: "H6", quantity: 1 }], tracked: true }
    expect(resolvePlannedFifoPreview({ lot_no: "H6" }, undefined, 2, availability)).toEqual({
      kind: "assigned-short",
      label: "H6",
      available: 1,
    })
    expect(resolvePlannedFifoPreview({ lot_no: "H6" }, undefined, 1, availability)).toEqual({ kind: "assigned", label: "H6" })
    // 서버와 같은 완전일치 비교 — 잔량에 없는 lot 이면 0대.
    expect(resolvePlannedFifoPreview({ lot_no: "H7" }, undefined, 1, availability)).toEqual({
      kind: "assigned-short",
      label: "H7",
      available: 0,
    })
  })

  it("availability 가 없으면(품목 id 없는 행·구응답) 예전처럼 품목 잔량으로 어림한다", () => {
    const row = stockRow({ lotBalances: [{ lot: "H8", quantity: 2 }] })
    expect(resolvePlannedFifoPreview({ lot_no: null }, row, 5)).toEqual({
      kind: "fifo",
      matchedText: "H8 2대",
      unassignedQty: 3,
      plan: [{ lot: "H8", quantity: 2 }],
    })
    expect(resolvePlannedFifoPreview({ lot_no: "H8" }, row, 5)).toEqual({ kind: "assigned", label: "H8" })
  })
})

function entry(overrides: Partial<PlannedConfirmEntry> & Pick<PlannedConfirmEntry, "id" | "preview">): PlannedConfirmEntry {
  return {
    productName: '86" IFP',
    customer: "서울 ○○초등학교",
    quantity: 3,
    occurredAt: TODAY,
    ...overrides,
  }
}

describe("plannedAllocationSegments — 확인창 배정 칸", () => {
  it("FIFO 배정과 미지정을 톤을 나눠 짧게 쓴다", () => {
    const segments = plannedAllocationSegments(
      { kind: "fifo", matchedText: "H8 1대", unassignedQty: 3, plan: [{ lot: "H8", quantity: 1 }] },
      4
    )
    expect(segments).toEqual([
      { text: "H8 1", tone: "ok" },
      { text: "미지정 3", tone: "warn" },
    ])
  })

  it("종류별 문구", () => {
    expect(plannedAllocationSegments({ kind: "assigned", label: "H8" }, 2)).toEqual([{ text: "H8 2", tone: "ok" }])
    expect(plannedAllocationSegments({ kind: "assigned-short", label: "H6", available: 1 }, 2)).toEqual([
      { text: "H6 잔량 1 — 거절", tone: "danger" },
    ])
    expect(plannedAllocationSegments({ kind: "no-lot-records" }, 2)).toEqual([{ text: "미지정 2", tone: "warn" }])
    expect(plannedAllocationSegments({ kind: "unavailable" }, 2)).toEqual([{ text: "확정 때 배정", tone: "muted" }])
  })
})

describe("summarizePlannedConfirm — 확인창 합계(H-9)", () => {
  const entries: PlannedConfirmEntry[] = [
    entry({ id: "a", quantity: 3, preview: { kind: "fifo", matchedText: "", unassignedQty: 0, plan: [{ lot: "H8", quantity: 2 }, { lot: "C1", quantity: 1 }] } }),
    entry({ id: "b", productName: "STD1", quantity: 2, preview: { kind: "assigned", label: "H8" } }),
    entry({
      id: "c",
      productName: "T1",
      customer: "부산 ○○중학교",
      quantity: 4,
      preview: { kind: "fifo", matchedText: "", unassignedQty: 3, plan: [{ lot: "H8", quantity: 1 }] },
    }),
    entry({ id: "d", productName: "OPS", customer: "부산 ○○중학교", quantity: 1, preview: { kind: "no-lot-records" } }),
    entry({ id: "e", productName: "케이블", quantity: 2, preview: { kind: "unavailable" } }),
    entry({ id: "f", productName: '65" IFP', customer: "경기 ○○학원", quantity: 2, preview: { kind: "assigned-short", label: "H6", available: 1 } }),
  ]

  it("대수·고객사·lot 배정·미지정·미리보기 없음·거절을 따로 센다", () => {
    const summary = summarizePlannedConfirm(entries, TODAY)
    expect(summary).toMatchObject({
      count: 6,
      quantity: 14,
      customers: 3,
      lotAssigned: 6, // a 3 + b 2 + c 1
      unassigned: 4, // c 3 + d 1
      unknown: 2, // e
      dates: [TODAY],
      nonToday: false,
    })
    expect(summary.rejected).toEqual([{ id: "f", productName: '65" IFP', label: "H6", available: 1, quantity: 2 }])
  })

  it("오늘이 아닌 확정일이 하나라도 있으면 알린다 — 딜 전체 확정은 행마다 날짜가 다를 수 있다", () => {
    const summary = summarizePlannedConfirm(
      [entry({ id: "a", occurredAt: "2026-09-22", preview: { kind: "assigned", label: "H8" } }), entry({ id: "b", preview: { kind: "assigned", label: "H8" } })],
      TODAY
    )
    expect(summary.dates).toEqual(["2026-09-22", TODAY])
    expect(summary.nonToday).toBe(true)
  })
})

describe("확정일 표기", () => {
  it("요일을 붙인 긴 표기와 짧은 표기", () => {
    expect(formatConfirmDateLong("2026-09-22")).toBe("2026년 9월 22일 (화)")
    expect(formatConfirmDateLong("2026-09-24")).toBe("2026년 9월 24일 (목)")
    expect(formatConfirmDateShort("2026-09-24")).toBe("9월 24일")
    expect(formatConfirmDateLong("미정")).toBe("미정")
  })
})

describe("summarizeStockTotals — 요약 밴드 합계(H-10)", () => {
  it("판촉 라인을 실판매 합에서 빼고 따로 돌려준다 — 판촉 음수가 헤드라인을 깎지 않는다", () => {
    const totals = summarizeStockTotals([
      { product: '86" IFP', warehouseStock: 8, availableStock: 5 },
      { product: "STD1", warehouseStock: 6, availableStock: 4 },
      { product: "STD1(promoted)", warehouseStock: -16, availableStock: -16 },
      { product: "T1 (promoted)", warehouseStock: 10, availableStock: 10 },
    ])
    expect(totals).toEqual({ warehouse: 14, available: 9, promoted: { warehouse: -6, available: -6 } })
  })

  it("판촉 라인이 없으면 promoted 는 null", () => {
    expect(summarizeStockTotals([{ product: "T1", warehouseStock: 3, availableStock: 2 }]).promoted).toBeNull()
  })
})
