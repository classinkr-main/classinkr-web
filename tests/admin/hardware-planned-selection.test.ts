import { describe, expect, it } from "vitest"

import { judgeImportFreshness } from "@/components/admin/hardware/inventory/ImportFreshnessStrip"
import {
  collectStalePlannedMovementIds,
  resolveConfirmQuantity,
  resolvePlannedFifoPreview,
  shiftSelectRange,
  type HardwareStockRow,
} from "@/components/admin/hardware/inventory/shared"

// 예상 출고 "일괄 체크"(감사 2026-09-14)를 뒷받침하는 순수 함수 4종 회귀. 이 저장소는
// React 렌더 테스트 하네스(@testing-library/react)가 없어(tests/admin/overview-speed-round-2026-09-10.test.ts
// 코멘트 참고) 체크박스·Shift 클릭·확정 다이얼로그 자체는 렌더 테스트할 수 없다 — 대신 그
// 동작을 뽑아낸 순수 로직만 여기서 고정한다.

function stockRow(overrides: Partial<HardwareStockRow>): HardwareStockRow {
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

describe("resolveConfirmQuantity", () => {
  it("returns the full quantity when the row's qty input was never touched", () => {
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, {})).toBe(10)
  })

  it("falls back to the full quantity when the input was cleared to an empty string", () => {
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, { m1: "" })).toBe(10)
  })

  it("floors fractional input and clamps to the movement's own quantity", () => {
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, { m1: "3.7" })).toBe(3)
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, { m1: "999" })).toBe(10)
  })

  it("never returns less than 1 for negative input", () => {
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, { m1: "-5" })).toBe(1)
  })

  it("입력값 '0'은 유효한 클램프 대상이 아니라 falsy로 취급되어 전량으로 되돌아간다", () => {
    // Number("0") || movement.quantity에서 0은 JS falsy라 movement.quantity로 폴백한다 —
    // 이 함수가 새로 만든 규칙이 아니라 기존 인라인 클램프 식(부모 readPlannedConfirmInput과
    // 동일 패턴)을 그대로 옮긴 것이라, 동작을 바꾸지 않고 여기 그대로 고정해 둔다.
    expect(resolveConfirmQuantity({ id: "m1", quantity: 10 }, { m1: "0" })).toBe(10)
  })
})

describe("collectStalePlannedMovementIds", () => {
  it("keeps only movements whose elapsed days meet the threshold", () => {
    const old = new Date(Date.now() - 40 * 86400000).toISOString()
    const recent = new Date(Date.now() - 5 * 86400000).toISOString()
    const ids = collectStalePlannedMovementIds(
      [
        { id: "stale-1", occurred_at: old },
        { id: "fresh-1", occurred_at: recent },
      ],
      30
    )
    expect(ids).toEqual(["stale-1"])
  })

  it("excludes movements with no date instead of treating them as stale", () => {
    // 날짜 미정 예정 건은 경과일을 알 수 없다 — elapsedDaysSince(null) ?? 0으로 안전하게
    // "방치 아님" 취급한다(방치 아닌데 방치로 단정해 잘못 선택되는 사고 방지).
    const ids = collectStalePlannedMovementIds([{ id: "undated-1", occurred_at: null }], 30)
    expect(ids).toEqual([])
  })
})

describe("shiftSelectRange", () => {
  const orderedIds = ["a", "b", "c", "d", "e"]

  it("includes both endpoints for a forward range", () => {
    expect(shiftSelectRange(orderedIds, "b", "d")).toEqual(["b", "c", "d"])
  })

  it("includes both endpoints for a backward range (anchor after target)", () => {
    expect(shiftSelectRange(orderedIds, "d", "b")).toEqual(["b", "c", "d"])
  })

  it("falls back to selecting only the target when the anchor is no longer visible", () => {
    expect(shiftSelectRange(orderedIds, "z", "c")).toEqual(["c"])
  })

  it("returns a single-item range when anchor and target are the same row", () => {
    expect(shiftSelectRange(orderedIds, "c", "c")).toEqual(["c"])
  })
})

