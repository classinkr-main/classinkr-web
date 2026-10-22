// 오더 품목 줄 — 승인된 견적 버전의 줄을 재고 품목(원장 hardware_items 이름)으로 옮긴다.
// 순수 함수라 서버(lib/repositories/sales-orders.ts)와 테스트가 같은 규칙을 쓴다.
// docs/active/hardware-order-revenue-link-plan-2026-10-22.md §4-3.

import type { PartnerQuoteLineItemInput } from "@/lib/partners-types"

export interface SalesOrderHardwareProduct {
  /** 원장 품목 이름(hardware_items.name 정규화 전 표기, 예: 86" IFP). */
  product: string
  quantity: number
}

export interface SalesOrderLine {
  lineNumber: number
  itemType: string
  itemCode: string | null
  itemName: string
  quantity: number
  unitPrice: number | null
  lineSupplyAmount: number | null
  /** 이 줄이 재고에서 빼야 하는 품목. 설치·배송·소프트웨어 줄은 빈 배열. */
  hardwareProducts: SalesOrderHardwareProduct[]
  /** 하드웨어 줄인데 재고 품목을 못 찾았다 — 승인 화면에 경고로 뜨고 배송 예정에는 안 들어간다. */
  unmappedHardware: boolean
  /** CRM 오더 대사(lib/repositories/hardware-crm-orders.ts)와 같은 줄 참조 — 배송 예정의 reference_no. */
  quoteLineRef: string
}

export type SalesOrderStatus = "pending_approval" | "approved" | "rejected" | "cancelled"
export type SalesOrderAcceptedVia = "customer_link" | "staff"

/** 오더 — 서버(lib/repositories/sales-orders.ts)와 하드웨어 탭 승인 화면이 같은 모양을 쓴다. */
export interface SalesOrder {
  id: string
  orderNo: string | null
  status: SalesOrderStatus
  needsHardwareApproval: boolean
  quoteDocumentId: string
  quoteVersionId: string | null
  quoteNumber: string | null
  dealId: string | null
  customerId: string | null
  customerName: string
  lines: SalesOrderLine[]
  totalAmount: number | null
  currency: string
  acceptedVia: SalesOrderAcceptedVia
  requestedBy: string | null
  requestedAt: string
  decidedBy: string | null
  decidedAt: string | null
  decisionReason: string | null
  plannedMovementIds: string[]
}

// 견적 카탈로그 SKU → 재고 품목. 견적 쪽 표기는 하이픈(lib/product-templates.ts)과 밑줄
// (lib/standard-quote-template.ts) 두 가지가 섞여 있어 둘 다 받는다.
const SKU_TO_PRODUCTS: Record<string, SalesOrderHardwareProduct[]> = {
  "board-86": [{ product: '86" IFP', quantity: 1 }],
  board_86: [{ product: '86" IFP', quantity: 1 }],
  "board-75": [{ product: '75" IFP', quantity: 1 }],
  board_75: [{ product: '75" IFP', quantity: 1 }],
  "camera-t1": [{ product: "T1", quantity: 1 }],
  camera_t1: [{ product: "T1", quantity: 1 }],
  stand: [{ product: "STD1", quantity: 1 }],
  // 86" 패키지 = 보드 + T1 + 벽걸이 설치(설치는 재고가 아니다).
  "bundle-86-t1-wall": [
    { product: '86" IFP', quantity: 1 },
    { product: "T1", quantity: 1 },
  ],
  bundle_86_t1_wall: [
    { product: '86" IFP', quantity: 1 },
    { product: "T1", quantity: 1 },
  ],
}

// 재고가 아닌 하드웨어 SKU(설치 작업). 하드웨어 줄이어도 "매핑 실패"로 보지 않는다.
const NON_STOCK_SKUS = new Set(["wall-mount", "wall_mount"])

