// 버튼 권한 — 정의서 §권한 + 결정 D2 를 화면 viewer 로 옮긴다. 판정 자체는 공용 규칙
// (lib/hardware/inventory-process.ts canActOnMovement)이 정본이고, 여기서는 viewer → actor 변환과
// 버튼 문구만 맡는다. 버튼은 표시만 막는다 — 강제는 서버가 한다.

import { canActOnMovement, type HardwareActor, type MovementAction } from "@/lib/hardware/inventory-process"

import type { HardwareDashboard, HardwareMovement } from "./shared"
import { isPlannedMovement } from "./shared"

export type HardwareViewer = NonNullable<HardwareDashboard["viewer"]>

export const OWN_OR_MANAGER_TITLE = "본인 건 또는 입고관리 권한자만 할 수 있습니다"
export const MANAGER_ONLY_TITLE = "실현 기록(설치 완료·회수·입고·조정) 수정·취소는 입고관리 권한자만 할 수 있습니다"

/**
 * viewer → 공용 규칙의 actor. canManageInventory 가 없는 구응답(또는 viewer 자체가 없음)은 null —
 * 그때는 버튼을 열어 두고 서버 게이트만 믿는다.
 */
export function viewerActor(viewer: HardwareViewer | null | undefined): HardwareActor | null {
  if (!viewer || typeof viewer.canManageInventory !== "boolean") return null
  return {
    userId: viewer.userId ?? null,
    name: viewer.name ?? null,
    isInventoryManager: viewer.canManageInventory,
  }
}

export type MovementButton = "edit" | "confirm" | "void"

export interface MovementButtonState {
  allowed: boolean
  /** 막혔을 때 버튼 title. */
  title?: string
}

function actionFor(button: MovementButton, planned: boolean): MovementAction | null {
  if (button === "confirm") return planned ? "confirm" : null
  if (button === "edit") return planned ? "edit_planned" : "edit_actual"
  return planned ? "void_planned" : "void_actual"
}

/**
 * 한 기록의 버튼 상태. 배송 예정 수정·확정·취소 = 본인 건 또는 입고관리 권한자, 실현 기록 수정·취소 =
 * 입고관리 권한자. 구응답은 예전 기준(실현 기록은 canFinalize)으로 둔다.
 */
export function movementButtonState(
  button: MovementButton,
  movement: Pick<HardwareMovement, "movement_type" | "status" | "planned" | "source" | "owner" | "owner_user_id" | "created_by_user_id"> & {
    created_by?: string | null
  },
  viewer: HardwareViewer | null | undefined
): MovementButtonState {
  const planned = isPlannedMovement(movement as HardwareMovement)
  const action = actionFor(button, planned)
  if (!action) return { allowed: false, title: "배송 예정만 확정할 수 있습니다" }
  const actor = viewerActor(viewer)
  if (!actor) {
    if (planned) return { allowed: true }
    const canFinalize = viewer?.canFinalize ?? true
    return canFinalize ? { allowed: true } : { allowed: false, title: MANAGER_ONLY_TITLE }
  }
  const allowed = canActOnMovement(action, movement, actor)
  if (allowed) return { allowed: true }
  return { allowed: false, title: planned ? OWN_OR_MANAGER_TITLE : MANAGER_ONLY_TITLE }
}

/** 여러 건을 한 번에 확정할 수 있는가 — 하나라도 막히면 막는다(일괄·그룹 확정 버튼). */
export function canConfirmAll(movements: readonly HardwareMovement[], viewer: HardwareViewer | null | undefined): MovementButtonState {
  for (const movement of movements) {
    const state = movementButtonState("confirm", movement, viewer)
    if (!state.allowed) return { allowed: false, title: `${movement.product_name}: ${state.title ?? OWN_OR_MANAGER_TITLE}` }
  }
  return { allowed: true }
}

/** 다른 담당자를 지정할 수 있는가(입고관리 권한자만). 구응답은 지정 UI 를 숨긴다. */
export function canAssignOtherOwner(viewer: HardwareViewer | null | undefined): boolean {
  return viewer?.canManageInventory === true
}

/** 빠른 기록 시트에서 입고·조정을 보여 줄지 — 명시적으로 false 일 때만 숨긴다(구응답은 연다). */
export function canRecordInboundOrAdjust(viewer: HardwareViewer | null | undefined): boolean {
  return viewer?.canManageInventory !== false
}
