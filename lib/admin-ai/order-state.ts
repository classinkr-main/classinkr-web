// 오더 카드 상태 전이 — 순수 함수. 시간은 전부 인자로 받는다(테스트·재현 가능).
// 기획 §5(수명주기)·§11.9(카드 사양).
//
// 화면이 버튼을 그렸다고 해서 전이가 허용되는 것은 아니다. 허용되지 않는 전이는
// 같은 객체를 그대로 돌려준다 — 오래된 카드의 버튼이 눌려도 아무 일도 일어나지 않는다.
import type { OrderState, OrderTicket } from "./types"

/** 확인하지 않은 오더는 15분 뒤 만료된다. */
export const ORDER_TTL_MS = 15 * 60 * 1000
/** R1·R2 는 실행 뒤 10분 동안 되돌릴 수 있다. */
export const ORDER_UNDO_WINDOW_MS = 10 * 60 * 1000
/** R3(발송)는 확인 뒤 30초 동안 취소할 수 있다. */
export const ORDER_GRACE_MS = 30 * 1000

export type OrderAction =
  | { type: "confirm" }
  | { type: "cancel" }
  | { type: "edit" }
  | { type: "save-edit"; values: Record<string, string>; message?: string }
  | { type: "revert-edit" }
  | { type: "abort" }
  | { type: "undo" }
  | { type: "redraft" }
  | { type: "tick" }

const CLOSED_STATES: ReadonlySet<OrderState> = new Set([
  "cancelled",
  "undone",
  "expired",
  "aborted",
])

/** 취소·되돌림·만료·발송 취소 — 강조를 빼고 그리는 상태. */
export function isClosedOrderState(state: OrderState): boolean {
  return CLOSED_STATES.has(state)
}

/** 사람의 확인을 기다리는 중인지(위젯 버튼의 숫자). 수정 중도 아직 확인 전이다. */
export function isPendingOrder(order: OrderTicket): boolean {
  return order.state === "draft" || order.state === "editing"
}

/** 남은 시간이 흐르고 있어 매초 다시 그려야 하는지. */
export function isLiveOrder(order: OrderTicket, now: number): boolean {
  if (order.state === "draft" || order.state === "grace") return true
  return order.state === "done" && order.undo === "window" && (order.undoUntil ?? 0) > now
}

export function canEditOrder(order: OrderTicket): boolean {
  return order.message !== undefined || order.fields.some((field) => field.editable)
}

export function canUndoOrder(order: OrderTicket, now: number): boolean {
  if (order.state !== "done") return false
  if (order.undo === "previous-version") return true
  return order.undo === "window" && (order.undoUntil ?? 0) > now
}

/** 상태에 맞는 남은 시간(ms). 흐르는 시계가 없는 상태면 null. */
export function remainingMs(order: OrderTicket, now: number): number | null {
  if (order.state === "draft") return Math.max(0, order.expiresAt - now)
  if (order.state === "editing") return order.pausedRemainingMs ?? null
  if (order.state === "grace") return Math.max(0, (order.graceUntil ?? now) - now)
  if (order.state === "done" && order.undo === "window") {
    return Math.max(0, (order.undoUntil ?? now) - now)
  }
  return null
}

function applyEdits(
  order: OrderTicket,
  values: Record<string, string>,
  message: string | undefined
): Pick<OrderTicket, "fields" | "message"> {
  const fields = order.fields.map((field) => {
    // 고칠 수 없는 값은 입력이 들어와도 무시한다 — 대상·이전 값·서버 확인 값 보호.
    if (!field.editable) return field
    const next = values[field.key]?.trim()
    if (!next || next === field.value) return field
    return { ...field, value: next, edited: true }
  })

  const nextMessage = message?.trim()
  const messageChanged =
    order.message !== undefined && !!nextMessage && nextMessage !== order.message.text

  return {
    fields,
    message: messageChanged ? { text: nextMessage, edited: true } : order.message,
  }
}

export function transitionOrder(order: OrderTicket, action: OrderAction, now: number): OrderTicket {
  switch (action.type) {
    case "tick": {
      if (order.state === "draft" && now >= order.expiresAt) {
        return { ...order, state: "expired" }
      }
      if (order.state === "grace" && now >= (order.graceUntil ?? 0)) {
        return { ...order, state: "sent", executedAt: now }
      }
      return order
    }

    case "confirm": {
      if (order.state !== "draft") return order
      // 버튼이 남아 있어도 만료 시각이 지났으면 실행하지 않는다.
      if (now >= order.expiresAt) return { ...order, state: "expired" }
      if (order.risk === "R3") {
        return { ...order, state: "grace", graceUntil: now + ORDER_GRACE_MS }
      }
      return {
        ...order,
        state: "done",
        executedAt: now,
        undoUntil: order.undo === "window" ? now + ORDER_UNDO_WINDOW_MS : undefined,
      }
    }

    case "cancel": {
      if (order.state !== "draft" && order.state !== "editing") return order
      return { ...order, state: "cancelled", pausedRemainingMs: undefined }
    }

    case "edit": {
      if (order.state !== "draft" || !canEditOrder(order)) return order
      if (now >= order.expiresAt) return { ...order, state: "expired" }
      return { ...order, state: "editing", pausedRemainingMs: order.expiresAt - now }
    }

    case "save-edit":
    case "revert-edit": {
      if (order.state !== "editing") return order
      const resumed = {
        ...order,
        state: "draft" as const,
        expiresAt: now + (order.pausedRemainingMs ?? ORDER_TTL_MS),
        pausedRemainingMs: undefined,
      }
      if (action.type === "revert-edit") return resumed
      return { ...resumed, ...applyEdits(order, action.values, action.message) }
    }

    case "abort": {
      if (order.state !== "grace") return order
      return { ...order, state: "aborted", graceUntil: undefined }
    }

    case "undo": {
      if (!canUndoOrder(order, now)) return order
      return { ...order, state: "undone", undoUntil: undefined }
    }

    case "redraft": {
      if (!isClosedOrderState(order.state) && order.state !== "failed") return order
      return {
        ...order,
        state: "draft",
        createdAt: now,
        expiresAt: now + ORDER_TTL_MS,
        failure: undefined,
        graceUntil: undefined,
        undoUntil: undefined,
        executedAt: undefined,
        pausedRemainingMs: undefined,
      }
    }
  }
}
