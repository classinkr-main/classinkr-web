// GET /api/admin/branch/hw — 출고·재고·예정 합계(2026-11-25). 장부 머리 HW 칩과 개요 HW 표가 이 값을 쓴다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { hwActiveLowCount, hwChipLabel, hwTotalsOf } from "@/lib/branch/hw-summary"

const ledgerRow = (product: string, warehouseStock: number, plannedOut: number, outbound30d: number, low = false) => ({
  product, warehouseStock, plannedOut, availableStock: warehouseStock - plannedOut, outbound30d, low,
})

async function loadRoute({ ledger, outbound = [] }: { ledger: unknown[]; outbound?: unknown[] }) {
  vi.resetModules()
  vi.doMock("@/lib/admin-auth", () => ({ verifyAdmin: vi.fn(async (): Promise<NextResponse | null> => null), BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"] }))
  vi.doMock("@/lib/repositories/branch-hw", () => ({
    listHwInbound: vi.fn(async () => [{ product: "S1 강의녹화", quantity: 10 }]),
    listHwOutbound: vi.fn(async () => outbound),
    listHwStock: vi.fn(async () => []),
    BRANCH_HW_CACHE_TAG: "branch-hw",
  }))
  vi.doMock("@/lib/repositories/hardware-inventory", () => ({
    getHardwareDashboard: vi.fn(async () => ({ stock: ledger })),
    HARDWARE_INVENTORY_CACHE_TAG: "hardware-inventory",
  }))
  vi.doMock("next/cache", () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => fn }))
  const route = await import("@/app/api/admin/branch/hw/route")
  const res = await route.GET(new NextRequest("https://classin.kr/api/admin/branch/hw"))
  return res.json()
}

afterEach(() => {
  for (const id of ["@/lib/admin-auth", "@/lib/repositories/branch-hw", "@/lib/repositories/hardware-inventory", "next/cache"]) vi.doUnmock(id)
  vi.resetModules()
})

describe("HW 출고·재고·예정 합계", () => {
  it("원장이 있으면 품목별 30일 출고·창고 재고·출고 예정을 원장 값으로 더한다", async () => {
    const body = await loadRoute({ ledger: [ledgerRow("86\" IFP", 12, 3, 7), ledgerRow("S1", 4, 1, 2, true), ledgerRow("기타 케이블", 99, 0, 50)] })
    const ifp = body.stock.find((row: { product: string }) => row.product === "IFP86")
    expect(ifp).toMatchObject({ io_stock: 12, planned_out: 3, available_stock: 9, outbound_30d: 7 })
    // 주요 7품목만 합친다(패턴 밖 품목은 빠진다). 원장에 없는 품목은 기존 규칙대로 '부족'으로 센다(S1 + 원장에 없는 5품목).
    expect(body.totals).toEqual({ outbound_30d: 9, io_stock: 16, planned_out: 4, available_stock: 12, low_items: 6 })
    expect(hwChipLabel(hwTotalsOf(body))).toBe("HW 출고 9 · 재고 16 · 예정 4")
    // 칩 색은 실제로 쓰는 품목의 부족만 본다(S1 하나)
    expect(hwActiveLowCount(body)).toBe(1)
  })

  it("원장이 없으면 시트 스테이징에서 30일 안의 실제 출고만 센다(예정·오래된 출고 제외)", async () => {
    const today = new Date().toISOString().slice(0, 10)
    const body = await loadRoute({
      ledger: [],
      outbound: [
        { product: "S1 강의녹화", quantity: 2, progress: "설치 완료", outbound_date: today, destination: "가나학원" },
        { product: "S1 강의녹화", quantity: 1, progress: "배송 예정", outbound_date: today, destination: "다라학원" },
        { product: "S1 강의녹화", quantity: 5, progress: "설치 완료", outbound_date: "2020-01-01", destination: "마바학원" },
      ],
    })
    const s1 = body.stock.find((row: { product: string }) => row.product === "S1")
    expect(s1).toMatchObject({ outbound_30d: 2, planned_out: 1, io_stock: 3 })
    expect(body.source).toBe("sheet_staging")
  })

  it("합계가 없는 옛 캐시 응답은 품목 행에서 다시 더한다", () => {
    expect(hwTotalsOf({ stock: [
      { product: "S1", io_stock: 3, outbound_30d: 1, planned_out: 1, available_stock: 2, sheet_stock: 0, low: true },
      { product: "T1", io_stock: 5, outbound_30d: 0, planned_out: 0, available_stock: 5, sheet_stock: 0, low: false },
    ] })).toEqual({ outbound_30d: 1, io_stock: 8, planned_out: 1, available_stock: 7, low_items: 1 })
  })
})
