// 출고 등록 v2 — 화면 검증·전송 칸을 한 곳에서 정한다(정의서 §출고, 결정 D4·D6).
// 서버(W1)가 같은 규칙으로 막는다. 여기서는 저장 전에 같은 문구로 먼저 보여 준다.
// 계약: docs/active/hardware-inventory-process-gap-2026-10-28.md §7-3. 순수 함수만 둔다.

import {
  assertLotSelectable,
  HARDWARE_OUTBOUND_TYPE_LABELS,
  HARDWARE_PROGRESS_STATUS,
  isHardwareOutboundType,
  LotRuleError,
  type HardwareOutboundType,
  type LotRemaining,
} from "@/lib/hardware/inventory-process"

import type { HardwareMovementType } from "./shared"

/** 고객사가 아닌 내부 위치 — 이쪽으로 가는 출고는 유형·고객이 필요 없다(사무실 샘플 풀·수리 등). */
export const INTERNAL_OUTBOUND_LOCATIONS: ReadonlySet<string> = new Set(["창고", "사무실", "샘플", "샘플 풀", "수리"])

/** 창고 로트에서 빠지는 출발지 — 비어 있으면 창고로 본다(프리셋 기본값). */
export function isWarehouseSource(fromLocation: string | null | undefined): boolean {
  const from = (fromLocation ?? "").trim()
  return from === "" || from === "창고"
}

/**
 * 고객사로 가는 출고인가. 도착지가 비어 있어도 출고면 고객 출고로 본다 — 그래야 "고객을 고르세요"가 뜬다.
 * 사무실·샘플·수리처럼 내부 위치로 가는 출고는 기존 흐름 그대로 둔다.
 */
export function isCustomerOutbound(input: { movementType: HardwareMovementType; toLocation: string | null | undefined }): boolean {
  if (input.movementType !== "outbound") return false
  return !INTERNAL_OUTBOUND_LOCATIONS.has((input.toLocation ?? "").trim())
}

/** 고객 출고의 진행 상태 — 새 기록은 둘 중 하나만 쓴다. */
export function customerOutboundStatus(isPlanned: boolean): string {
  return isPlanned ? HARDWARE_PROGRESS_STATUS.planned : HARDWARE_PROGRESS_STATUS.installed
}

export type CustomerInputMode = "crm" | "free"

export type OutboundV2Field = "occurredAt" | "outboundType" | "customer" | "expectedReturnAt" | "lotNo"

export interface OutboundV2Issue {
  field: OutboundV2Field
  message: string
}

/**
 * 로트 요구. lots 가 null 이면 잔여를 아직 모른다(불러오는 중·조회 실패) — 그때는 필수 여부만 보고
 * 잔여 초과는 서버 422 가 막는다.
 */
export interface LotRequirement {
  lotTracked: boolean
  lots: readonly LotRemaining[] | null
}

export const NO_LOT_REQUIREMENT: LotRequirement = { lotTracked: false, lots: null }

