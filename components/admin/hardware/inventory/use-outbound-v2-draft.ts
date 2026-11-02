"use client"

// 빠른 기록 시트의 출고 v2·입고·조정 추가 입력 상태 — 부모(HardwareInventoryClient)는 이 훅을 붙이기만 하고
// 규칙은 outbound-v2-model.ts 가 갖는다.

import { useCallback, useState } from "react"

import { isHardwareOutboundType } from "@/lib/hardware/inventory-process"

import { INITIAL_OUTBOUND_V2_STATE, type OutboundV2DraftState } from "./outbound-v2-model"
import type { HardwareMovement } from "./shared"

/** 기존 기록 → 수정 폼 상태. 칸이 비어 있는 옛 기록은 서버 추정 유형으로 미리 채운다. */
export function outboundV2StateFromMovement(movement: HardwareMovement): OutboundV2DraftState {
  const type = movement.outbound_type ?? movement.outbound_type_resolved ?? null
  return {
    outboundType: isHardwareOutboundType(type) ? type : "",
    customerId: movement.customer_id ?? null,
    // 고객 id 가 없는 옛 기록은 도착지 이름을 그대로 두고 직접 입력으로 연다(이름이 지워지지 않게).
    customerMode: movement.customer_id || !(movement.to_location ?? "").trim() ? "crm" : "free",
    expectedReturnAt: movement.expected_return_at?.slice(0, 10) ?? "",
    ownerUserId: movement.owner_user_id ?? null,
    isFree: movement.is_free ?? null,
    adjustDirection: movement.quantity < 0 ? "decrease" : "increase",
  }
}

export function useOutboundV2Draft() {
  const [state, setState] = useState<OutboundV2DraftState>(INITIAL_OUTBOUND_V2_STATE)

  const patch = useCallback((next: Partial<OutboundV2DraftState>) => {
    setState((current) => ({ ...current, ...next }))
  }, [])

  /** 새로 열 때 — 유형·고객·반납일은 건 단위라 지우고, 담당 지정은 연속 기록을 위해 남길 수 있다. */
  const reset = useCallback((options: { keepOwner?: boolean } = {}) => {
    setState((current) => ({ ...INITIAL_OUTBOUND_V2_STATE, ownerUserId: options.keepOwner ? current.ownerUserId : null }))
  }, [])

  /** 저장 뒤 연속 기록 — 고객·유형·담당·반납일은 남기고(같은 고객에 여러 품목을 잇달아 넣는 흐름) 입고 유무상만 다시 묻는다. */
  const resetAfterSave = useCallback(() => {
    setState((current) => ({ ...current, isFree: null }))
  }, [])

  const loadFromMovement = useCallback((movement: HardwareMovement) => {
    setState(outboundV2StateFromMovement(movement))
  }, [])

  return { state, patch, reset, resetAfterSave, loadFromMovement }
}

export type OutboundV2Draft = ReturnType<typeof useOutboundV2Draft>
