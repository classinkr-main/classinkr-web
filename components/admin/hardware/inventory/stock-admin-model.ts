// 재고 관리 폼(재고 조정 · 품목 설정)과 물류번호 조회의 순수 모델 — React·DOM 을 쓰지 않는다.
// 화면(AdjustmentSheet·ItemSettingsSheet·InboundSheet)은 입력 상태만 들고, 검증·전송 형식·응답 해석은 여기서 한다.
// 네트워크 함수는 fetcher 를 인자로 받는다(화면은 adminFetchJson, 테스트는 목).
//
// 계약: docs/active/hardware-inventory-process-gap-2026-10-28.md §7-3.

import { HARDWARE_REPORT_GROUPS, type HardwareReportGroup } from "@/lib/hardware/inventory-process"
import type { HardwareItem } from "./shared"

export type JsonFetcher = <T>(input: string, init?: { method?: string; body?: string }) => Promise<T>

// ---------------------------------------------------------------------------
// 물류번호 조회 — GET /api/admin/hardware/lots?itemId=

export interface HardwareLotsSnapshot {
  itemId: string | null
  product: string | null
  lotTracked: boolean
  lots: Array<{ lotNo: string; remaining: number }>
  nextLotNo: string | null
}

/** 응답 모양을 지킨다 — 이상한 줄은 버리고, 칸이 없으면 물류번호 관리 품목으로 본다. */
export function parseHardwareLotsResponse(value: unknown): HardwareLotsSnapshot {
  const body = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const lots = Array.isArray(body.lots)
    ? body.lots.flatMap((lot) => {
        if (!lot || typeof lot !== "object") return []
        const lotNo = typeof (lot as { lotNo?: unknown }).lotNo === "string" ? (lot as { lotNo: string }).lotNo.trim() : ""
        const remaining = Number((lot as { remaining?: unknown }).remaining)
        return lotNo && Number.isFinite(remaining) ? [{ lotNo, remaining }] : []
      })
    : []
  return {
    itemId: typeof body.itemId === "string" ? body.itemId : null,
    product: typeof body.product === "string" ? body.product : null,
    lotTracked: body.lotTracked !== false,
    lots,
    nextLotNo: typeof body.nextLotNo === "string" && body.nextLotNo.trim() ? body.nextLotNo.trim() : null,
  }
}

export async function fetchHardwareLots(fetcher: JsonFetcher, itemId: string): Promise<HardwareLotsSnapshot> {
  const result = await fetcher<unknown>(`/api/admin/hardware/lots?itemId=${encodeURIComponent(itemId)}`)
  return parseHardwareLotsResponse(result)
}

// ---------------------------------------------------------------------------
// 재고 조정 — POST /api/admin/hardware/movements { movementType: "adjust" }

export type AdjustDirection = "increase" | "decrease"

export interface AdjustmentDraft {
  itemId: string
  direction: AdjustDirection | null
  quantity: string
  // "" = 물류번호 없이 조정. 물류번호 관리 품목만 고른다.
  lotNo: string
  reason: string
  occurredAt: string
  owner?: string
}

export interface AdjustmentPayload {
  itemId: string
  productName: string
  movementType: "adjust"
  adjustDirection: AdjustDirection
  quantity: number
  occurredAt: string
  owner: string
  status: string
  memo: string
  lotNo?: string
}

export interface AdjustmentValidation {
  errors: Partial<Record<"item" | "direction" | "quantity" | "lot" | "reason" | "date", string>>
  // 저장은 막지 않는 안내 — 줄이면 음수가 되는 물류번호 등.
  warnings: string[]
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parsePositiveInt(text: string): number | null {
  const cleaned = text.trim().replace(/,(?=\d{3}(?!\d))/g, "")
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) && value >= 1 ? value : null
}

