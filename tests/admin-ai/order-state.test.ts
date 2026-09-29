import { describe, expect, it } from "vitest"

import {
  canUndoOrder,
  isLiveOrder,
  isPendingOrder,
  ORDER_GRACE_MS,
  ORDER_TTL_MS,
  ORDER_UNDO_WINDOW_MS,
  remainingMs,
  transitionOrder,
} from "@/lib/admin-ai/order-state"
import type { OrderTicket } from "@/lib/admin-ai/types"

const T0 = 1_000_000

function ticket(over: Partial<OrderTicket> = {}): OrderTicket {
  return {
    id: "o1",
    type: "crm.lead.update",
    risk: "R2",
    icon: "lead",
    title: "리드 상태·담당 변경",
    target: { label: "새움에듀", meta: "리드 · 부산 해운대" },
    fields: [
      { key: "status", label: "상태", previous: "상담 중", value: "데모 완료", editable: true },
      { key: "locked", label: "고정", value: "바꿀 수 없는 값" },
    ],
    confirmLabel: "변경 확인",
    doneText: "변경했습니다",
    undo: "window",
    state: "draft",
    createdAt: T0,
    expiresAt: T0 + ORDER_TTL_MS,
    ...over,
  }
}

describe("transitionOrder — 확인", () => {
  it("R1·R2 는 확인하면 바로 완료되고 되돌리기 창이 열린다", () => {
    const done = transitionOrder(ticket(), { type: "confirm" }, T0 + 5_000)
    expect(done.state).toBe("done")
    expect(done.executedAt).toBe(T0 + 5_000)
    expect(done.undoUntil).toBe(T0 + 5_000 + ORDER_UNDO_WINDOW_MS)
  })

  it("R3 는 확인해도 바로 나가지 않는다 — 30초 유예", () => {
    const grace = transitionOrder(ticket({ risk: "R3", undo: "none" }), { type: "confirm" }, T0)
    expect(grace.state).toBe("grace")
    expect(grace.graceUntil).toBe(T0 + ORDER_GRACE_MS)
    expect(grace.executedAt).toBeUndefined()
  })

  it("되돌릴 수 없는 오더는 완료 뒤 되돌리기 창이 없다", () => {
    const done = transitionOrder(ticket({ undo: "none", sensitive: true }), { type: "confirm" }, T0)
    expect(done.state).toBe("done")
    expect(done.undoUntil).toBeUndefined()
    expect(canUndoOrder(done, T0 + 1)).toBe(false)
  })

  // 오래된 카드의 버튼이 화면에 남아 있어도 바뀐 데이터 위에 실행되면 안 된다.
  it("만료 시각이 지난 카드는 확인을 눌러도 실행되지 않는다", () => {
    const late = transitionOrder(ticket(), { type: "confirm" }, T0 + ORDER_TTL_MS)
    expect(late.state).toBe("expired")
    expect(late.executedAt).toBeUndefined()
  })

  it("확인 대기가 아닌 카드는 확인을 무시한다", () => {
    for (const state of ["done", "cancelled", "expired", "undone", "failed", "grace"] as const) {
      const order = ticket({ state })
      expect(transitionOrder(order, { type: "confirm" }, T0), state).toBe(order)
    }
  })
})

describe("transitionOrder — 시간 흐름", () => {
  it("확인하지 않으면 15분 뒤 만료된다", () => {
    const order = ticket()
    expect(transitionOrder(order, { type: "tick" }, T0 + ORDER_TTL_MS - 1)).toBe(order)
    expect(transitionOrder(order, { type: "tick" }, T0 + ORDER_TTL_MS).state).toBe("expired")
  })

  it("유예가 끝나면 발송된다", () => {
    const grace = transitionOrder(ticket({ risk: "R3", undo: "none" }), { type: "confirm" }, T0)
    expect(transitionOrder(grace, { type: "tick" }, T0 + ORDER_GRACE_MS - 1)).toBe(grace)
    const sent = transitionOrder(grace, { type: "tick" }, T0 + ORDER_GRACE_MS)
    expect(sent.state).toBe("sent")
    expect(sent.executedAt).toBe(T0 + ORDER_GRACE_MS)
  })

  it("유예 중에는 취소할 수 있고, 취소하면 발송되지 않는다", () => {
    const grace = transitionOrder(ticket({ risk: "R3", undo: "none" }), { type: "confirm" }, T0)
    const aborted = transitionOrder(grace, { type: "abort" }, T0 + 10_000)
    expect(aborted.state).toBe("aborted")
    expect(transitionOrder(aborted, { type: "tick" }, T0 + ORDER_GRACE_MS * 2)).toBe(aborted)
  })

  it("남은 시간은 상태에 맞는 시계를 돌려준다", () => {
    expect(remainingMs(ticket(), T0 + 60_000)).toBe(ORDER_TTL_MS - 60_000)
    const done = transitionOrder(ticket(), { type: "confirm" }, T0)
    expect(remainingMs(done, T0 + 1_000)).toBe(ORDER_UNDO_WINDOW_MS - 1_000)
    expect(remainingMs(ticket({ state: "cancelled" }), T0)).toBeNull()
  })
})