export interface OutboundV2Input {
  movementType: HardwareMovementType
  productName: string
  quantity: number
  occurredAt: string | null | undefined
  fromLocation: string | null | undefined
  toLocation: string | null | undefined
  outboundType: HardwareOutboundType | "" | null | undefined
  customerId: string | null | undefined
  /** 없으면(바구니 줄 등) customerId 가 있으면 crm, 없으면 직접 입력으로 본다. */
  customerMode?: CustomerInputMode
  expectedReturnAt: string | null | undefined
  lotNo: string | null | undefined
  lot: LotRequirement
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

function isDateKey(value: string | null | undefined): value is string {
  return typeof value === "string" && DATE_KEY.test(value.trim())
}

/** 출고 등록 규칙 위반 목록 — 비어 있으면 저장해도 된다. 출고가 아니면 늘 빈 배열이다. */
export function outboundV2Issues(input: OutboundV2Input): OutboundV2Issue[] {
  if (input.movementType !== "outbound") return []
  const issues: OutboundV2Issue[] = []
  const customer = isCustomerOutbound(input)

  if (customer) {
    if (!isDateKey(input.occurredAt)) {
      issues.push({ field: "occurredAt", message: "출고일을 입력하세요." })
    }
    if (!isHardwareOutboundType(input.outboundType)) {
      issues.push({ field: "outboundType", message: "출고 유형(세일즈·프로모션·A/S·샘플)을 고르세요." })
    }
    const mode: CustomerInputMode = input.customerMode ?? (input.customerId ? "crm" : "free")
    if (mode === "crm" && !input.customerId) {
      issues.push({ field: "customer", message: "CRM 고객을 고르세요. 목록에 없는 곳이면 'CRM에 없는 곳'으로 직접 입력하세요." })
    } else if (!(input.toLocation ?? "").trim()) {
      issues.push({ field: "customer", message: "도착(고객사)을 입력하세요." })
    }
    if (input.outboundType === "sample") {
      if (!isDateKey(input.expectedReturnAt)) {
        issues.push({ field: "expectedReturnAt", message: "샘플 출고는 반납 예정일이 필요합니다." })
      } else if (isDateKey(input.occurredAt) && input.expectedReturnAt.trim() < input.occurredAt.trim()) {
        issues.push({ field: "expectedReturnAt", message: "반납 예정일이 출고일보다 빠릅니다." })
      }
    }
  }

  // 물류번호 관리 품목이 창고 로트에서 고객사로 나갈 때만 고른다. 내부 이동(사무실·샘플 풀·수리)은 서버가
  // 예전처럼 FIFO 로 배정한다(W1 계약) — 사무실 샘플 반출은 로트 자체가 없다.
  if (customer && input.lot.lotTracked && isWarehouseSource(input.fromLocation)) {
    try {
      if (input.lot.lots) {
        assertLotSelectable({
          productName: input.productName || "이 품목",
          lotTracked: true,
          lotNo: input.lotNo,
          quantity: input.quantity,
          lots: input.lot.lots,
        })
      } else if (!(input.lotNo ?? "").trim()) {
        throw new LotRuleError(`${input.productName || "이 품목"}은(는) 물류번호를 골라야 합니다.`)
      }
    } catch (error) {
      if (!(error instanceof LotRuleError)) throw error
      issues.push({ field: "lotNo", message: error.message })
    }
  }

  return issues
}

/** 첫 위반 문구 — 폼 상단 알림 한 줄용. */
export function validateOutboundV2(input: OutboundV2Input): string | null {
  return outboundV2Issues(input)[0]?.message ?? null
}

/** 화면이 들고 있는 출고 v2 입력 상태(부모 시트 상태와 별개). */
export interface OutboundV2DraftState {
  outboundType: HardwareOutboundType | ""
  customerId: string | null
  customerMode: CustomerInputMode
  expectedReturnAt: string
  /** 다른 담당 지정(입고관리 권한자만). null = 본인(서버가 로그인 계정으로 채운다). */
  ownerUserId: string | null
  /** 입고 무상 여부 — 빠른 기록 시트의 입고(수정 포함)에서 필수. null = 아직 고르지 않음. */
  isFree: boolean | null
  /** 재고 조정 방향. */
  adjustDirection: "increase" | "decrease"
}

export const INITIAL_OUTBOUND_V2_STATE: OutboundV2DraftState = {
  outboundType: "",
  customerId: null,
  customerMode: "crm",
  expectedReturnAt: "",
  ownerUserId: null,
  isFree: null,
  adjustDirection: "decrease",
}

/** 드래프트·전송 본문에 얹는 새 칸. undefined 인 칸은 JSON 에 실리지 않는다. */
export interface ProcessDraftFields {
  outboundType?: HardwareOutboundType
  customerId?: string
  expectedReturnAt?: string
  ownerUserId?: string
  isFree?: boolean
  adjustDirection?: "increase" | "decrease"
}

/**
 * 유형별로 보낼 칸만 고른다 — 내부 이동에 유형·고객이 실리거나, 샘플이 아닌 출고에 반납 예정일이 남지 않게.
 * 담당 지정은 모든 유형에 실린다(서버가 권한을 본다).
 */
export function processDraftFields(
  state: OutboundV2DraftState,
  context: { movementType: HardwareMovementType; toLocation: string }
): ProcessDraftFields {
  const fields: ProcessDraftFields = {}
  if (state.ownerUserId) fields.ownerUserId = state.ownerUserId
  if (context.movementType === "outbound" && isCustomerOutbound(context)) {
    if (isHardwareOutboundType(state.outboundType)) fields.outboundType = state.outboundType
    if (state.customerMode === "crm" && state.customerId) fields.customerId = state.customerId
    if (state.outboundType === "sample" && state.expectedReturnAt.trim()) fields.expectedReturnAt = state.expectedReturnAt.trim()
  }
  if (context.movementType === "inbound" && state.isFree != null) fields.isFree = state.isFree
  if (context.movementType === "adjust") fields.adjustDirection = state.adjustDirection
  return fields
}

/** 빠른 기록 시트의 입고·조정 추가 규칙(서버 §7-3: 입고 isFree 필수, 조정 사유 필수). */
export function validateInboundAdjustExtras(input: {
  movementType: HardwareMovementType
  isFree: boolean | null | undefined
  memo: string
}): string | null {
  if (input.movementType === "inbound" && input.isFree == null) return "입고는 유상/무상을 고르세요."
  if (input.movementType === "adjust" && !input.memo.trim()) return "재고 조정은 사유(메모)를 입력하세요."
  return null
}

export const OUTBOUND_TYPE_OPTIONS: ReadonlyArray<{ value: HardwareOutboundType; label: string }> = (
  Object.keys(HARDWARE_OUTBOUND_TYPE_LABELS) as HardwareOutboundType[]
).map((value) => ({ value, label: HARDWARE_OUTBOUND_TYPE_LABELS[value] }))

/** 시트 드래프트(바구니 줄 포함) → 검증 입력. */
export function outboundV2InputFromDraft(
  draft: {
    movementType: HardwareMovementType
    productName: string
    quantity: number
    occurredAt: string
    fromLocation: string
    toLocation: string
    lotNo: string
    outboundType?: HardwareOutboundType
    customerId?: string
    expectedReturnAt?: string
  },
  lot: LotRequirement,
  customerMode?: CustomerInputMode
): OutboundV2Input {
  return {
    movementType: draft.movementType,
    productName: draft.productName,
    quantity: draft.quantity,
    occurredAt: draft.occurredAt,
    fromLocation: draft.fromLocation,
    toLocation: draft.toLocation,
    outboundType: draft.outboundType ?? null,
    customerId: draft.customerId ?? null,
    customerMode,
    expectedReturnAt: draft.expectedReturnAt ?? null,
    lotNo: draft.lotNo,
    lot,
  }
}
