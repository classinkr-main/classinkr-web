// lib/orders/order-lines.ts — 견적 줄 → 오더 줄(재고 품목) 변환과 오더번호 규칙.
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3.
import { describe, expect, it } from "vitest"

import {
  buildSalesOrderLines,
  nextOrderNo,
  orderNoPrefix,
  quoteLineRef,
  salesOrderNeedsHardwareApproval,
  summarizeSalesOrderProducts,
} from "@/lib/orders/order-lines"
import type { PartnerQuoteLineItemInput } from "@/lib/partners-types"

function line(overrides: Partial<PartnerQuoteLineItemInput>): PartnerQuoteLineItemInput {
  return {
    itemType: "hardware",
    itemName: "품목",
    quantity: 1,
    unitPrice: 1_000_000,
    ...overrides,
  } as PartnerQuoteLineItemInput
}

describe("buildSalesOrderLines", () => {
  it("카탈로그 SKU(하이픈·밑줄 둘 다)를 재고 품목으로 옮기고 수량을 곱한다", () => {
    const lines = buildSalesOrderLines("qd_1", [
      line({ id: "a", itemCode: "board-86", itemName: "ClassIn Board 86", quantity: 3 }),
      line({ id: "b", itemCode: "camera_t1", itemName: "ClassIn T1", quantity: 2 }),
    ])

    expect(lines.map((entry) => entry.hardwareProducts)).toEqual([
      [{ product: '86" IFP', quantity: 3 }],
      [{ product: "T1", quantity: 2 }],
    ])
    expect(lines[0].quoteLineRef).toBe("portal-quote:qd_1:line:a")
    expect(lines.every((entry) => !entry.unmappedHardware)).toBe(true)
  })

  it("패키지는 보드와 T1 두 품목으로 풀고, 벽걸이 설치는 재고가 아니라 비워 둔다", () => {
    const lines = buildSalesOrderLines("qd_1", [
      line({ itemCode: "bundle-86-t1-wall", itemName: "86 패키지", quantity: 2 }),
      line({ itemCode: "wall-mount", itemName: "벽걸이 설치", quantity: 2 }),
    ])

    expect(lines[0].hardwareProducts).toEqual([
      { product: '86" IFP', quantity: 2 },
      { product: "T1", quantity: 2 },
    ])
    expect(lines[1].hardwareProducts).toEqual([])
    expect(lines[1].unmappedHardware).toBe(false)
  })

  it("SKU 가 없으면 품목 이름으로 고르고, 모호하면 매핑 실패로 표시한다", () => {
    const lines = buildSalesOrderLines("qd_1", [
      line({ itemName: '전자칠판 75"' }),
      line({ itemName: "회의용 카메라 T1" }),
      line({ itemName: "이동형 스탠드" }),
      line({ itemName: "특주 브래킷" }),
    ])

    expect(lines.map((entry) => entry.hardwareProducts[0]?.product ?? null)).toEqual(['75" IFP', "T1", "STD1", null])
    expect(lines[3].unmappedHardware).toBe(true)
  })

  it("수량 0·안내 줄·메모 줄은 빼고, 설치·서비스 줄은 재고 없이 남긴다", () => {
    const lines = buildSalesOrderLines("qd_1", [
      line({ itemCode: "board-86", quantity: 0 }),
      line({ itemCode: "board-86", lineStatus: "informational" }),
      line({ itemType: "note_only", itemName: "메모" }),
      line({ itemType: "installation", itemName: "설치비" }),
      line({ itemType: "service", itemName: "ClassIn 라이선스" }),
    ])

    expect(lines.map((entry) => entry.itemName)).toEqual(["설치비", "ClassIn 라이선스"])
    expect(lines.every((entry) => entry.hardwareProducts.length === 0 && !entry.unmappedHardware)).toBe(true)
    expect(salesOrderNeedsHardwareApproval(lines)).toBe(false)
  })

  it("줄 id 가 없으면 순번(1부터)으로 줄 참조를 만든다 — CRM 오더 대사와 같은 규칙", () => {
    expect(quoteLineRef("qd_9", {}, 0)).toBe("portal-quote:qd_9:line:1")
    expect(quoteLineRef("qd_9", { id: "x" }, 4)).toBe("portal-quote:qd_9:line:x")
  })
})

describe("salesOrderNeedsHardwareApproval", () => {
  it("재고 품목이 있거나 매핑 실패한 하드웨어 줄이 있으면 승인이 필요하다", () => {
    expect(salesOrderNeedsHardwareApproval(buildSalesOrderLines("q", [line({ itemCode: "stand" })]))).toBe(true)
    expect(salesOrderNeedsHardwareApproval(buildSalesOrderLines("q", [line({ itemName: "특주 브래킷" })]))).toBe(true)
    expect(salesOrderNeedsHardwareApproval([])).toBe(false)
  })
})

describe("summarizeSalesOrderProducts", () => {
  it("같은 재고 품목을 줄을 넘어 합친다", () => {
    const lines = buildSalesOrderLines("qd_1", [
      line({ id: "a", itemCode: "board-86", quantity: 2 }),
      line({ id: "b", itemCode: "bundle_86_t1_wall", quantity: 1 }),
    ])

    expect(summarizeSalesOrderProducts(lines)).toEqual([
      { product: '86" IFP', quantity: 3, quoteLineRefs: ["portal-quote:qd_1:line:a", "portal-quote:qd_1:line:b"] },
      { product: "T1", quantity: 1, quoteLineRefs: ["portal-quote:qd_1:line:b"] },
    ])
  })
})

describe("오더번호", () => {
  it("달은 한국 시간 기준이다(UTC 10/31 16시 = 서울 11/1)", () => {
    expect(orderNoPrefix(new Date("2026-10-31T14:59:00Z"))).toBe("ORD-2610")
    expect(orderNoPrefix(new Date("2026-10-31T16:00:00Z"))).toBe("ORD-2611")
  })

  it("이번 달 최대 번호 다음을 쓰고, 다른 달·다른 형식은 무시한다", () => {
    const now = new Date("2026-10-22T03:00:00Z")
    expect(nextOrderNo([], now)).toBe("ORD-2610-001")
    expect(nextOrderNo(["ORD-2610-001", "ORD-2610-014", "ORD-2609-099", "메모", "ORD-2610-7"], now)).toBe("ORD-2610-015")
    expect(nextOrderNo(["ORD-2610-999"], now)).toBe("ORD-2610-1000")
  })
})