describe("transitionOrder — 수정", () => {
  it("수정 중에는 만료 시계가 멈췄다가 저장하면 이어서 흐른다", () => {
    const editing = transitionOrder(ticket(), { type: "edit" }, T0 + 60_000)
    expect(editing.state).toBe("editing")
    expect(editing.pausedRemainingMs).toBe(ORDER_TTL_MS - 60_000)
    // 수정에 20분이 걸려도 만료되지 않는다.
    expect(transitionOrder(editing, { type: "tick" }, T0 + 21 * 60_000)).toBe(editing)

    const saved = transitionOrder(
      editing,
      { type: "save-edit", values: { status: "계약 협의" } },
      T0 + 21 * 60_000
    )
    expect(saved.state).toBe("draft")
    expect(saved.expiresAt).toBe(T0 + 21 * 60_000 + ORDER_TTL_MS - 60_000)
  })

  it("고친 값에만 '수정됨' 을 붙인다", () => {
    const editing = transitionOrder(ticket(), { type: "edit" }, T0)
    const same = transitionOrder(editing, { type: "save-edit", values: { status: "데모 완료" } }, T0)
    expect(same.fields[0].edited).toBeUndefined()

    const changed = transitionOrder(editing, { type: "save-edit", values: { status: " 보류 " } }, T0)
    expect(changed.fields[0]).toMatchObject({ value: "보류", edited: true, previous: "상담 중" })
  })

  it("고칠 수 없는 값은 입력이 들어와도 바뀌지 않는다", () => {
    const editing = transitionOrder(ticket(), { type: "edit" }, T0)
    const saved = transitionOrder(
      editing,
      { type: "save-edit", values: { locked: "바꿔치기", status: "" } },
      T0
    )
    expect(saved.fields[1].value).toBe("바꿀 수 없는 값")
    // 빈 값으로는 덮어쓰지 않는다.
    expect(saved.fields[0].value).toBe("데모 완료")
  })

  it("대상은 수정으로 바뀌지 않는다", () => {
    const editing = transitionOrder(ticket(), { type: "edit" }, T0)
    const saved = transitionOrder(
      editing,
      { type: "save-edit", values: { target: "다른 고객", status: "보류" } },
      T0
    )
    expect(saved.target).toEqual({ label: "새움에듀", meta: "리드 · 부산 해운대" })
  })

  it("수정 취소는 값을 그대로 둔다", () => {
    const editing = transitionOrder(ticket(), { type: "edit" }, T0)
    const reverted = transitionOrder(editing, { type: "revert-edit" }, T0 + 1_000)
    expect(reverted.state).toBe("draft")
    expect(reverted.fields).toEqual(ticket().fields)
  })

  it("발송 문구를 고치면 수정됨이 남는다", () => {
    const order = ticket({ risk: "R3", undo: "none", fields: [], message: { text: "원래 문구" } })
    const editing = transitionOrder(order, { type: "edit" }, T0)
    const saved = transitionOrder(
      editing,
      { type: "save-edit", values: {}, message: "고친 문구" },
      T0
    )
    expect(saved.message).toEqual({ text: "고친 문구", edited: true })
  })

  it("고칠 값이 없는 오더는 수정 모드로 들어가지 않는다", () => {
    const order = ticket({ fields: [{ key: "a", label: "적용", value: "일괄 할인" }] })
    expect(transitionOrder(order, { type: "edit" }, T0)).toBe(order)
  })
})

describe("transitionOrder — 되돌리기와 다시 작성", () => {
  it("10분 안에는 되돌릴 수 있고 지나면 못 한다", () => {
    const done = transitionOrder(ticket(), { type: "confirm" }, T0)
    expect(transitionOrder(done, { type: "undo" }, T0 + ORDER_UNDO_WINDOW_MS - 1).state).toBe(
      "undone"
    )
    expect(transitionOrder(done, { type: "undo" }, T0 + ORDER_UNDO_WINDOW_MS)).toBe(done)
  })

  it("새 버전을 만드는 오더는 시간이 지나도 이전 버전으로 돌아갈 수 있다", () => {
    const done = transitionOrder(ticket({ undo: "previous-version" }), { type: "confirm" }, T0)
    expect(canUndoOrder(done, T0 + 24 * 60 * 60_000)).toBe(true)
  })

  it("닫힌 카드는 다시 작성하면 새 만료 시각으로 확인 대기가 된다", () => {
    for (const state of ["cancelled", "undone", "expired", "aborted", "failed"] as const) {
      const again = transitionOrder(
        ticket({ state, failure: { reason: "사유" } }),
        { type: "redraft" },
        T0 + 99_000
      )
      expect(again.state, state).toBe("draft")
      expect(again.expiresAt, state).toBe(T0 + 99_000 + ORDER_TTL_MS)
      expect(again.failure, state).toBeUndefined()
    }
  })

  it("완료된 오더는 다시 작성으로 되살리지 않는다", () => {
    const done = transitionOrder(ticket(), { type: "confirm" }, T0)
    expect(transitionOrder(done, { type: "redraft" }, T0 + 1)).toBe(done)
  })
})

describe("오더 분류", () => {
  it("확인 대기 숫자는 draft 와 editing 만 센다", () => {
    expect(isPendingOrder(ticket())).toBe(true)
    expect(isPendingOrder(ticket({ state: "editing" }))).toBe(true)
    expect(isPendingOrder(ticket({ state: "grace" }))).toBe(false)
    expect(isPendingOrder(ticket({ state: "done" }))).toBe(false)
  })

  it("시계가 흐르는 오더만 매초 다시 그린다", () => {
    expect(isLiveOrder(ticket(), T0)).toBe(true)
    const done = transitionOrder(ticket(), { type: "confirm" }, T0)
    expect(isLiveOrder(done, T0 + 1)).toBe(true)
    expect(isLiveOrder(done, T0 + ORDER_UNDO_WINDOW_MS)).toBe(false)
    expect(isLiveOrder(ticket({ state: "editing" }), T0)).toBe(false)
    expect(isLiveOrder(ticket({ state: "expired" }), T0)).toBe(false)
  })
})