/** SKU 가 없을 때(직접 입력한 줄) 품목 이름으로 고른다. 모호하면 null — 승인자가 본다. */
function productsFromName(name: string): SalesOrderHardwareProduct[] | null {
  const text = name.replace(/\s+/g, " ")
  const isBoard = /(전자\s*칠판|IFP|보드|board)/i.test(text)
  if (isBoard && /\b86\b|86["”]/.test(text)) return [{ product: '86" IFP', quantity: 1 }]
  if (isBoard && /\b75\b|75["”]/.test(text)) return [{ product: '75" IFP', quantity: 1 }]
  if (/(^|[^A-Z0-9])T1([^A-Z0-9]|$)/i.test(text)) return [{ product: "T1", quantity: 1 }]
  if (/스탠드|STD1/i.test(text)) return [{ product: "STD1", quantity: 1 }]
  return null
}

export function quoteLineRef(quoteDocumentId: string, line: Pick<PartnerQuoteLineItemInput, "id">, index: number): string {
  return `portal-quote:${quoteDocumentId}:line:${line.id ?? index + 1}`
}

export function buildSalesOrderLines(
  quoteDocumentId: string,
  lineItems: readonly PartnerQuoteLineItemInput[]
): SalesOrderLine[] {
  const lines: SalesOrderLine[] = []
  lineItems.forEach((item, index) => {
    const quantity = Number(item.quantity ?? 0)
    if (!Number.isFinite(quantity) || quantity <= 0) return
    if (item.lineStatus === "informational" || item.itemType === "note_only") return

    const itemType = item.itemType ?? "hardware"
    const itemCode = item.itemCode?.trim() || null
    let hardwareProducts: SalesOrderHardwareProduct[] = []
    let unmappedHardware = false
    if (itemType === "hardware") {
      const fromSku = itemCode ? SKU_TO_PRODUCTS[itemCode] : undefined
      const nonStock = itemCode ? NON_STOCK_SKUS.has(itemCode) : false
      const base = fromSku ?? (nonStock ? [] : productsFromName(item.itemName))
      if (base == null) unmappedHardware = true
      hardwareProducts = (base ?? []).map((entry) => ({ product: entry.product, quantity: entry.quantity * quantity }))
    }

    lines.push({
      lineNumber: item.lineNumber ?? index + 1,
      itemType,
      itemCode,
      itemName: item.itemName,
      quantity,
      unitPrice: item.unitPrice ?? null,
      lineSupplyAmount: item.lineSupplyAmount ?? null,
      hardwareProducts,
      unmappedHardware,
      quoteLineRef: quoteLineRef(quoteDocumentId, item, index),
    })
  })
  return lines
}

/** 하드웨어 승인이 필요한가 — 재고에서 빠질 품목이 있거나, 하드웨어 줄인데 품목을 못 찾았다면 필요하다. */
export function salesOrderNeedsHardwareApproval(lines: readonly SalesOrderLine[]): boolean {
  return lines.some((line) => line.hardwareProducts.length > 0 || line.unmappedHardware)
}

/** 같은 재고 품목을 합친다 — 배송 예정은 품목별 한 줄이다. */
export function summarizeSalesOrderProducts(lines: readonly SalesOrderLine[]): Array<SalesOrderHardwareProduct & { quoteLineRefs: string[] }> {
  const byProduct = new Map<string, { quantity: number; quoteLineRefs: string[] }>()
  for (const line of lines) {
    for (const entry of line.hardwareProducts) {
      const current = byProduct.get(entry.product) ?? { quantity: 0, quoteLineRefs: [] }
      current.quantity += entry.quantity
      if (!current.quoteLineRefs.includes(line.quoteLineRef)) current.quoteLineRefs.push(line.quoteLineRef)
      byProduct.set(entry.product, current)
    }
  }
  return [...byProduct.entries()].map(([product, value]) => ({ product, ...value }))
}

const ORDER_NO_PATTERN = /^ORD-(\d{4})-(\d{3,})$/

/** 오더번호 — ORD-YYMM-NNN(달마다 001부터). 달은 한국 시간 기준. */
export function orderNoPrefix(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit" })
    .formatToParts(now)
  const yy = parts.find((part) => part.type === "year")?.value ?? "00"
  const mm = parts.find((part) => part.type === "month")?.value ?? "00"
  return `ORD-${yy}${mm}`
}

/** 이번 달에 이미 쓴 번호들 다음 번호. 형식이 다른 값은 무시한다. */
export function nextOrderNo(existing: readonly string[], now: Date): string {
  const prefix = orderNoPrefix(now)
  let max = 0
  for (const value of existing) {
    const match = ORDER_NO_PATTERN.exec(value)
    if (!match || `ORD-${match[1]}` !== prefix) continue
    max = Math.max(max, Number(match[2]))
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`
}
