"use client"

// 빠른 기록 시트 ↔ 재고관리 프로세스 규칙 연결 — 부모(HardwareInventoryClient)가 이 함수들을 부르기만 하도록
// 로트 조회 키·검증 묶음·바구니 줄 검사를 한곳에 둔다. 규칙 자체는 outbound-v2-model.ts.

import { useEffect } from "react"

import {
  isCustomerOutbound,
  isWarehouseSource,
  outboundV2InputFromDraft,
  outboundV2Issues,
  validateInboundAdjustExtras,
  type CustomerInputMode,
  type OutboundV2Field,
} from "./outbound-v2-model"
import { quickCartLineKey, type HardwareItem, type HardwareMovementDraft } from "./shared"
import { lotRequirementFromEntry, type HardwareLotsCache, type LotLookupEntry } from "./use-hardware-lots"

function itemFor(items: readonly HardwareItem[] | undefined, draft: Pick<HardwareMovementDraft, "itemId" | "productName">) {
  return items?.find((item) => (draft.itemId ? item.id === draft.itemId : item.name === draft.productName.trim())) ?? null
}

/** 이 드래프트가 창고 로트에서 빠지는 출고인가 — 물류번호 조회·고르기 대상. */
export function draftNeedsLotLookup(draft: Pick<HardwareMovementDraft, "movementType" | "fromLocation" | "productName">): boolean {
  return draft.movementType === "outbound" && isWarehouseSource(draft.fromLocation) && draft.productName.trim() !== ""
}

export function lotEntryForDraft(
  lots: HardwareLotsCache,
  draft: Pick<HardwareMovementDraft, "itemId" | "productName" | "movementType" | "fromLocation">,
  excludeMovementId?: string | null
): LotLookupEntry | undefined {
  if (!draftNeedsLotLookup(draft)) return undefined
  return lots.get(draft.itemId ?? null, draft.productName, excludeMovementId)
}

export interface ProcessValidationContext {
  lots: HardwareLotsCache
  items: readonly HardwareItem[] | undefined
  /** 단건 폼의 고객 입력 방식. 바구니 줄은 생략(고객 id 유무로 판정). */
  customerMode?: CustomerInputMode
  /** 수정 중인 기록 — 잔여 계산에서 자기 자신을 뺀다. */
  excludeMovementId?: string | null
  /** 바구니에 담을 때는 물류번호를 줄에서 나중에 고르므로 건너뛴다. 저장 직전에 다시 본다. */
  skipLot?: boolean
}

/** 드래프트 하나의 프로세스 규칙 위반(칸별). */
export function processIssues(draft: HardwareMovementDraft, context: ProcessValidationContext): Array<{ field: OutboundV2Field | "extra"; message: string }> {
  const lot = context.skipLot
    ? { lotTracked: false, lots: null }
    : lotRequirementFromEntry(lotEntryForDraft(context.lots, draft, context.excludeMovementId), itemFor(context.items, draft))
  const issues: Array<{ field: OutboundV2Field | "extra"; message: string }> = outboundV2Issues(
    outboundV2InputFromDraft(draft, lot, context.customerMode)
  )
  const extra = validateInboundAdjustExtras({ movementType: draft.movementType, isFree: draft.isFree, memo: draft.memo })
  if (extra) issues.push({ field: "extra", message: extra })
  return issues
}

export function validateProcessDraft(draft: HardwareMovementDraft, context: ProcessValidationContext): string | null {
  return processIssues(draft, context)[0]?.message ?? null
}

/** 칸별 문구(첫 위반만) — 시트가 칸 아래에 보인다. */
export function processFieldErrors(draft: HardwareMovementDraft, context: ProcessValidationContext): Partial<Record<OutboundV2Field, string>> {
  const errors: Partial<Record<OutboundV2Field, string>> = {}
  for (const issue of processIssues(draft, context)) {
    if (issue.field !== "extra" && !errors[issue.field]) errors[issue.field] = issue.message
  }
  return errors
}

/** 바구니 저장 직전 검사 — 줄 키 → 문구. 비어 있으면 보낸다. */
export function validateQuickCartProcess(
  drafts: readonly HardwareMovementDraft[],
  context: Omit<ProcessValidationContext, "customerMode" | "skipLot" | "excludeMovementId">
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const draft of drafts) {
    const message = validateProcessDraft(draft, context)
    if (message) errors[quickCartLineKey(draft)] = message
  }
  return errors
}

/** 폼과 바구니 줄의 로트 잔여를 미리 불러온다(창고발 출고만). */
export function useEnsureProcessLots(input: {
  lots: HardwareLotsCache
  enabled: boolean
  form: Pick<HardwareMovementDraft, "itemId" | "productName" | "movementType" | "fromLocation">
  excludeMovementId: string | null
  quickCart: readonly HardwareMovementDraft[]
}) {
  const { lots, enabled, form, excludeMovementId, quickCart } = input
  const { ensure } = lots
  const formKey = draftNeedsLotLookup(form) ? `${form.itemId ?? ""}|${form.productName}|${excludeMovementId ?? ""}` : ""
  useEffect(() => {
    if (!enabled || !formKey) return
    ensure({ itemId: form.itemId ?? null, productName: form.productName, excludeMovementId })
    // formKey 가 itemId·productName·excludeMovementId 를 담는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, formKey, ensure])

  const cartKey = quickCart
    .filter(draftNeedsLotLookup)
    .map((draft) => `${draft.itemId ?? ""}|${draft.productName}`)
    .join("\u0000")
  useEffect(() => {
    if (!enabled || !cartKey) return
    for (const draft of quickCart) {
      if (draftNeedsLotLookup(draft)) ensure({ itemId: draft.itemId ?? null, productName: draft.productName })
    }
    // cartKey 가 로트 조회에 쓰는 줄 값만 담는다(수량·메모 변경으로 다시 돌지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, cartKey, ensure])
}

/** 고객 출고 판정 — 시트 칸 표시용(샘플 풀 프리셋은 내부 이동). */
export function formIsCustomerOutbound(input: { movementType: HardwareMovementDraft["movementType"]; toLocation: string; activePresetKey: string }): boolean {
  return input.activePresetKey !== "sample" && isCustomerOutbound(input)
}