function parseNonNegativeInt(text: string): number | null {
  const cleaned = text.trim()
  if (!/^\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isSafeInteger(value) ? value : null
}

export function validateAdjustmentDraft(
  draft: AdjustmentDraft,
  context: { item: Pick<HardwareItem, "id" | "name" | "lot_tracked"> | null; lots?: HardwareLotsSnapshot | null }
): AdjustmentValidation {
  const errors: AdjustmentValidation["errors"] = {}
  const warnings: string[] = []
  if (!context.item) errors.item = "조정할 품목을 고르세요."
  if (!draft.direction) errors.direction = "늘림·줄임을 고르세요."
  const quantity = parsePositiveInt(draft.quantity)
  if (quantity == null) errors.quantity = "수량은 1 이상 정수로 입력하세요."
  if (!draft.reason.trim()) errors.reason = "조정 사유를 적으세요(실사 차이·파손·분실 등)."
  if (!DATE_KEY_PATTERN.test(draft.occurredAt.trim())) errors.date = "조정일을 YYYY-MM-DD 형식으로 입력하세요."

  const lotNo = draft.lotNo.trim()
  const lotTracked = context.item?.lot_tracked !== false
  if (lotNo) {
    if (!lotTracked) {
      errors.lot = "물류번호를 관리하지 않는 품목입니다 — 물류번호 없이 조정하세요."
    } else if (context.lots) {
      const lot = context.lots.lots.find((candidate) => candidate.lotNo === lotNo)
      if (!lot && draft.direction === "decrease") {
        errors.lot = `${lotNo}은(는) 잔여가 없는 물류번호입니다.`
      } else if (lot && draft.direction === "decrease" && quantity != null && lot.remaining < quantity) {
        warnings.push(`${lotNo} 잔여는 ${lot.remaining}대입니다 — ${quantity}대를 줄이면 다른 물류번호에서 빠진 것으로 해석됩니다.`)
      }
    }
  }
  return { errors, warnings }
}

export function adjustmentDraftIsValid(validation: AdjustmentValidation): boolean {
  return Object.keys(validation.errors).length === 0
}

/** 서버가 창고 출발·도착을 정한다(§7-3) — 위치 칸은 보내지 않는다. 사유는 memo 로 간다. */
export function buildAdjustmentPayload(
  draft: AdjustmentDraft,
  item: Pick<HardwareItem, "id" | "name" | "lot_tracked">
): AdjustmentPayload | null {
  const quantity = parsePositiveInt(draft.quantity)
  if (!draft.direction || quantity == null || !draft.reason.trim()) return null
  const lotNo = item.lot_tracked !== false ? draft.lotNo.trim() : ""
  return {
    itemId: item.id,
    productName: item.name,
    movementType: "adjust",
    adjustDirection: draft.direction,
    quantity,
    occurredAt: draft.occurredAt.trim(),
    owner: (draft.owner ?? "").trim(),
    status: "재고 조정",
    memo: draft.reason.trim(),
    ...(lotNo ? { lotNo } : {}),
  }
}

export async function submitAdjustment(fetcher: JsonFetcher, payload: AdjustmentPayload) {
  return fetcher<{ movement?: { id?: string } | null; movements?: unknown[] }>("/api/admin/hardware/movements", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

// ---------------------------------------------------------------------------
// 품목 설정 — PATCH /api/admin/hardware/items/[id]

export interface ItemSettingsDraft {
  reorderPoint: string
  leadTimeDays: string
  lotTracked: boolean
  // "" = 미지정
  reportGroup: HardwareReportGroup | ""
  sortOrder: string
}

export interface ItemSettingsPatch {
  reorderPoint?: number
  leadTimeDays?: number
  lotTracked?: boolean
  reportGroup?: HardwareReportGroup | null
  sortOrder?: number | null
}

export type ItemSettingsSource = Pick<HardwareItem, "reorder_point" | "lead_time_days" | "lot_tracked" | "report_group" | "sort_order">

export function itemSettingsDraftFrom(item: ItemSettingsSource): ItemSettingsDraft {
  return {
    reorderPoint: String(item.reorder_point ?? 0),
    leadTimeDays: String(item.lead_time_days ?? 0),
    lotTracked: item.lot_tracked !== false,
    reportGroup: item.report_group && (HARDWARE_REPORT_GROUPS as readonly string[]).includes(item.report_group) ? item.report_group : "",
    sortOrder: item.sort_order != null ? String(item.sort_order) : "",
  }
}

export interface ItemSettingsValidation {
  errors: Partial<Record<keyof ItemSettingsDraft, string>>
  patch: ItemSettingsPatch
}

/** 바뀐 칸만 patch 에 싣는다. 바뀐 값이 없으면 patch 가 비어 있다. */
export function validateItemSettings(draft: ItemSettingsDraft, item: ItemSettingsSource): ItemSettingsValidation {
  const errors: ItemSettingsValidation["errors"] = {}
  const patch: ItemSettingsPatch = {}

  const reorderPoint = parseNonNegativeInt(draft.reorderPoint)
  if (reorderPoint == null) errors.reorderPoint = "최소재고는 0 이상 정수로 입력하세요."
  else if (reorderPoint !== item.reorder_point) patch.reorderPoint = reorderPoint

  const leadTimeDays = parseNonNegativeInt(draft.leadTimeDays)
  if (leadTimeDays == null) errors.leadTimeDays = "리드타임은 0 이상 정수(일)로 입력하세요."
  else if (leadTimeDays !== item.lead_time_days) patch.leadTimeDays = leadTimeDays

  if (draft.lotTracked !== (item.lot_tracked !== false)) patch.lotTracked = draft.lotTracked

  const currentGroup = item.report_group ?? null
  const nextGroup = draft.reportGroup || null
  if (nextGroup && !(HARDWARE_REPORT_GROUPS as readonly string[]).includes(nextGroup)) errors.reportGroup = "보고 묶음을 목록에서 고르세요."
  else if (nextGroup !== currentGroup) patch.reportGroup = nextGroup

  const sortText = draft.sortOrder.trim()
  if (!sortText) {
    if (item.sort_order != null) patch.sortOrder = null
  } else if (!/^-?\d+$/.test(sortText) || !Number.isSafeInteger(Number(sortText))) {
    errors.sortOrder = "정렬은 정수로 입력하세요(작을수록 앞)."
  } else if (Number(sortText) !== item.sort_order) {
    patch.sortOrder = Number(sortText)
  }

  return { errors, patch }
}

export async function saveItemSettings(fetcher: JsonFetcher, itemId: string, patch: ItemSettingsPatch) {
  return fetcher<{ item?: Partial<HardwareItem> }>(`/api/admin/hardware/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
}

// ---------------------------------------------------------------------------
// CRM 고객 고르기 — GET /api/admin/hardware/customers?q= (직배송 고객사)

export interface HardwareCrmCustomer {
  id: string
  name: string
  campusName: string | null
  regionLabel: string | null
}

export function parseHardwareCustomersResponse(value: unknown): HardwareCrmCustomer[] {
  const list = value && typeof value === "object" ? (value as { customers?: unknown }).customers : null
  if (!Array.isArray(list)) return []
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    const name = typeof record.name === "string" ? record.name.trim() : ""
    if (!id || !name) return []
    return [
      {
        id,
        name,
        campusName: typeof record.campusName === "string" && record.campusName.trim() ? record.campusName.trim() : null,
        regionLabel: typeof record.regionLabel === "string" && record.regionLabel.trim() ? record.regionLabel.trim() : null,
      },
    ]
  })
}

export async function searchHardwareCustomers(fetcher: JsonFetcher, query: string): Promise<HardwareCrmCustomer[]> {
  const result = await fetcher<unknown>(`/api/admin/hardware/customers?q=${encodeURIComponent(query.trim())}`)
  return parseHardwareCustomersResponse(result)
}
