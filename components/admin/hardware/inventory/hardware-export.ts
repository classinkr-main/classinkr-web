// 하드웨어 탭 출력 — 화면이 읽은 표를 그대로 TSV(클립보드)·CSV(파일)로 가져간다(하드웨어 라운드 2 B, `export-option`).
// 순수 모듈: 표 → 2차원 배열만 만든다. 이스케이프·수식 주입 방지·BOM 은 공용 lib/export/delimited.ts·browser-download.ts 가 한다.
// 숫자는 원값(대수 정수·USD 소수)으로 넘긴다 — 엑셀 재계산이 목적이고, 화면 축약은 표시 전용이다(결정 HW-E5).
// 전부 읽기 전용 내려받기다(원장 쓰기 아님).

import type { DelimitedCell } from "@/lib/export/delimited"
import { inboundMovementLot } from "./inbound-sheet-model"
import {
  customerLabel,
  formatLotLabel,
  isPlannedMovement,
  loanElapsedDays,
  MOVEMENT_LABEL,
  outboundSaleType,
  SALE_TYPE_META,
  SAMPLE_STATUS_META,
  type HardwareMovement,
  type HardwareSampleEvent,
  type HardwareSampleUnit,
  type HardwareStockRow,
} from "./shared"

export type ExportRows = DelimitedCell[][]

function dateKey(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ""
}

function lotOf(movement: HardwareMovement): string {
  const lot = inboundMovementLot(movement)
  return lot ? formatLotLabel(lot) ?? lot : ""
}

function daysSince(dateValue: string | null | undefined, today: string): number | null {
  if (!dateValue) return null
  const start = Date.parse(`${dateValue.slice(0, 10)}T00:00:00Z`)
  const end = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return Math.round((end - start) / 86400000)
}

// ---- 내역(원장) ----

export const HISTORY_EXPORT_HEADER = [
  "날짜",
  "유형",
  "판매유형",
  "상태",
  "품목",
  "수량",
  "출발",
  "도착",
  "고객사",
  "물량번호",
  "참조번호",
  "담당자",
  "특이사항",
  "단가(USD)",
  "금액(USD)",
  "금액(CNY)",
  "시리얼",
  "원천",
  "취소일",
  "취소 사유",
  "ID",
] as const

/** 내역 탭의 **현재 필터 결과 전체**(페이지 무관) → 행. 취소 포함을 켰으면 취소 행도 취소일·사유와 함께 나간다. */
export function buildHistoryExportRows(movements: readonly HardwareMovement[]): ExportRows {
  const rows: ExportRows = [[...HISTORY_EXPORT_HEADER]]
  for (const movement of movements) {
    const saleType = outboundSaleType(movement)
    const planned = movement.movement_type === "outbound" && isPlannedMovement(movement)
    rows.push([
      dateKey(movement.occurred_at),
      planned ? "배송 예정" : MOVEMENT_LABEL[movement.movement_type],
      saleType ? SALE_TYPE_META[saleType].label : "",
      movement.status ?? "",
      movement.product_name,
      movement.quantity,
      movement.from_location ?? "",
      movement.to_location ?? "",
      movement.movement_type === "outbound" ? customerLabel(movement.to_location) : "",
      lotOf(movement),
      movement.reference_no ?? "",
      movement.owner ?? "",
      movement.memo ?? "",
      movement.unit_price,
      movement.amount_usd,
      movement.amount_cny,
      (movement.serials ?? []).join(" "),
      movement.source === "sheet_import" ? "시트 이관" : "어드민 기록",
      dateKey(movement.voided_at),
      movement.void_reason ?? "",
      movement.id,
    ])
  }
  return rows
}

// ---- 홈 예상 출고 큐 ----

export const PLANNED_EXPORT_HEADER = ["예정일", "경과일", "고객사", "품목", "수량", "물량번호", "참조번호", "담당자", "특이사항", "ID"] as const

/** 예상 출고 → 행. 선택이 있으면 호출부가 선택분만 넘긴다(연락·배차용 목록). */
export function buildPlannedExportRows(movements: readonly HardwareMovement[], today: string): ExportRows {
  const rows: ExportRows = [[...PLANNED_EXPORT_HEADER]]
  for (const movement of movements) {
    rows.push([
      dateKey(movement.occurred_at),
      daysSince(movement.occurred_at, today),
      customerLabel(movement.to_location),
      movement.product_name,
      movement.quantity,
      lotOf(movement),
      movement.reference_no ?? "",
      movement.owner ?? "",
      movement.memo ?? "",
      movement.id,
    ])
  }
  return rows
}

// ---- 홈 재고 ----

export const STOCK_EXPORT_HEADER = [
  "품목",
  "분류",
  "창고",
  "배송 예정",
  "가용",
  "최근 30일 출고",
  "권장 주문점",
  "최소 재고",
  "상태",
  "로트 잔량",
] as const

