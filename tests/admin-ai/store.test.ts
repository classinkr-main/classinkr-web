import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminAiClient } from "@/lib/admin-ai/client"
import { buildDemoTurn } from "@/lib/admin-ai/demo-scenarios"
import { ORDER_TTL_MS } from "@/lib/admin-ai/order-state"
import {
  createAdminAiStore,
  INITIAL_ADMIN_AI_STATE,
  reduceAdminAi,
  selectPendingOrders,
} from "@/lib/admin-ai/store"

const CONTEXT = { path: "/admin/crm", label: "CRM › 현황" }

/** 단계 없이 바로 답하는 가짜 클라이언트 — 스토어의 배선만 본다. */
function instantClient(onAsk?: (input: Parameters<AdminAiClient["ask"]>[0]) => void): AdminAiClient {
  let sequence = 0
  return {
    mode: "demo",
    ask(input, handlers) {
      onAsk?.(input)
      const timer = setTimeout(() => {
        sequence += 1
        handlers.onStep("확인")
        handlers.onDone(
          buildDemoTurn(input.scenario ?? "task", { now: Date.now(), orderId: `t-${sequence}` })
        )
      }, 100)
      return () => clearTimeout(timer)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-29T10:00:00+09:00"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("admin ai store — 대화", () => {
  it("질문하면 사용자 말풍선과 대기 중인 답변이 붙고, 답이 오면 오더가 확인 대기로 들어간다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일 잡아 줘", scenario: "task", context: CONTEXT })

    expect(store.getState().busy).toBe(true)
    expect(store.getState().messages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(store.getState().messages[1].pending).toBe(true)

    vi.advanceTimersByTime(100)

    const state = store.getState()
    expect(state.busy).toBe(false)
    expect(state.messages[1].pending).toBe(false)
    expect(state.messages[1].blocks.map((block) => block.kind)).toEqual(["steps", "text", "order"])
    expect(selectPendingOrders(state).map((order) => order.id)).toEqual(["t-1"])
  })

  it("답을 기다리는 동안에는 새 질문을 받지 않는다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "첫 질문", scenario: "task", context: CONTEXT })
    store.ask({ text: "연타", scenario: "task", context: CONTEXT })
    expect(store.getState().messages).toHaveLength(2)
  })

  it("중지하면 답변이 멈추고 오더가 만들어지지 않는다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일 잡아 줘", scenario: "task", context: CONTEXT })
    store.stop()
    vi.advanceTimersByTime(1_000)

    const state = store.getState()
    expect(state.busy).toBe(false)
    expect(state.orderIds).toEqual([])
    expect(state.messages[1].blocks).toEqual([{ kind: "text", text: "답변을 멈췄습니다." }])
  })

  it("맥락을 끄면 화면 맥락을 넘기지 않는다", () => {
    const asked: Array<unknown> = []
    const store = createAdminAiStore(instantClient((input) => asked.push(input.context)))
    store.ask({ text: "첫 질문", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.setContextEnabled(false)
    store.ask({ text: "둘째 질문", context: CONTEXT })
    expect(asked).toEqual([CONTEXT, null])
  })

  // 대화를 지웠다고 확인을 기다리던 오더가 사라지면 안 된다.
  it("새 대화는 말풍선만 비우고 확인 대기 오더는 남긴다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일 잡아 줘", scenario: "task", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.newConversation()

    expect(store.getState().messages).toEqual([])
    expect(selectPendingOrders(store.getState())).toHaveLength(1)
  })

  it("새 대화 뒤에 늦게 도착한 답변은 버린다", () => {
    const state = reduceAdminAi(
      { ...INITIAL_ADMIN_AI_STATE, busy: true },
      {
        type: "turn-done",
        assistantId: "사라진-답변",
        now: 1,
        result: buildDemoTurn("task", { now: 1, orderId: "late" }),
      }
    )
    expect(state.orderIds).toEqual([])
    expect(state.busy).toBe(false)
  })
})

describe("admin ai store — 오더와 시계", () => {
  it("확인하면 확인 대기에서 빠지고, 흐르는 오더가 없어지면 시계가 멈춘다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "결제 확정", scenario: "pay", context: CONTEXT })
    vi.advanceTimersByTime(100)
    expect(vi.getTimerCount()).toBe(1)

    store.actOnOrder("t-1", { type: "confirm" })
    expect(selectPendingOrders(store.getState())).toHaveLength(0)
    expect(store.getState().orders["t-1"].state).toBe("done")
    // 결제 확정은 되돌리기 창이 없어 더 흐를 시계가 없다.
    expect(vi.getTimerCount()).toBe(0)
  })

  it("확인하지 않은 오더는 15분 뒤 스스로 만료된다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일 잡아 줘", scenario: "task", context: CONTEXT })
    vi.advanceTimersByTime(100)

    vi.advanceTimersByTime(ORDER_TTL_MS)
    expect(store.getState().orders["t-1"].state).toBe("expired")
    expect(selectPendingOrders(store.getState())).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("발송 오더는 유예 30초 뒤에 나가고, 그 전에 취소하면 나가지 않는다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "문자 보내 줘", scenario: "sms", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.actOnOrder("t-1", { type: "confirm" })
    expect(store.getState().orders["t-1"].state).toBe("grace")

    vi.advanceTimersByTime(29_000)
    expect(store.getState().orders["t-1"].state).toBe("grace")
    store.actOnOrder("t-1", { type: "abort" })
    vi.advanceTimersByTime(60_000)
    expect(store.getState().orders["t-1"].state).toBe("aborted")
  })

  it("허용되지 않은 전이는 구독자를 깨우지 않는다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일 잡아 줘", scenario: "task", context: CONTEXT })
    vi.advanceTimersByTime(100)

    const listener = vi.fn()
    store.subscribe(listener)
    store.actOnOrder("t-1", { type: "undo" })
    store.actOnOrder("없는-오더", { type: "confirm" })
    expect(listener).not.toHaveBeenCalled()
  })
})