describe("resolvePlannedFifoPreview", () => {
  it("short-circuits to 'assigned' when the movement already has an explicit lot", () => {
    const result = resolvePlannedFifoPreview({ lot_no: "H8" }, stockRow({ lotBalances: [{ lot: "H8", quantity: 10 }] }), 3)
    expect(result).toEqual({ kind: "assigned", label: "H8" })
  })

  it("reports 'unavailable' when no matching stock row exists", () => {
    expect(resolvePlannedFifoPreview({ lot_no: null }, undefined, 3)).toEqual({ kind: "unavailable" })
  })

  it("reports 'no-lot-records' for items that never track lots (OPS·케이블 등)", () => {
    const result = resolvePlannedFifoPreview({ lot_no: null }, stockRow({ lotBalances: [] }), 5)
    expect(result).toEqual({ kind: "no-lot-records" })
  })

  it("reports full FIFO coverage with zero unassigned quantity when lots cover the request", () => {
    const row = stockRow({ lotBalances: [{ lot: "H8", quantity: 32 }, { lot: "C1", quantity: 12 }] })
    const result = resolvePlannedFifoPreview({ lot_no: null }, row, 5)
    expect(result).toEqual({ kind: "fifo", matchedText: "H8 5대", unassignedQty: 0, plan: [{ lot: "H8", quantity: 5 }] })
  })

  it("신정책: 로트 부족분을 '부족'이 아니라 unassignedQty로 표현해 확정을 막지 않는다", () => {
    const row = stockRow({ lotBalances: [{ lot: "H8", quantity: 2 }] })
    const result = resolvePlannedFifoPreview({ lot_no: null }, row, 5)
    expect(result).toEqual({ kind: "fifo", matchedText: "H8 2대", unassignedQty: 3, plan: [{ lot: "H8", quantity: 2 }] })
  })
})

describe("judgeImportFreshness", () => {
  it("returns level 'none' when there has never been an import run", () => {
    expect(judgeImportFreshness(null)).toEqual({
      level: "none",
      failed: false,
      finishedKey: null,
      daysAgo: null,
      state: "none",
      runningMinutes: null,
      basisKey: null,
    })
  })

  it("returns 'danger' for a failed run regardless of how recent it was", () => {
    const result = judgeImportFreshness({
      id: "run-1",
      status: "error",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      rows_imported: null,
      rows_skipped: null,
      error: "boom",
    })
    expect(result.level).toBe("danger")
    expect(result.failed).toBe(true)
  })

  it("returns 'danger' once a successful run is older than STALE_MAX_DAYS(21일)", () => {
    const finished = new Date(Date.now() - 37 * 86400000).toISOString()
    const result = judgeImportFreshness({
      id: "run-2",
      status: "success",
      started_at: finished,
      finished_at: finished,
      rows_imported: 100,
      rows_skipped: 0,
      error: null,
    })
    expect(result.level).toBe("danger")
    expect(result.daysAgo).toBeGreaterThanOrEqual(37)
  })

  it("returns 'warning' between FRESH_MAX_DAYS(7일)와 STALE_MAX_DAYS(21일) 사이", () => {
    const finished = new Date(Date.now() - 14 * 86400000).toISOString()
    const result = judgeImportFreshness({
      id: "run-3",
      status: "success",
      started_at: finished,
      finished_at: finished,
      rows_imported: 100,
      rows_skipped: 0,
      error: null,
    })
    expect(result.level).toBe("warning")
  })

  it("returns 'ok' for a recent successful run", () => {
    const now = new Date().toISOString()
    const result = judgeImportFreshness({
      id: "run-4",
      status: "success",
      started_at: now,
      finished_at: now,
      rows_imported: 100,
      rows_skipped: 0,
      error: null,
    })
    expect(result.level).toBe("ok")
    expect(result.daysAgo).toBe(0)
  })
})