export function buildStockExportRows(stock: readonly HardwareStockRow[]): ExportRows {
  const rows: ExportRows = [[...STOCK_EXPORT_HEADER]]
  for (const row of stock) {
    rows.push([
      row.product,
      row.category ?? "",
      row.warehouseStock,
      row.plannedOut,
      row.availableStock,
      row.outbound30d,
      row.trendOrderPoint,
      row.reorderPoint,
      row.warehouseStock < 0 ? "원장 점검" : row.low ? "부족" : row.orderRecommended ? "주문 검토" : "정상",
      row.lotBalances.map((lot) => `${formatLotLabel(lot.lot) ?? lot.lot} ${lot.quantity}`).join(" · "),
    ])
  }
  return rows
}

// ---- 입고 lot ----

interface InboundLotLike {
  lot: string
  displayLot: string
  date: string
  importer: string | null
  items: readonly HardwareMovement[]
}

/**
 * lot 구성 → 입고표 붙여넣기 형식 TSV 행(품목·수량·단가). 입고표 "엑셀에서 붙여넣기"에 그대로 되돌려 붙이면 같은 구성이
 * 된다(머리글 줄은 파서가 건너뛴다). 같은 품목이 여러 줄이면 수량을 합치고, 단가는 먼저 적힌 값.
 */
export function buildLotCompositionRows(lot: InboundLotLike): ExportRows {
  const merged = new Map<string, { quantity: number; unitPrice: number | null }>()
  for (const movement of lot.items) {
    const entry = merged.get(movement.product_name) ?? { quantity: 0, unitPrice: null }
    entry.quantity += movement.quantity
    if (entry.unitPrice == null && movement.unit_price != null) entry.unitPrice = movement.unit_price
    merged.set(movement.product_name, entry)
  }
  const rows: ExportRows = [["품목", "수량", "단가"]]
  for (const [productName, entry] of merged) rows.push([productName, entry.quantity, entry.unitPrice])
  return rows
}

export const INBOUND_LOTS_EXPORT_HEADER = ["물량번호", "입고일", "수입자", "품목", "수량", "단가(USD)", "금액(USD)", "금액(CNY)", "보관처", "ID"] as const

export function buildInboundLotsExportRows(lots: readonly InboundLotLike[]): ExportRows {
  const rows: ExportRows = [[...INBOUND_LOTS_EXPORT_HEADER]]
  for (const lot of lots) {
    for (const movement of lot.items) {
      rows.push([
        lot.displayLot,
        dateKey(movement.occurred_at) || (lot.date === "-" ? "" : lot.date),
        movement.importer ?? lot.importer ?? "",
        movement.product_name,
        movement.quantity,
        movement.unit_price,
        movement.amount_usd,
        movement.amount_cny,
        movement.storage_location ?? movement.to_location ?? "",
        movement.id,
      ])
    }
  }
  return rows
}

// ---- 출고 기간 집계 ----

interface OutboundBucketLike {
  label: string
  total: number
  revenue: number
  hasRevenue: boolean
  customers: ReadonlyArray<{ name: string; qty: number; revenue: number; hasRevenue: boolean; dateLabel: string }>
}

/** 기간 × 고객사 → 행. 기간 합계 행을 먼저, 그 아래 고객사 행(엑셀에서 피벗하기 쉬운 평평한 표). */
export function buildOutboundPeriodExportRows(buckets: readonly OutboundBucketLike[]): ExportRows {
  const rows: ExportRows = [["기간", "구분", "고객사", "대수", "매출(USD, 실판매)", "출고일"]]
  for (const bucket of buckets) {
    rows.push([bucket.label, "기간 합계", "", bucket.total, bucket.hasRevenue ? bucket.revenue : null, ""])
    for (const customer of bucket.customers) {
      rows.push([bucket.label, "고객사", customer.name, customer.qty, customer.hasRevenue ? customer.revenue : null, customer.dateLabel])
    }
  }
  return rows
}

// ---- 샘플 트래커 ----

export const SAMPLE_UNITS_EXPORT_HEADER = [
  "관리번호",
  "품목",
  "상태",
  "고객",
  "대여일",
  "경과일",
  "회수 예정일",
  "회수까지(일)",
  "최근 메모",
  "시리얼",
] as const

/** 트래커의 현재 필터 유닛 → 후속 연락 목록(대여중이면 고객·대여일·회수 예정일). */
export function buildSampleUnitsExportRows(
  units: readonly HardwareSampleUnit[],
  latestEvents: Readonly<Record<string, HardwareSampleEvent>>,
  today: string
): ExportRows {
  const rows: ExportRows = [[...SAMPLE_UNITS_EXPORT_HEADER]]
  for (const unit of units) {
    const loaned = unit.status === "loaned"
    const dueIn = loaned && unit.expected_return_at ? -(daysSince(unit.expected_return_at, today) ?? 0) : null
    rows.push([
      unit.asset_code,
      unit.product_name,
      SAMPLE_STATUS_META[unit.status]?.label ?? unit.status,
      loaned ? unit.current_customer ?? "고객 미상" : "",
      loaned ? dateKey(unit.loaned_at) : "",
      loaned ? loanElapsedDays(unit.loaned_at) : null,
      loaned ? dateKey(unit.expected_return_at) : "",
      dueIn,
      latestEvents[unit.id]?.memo ?? "",
      unit.serial_no ?? "",
    ])
  }
  return rows
}
