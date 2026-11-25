import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AdminAiClient } from "@/lib/admin-ai/client"
import { buildDemoTurn } from "@/lib/admin-ai/demo-scenarios"
import { ORDER_TTL_MS } from "@/lib/admin-ai/order-state"
import {
  createAdminAiStore,
  INITIAL_ADMIN_AI_STATE,
  NEW_CONVERSATION_UNDO_MS,
  reduceAdminAi,
  selectGraceOrders,
  selectLiveOrders,
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

// ── 새 대화 설계 N1~N7 (점검 R6) ─────────────────────────────────────────────────

function ready(scenario: "task" | "sms" | "pay" = "task") {
  const store = createAdminAiStore(instantClient())
  store.ask({ text: "질문", scenario, context: CONTEXT })
  vi.advanceTimersByTime(100)
  return store
}

describe("admin ai store — 새 대화 N1~N4·N7", () => {
  it("메시지가 없으면 아무 일도 없다(버튼이 꺼진 상태와 같다)", () => {
    const store = createAdminAiStore(instantClient())
    const before = store.getState()
    store.newConversation()
    expect(store.getState()).toBe(before)
    expect(store.getState().undoSnapshot).toBeNull()
  })

  it("새 대화 뒤에도 발송 유예 중인 오더가 오더 목록 맨 위에 남고 발송 취소가 가능하다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일", scenario: "task", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.ask({ text: "문자", scenario: "sms", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.actOnOrder("t-2", { type: "confirm" })
    expect(store.getState().orders["t-2"].state).toBe("grace")

    store.newConversation()
    const state = store.getState()
    expect(state.messages).toEqual([])
    expect(selectGraceOrders(state).map((order) => order.id)).toEqual(["t-2"])
    // 유예 중이 확인 대기보다 위다.
    expect(selectLiveOrders(state).map((order) => order.id)).toEqual(["t-2", "t-1"])

    store.abortGraceOrders()
    vi.advanceTimersByTime(60_000)
    expect(store.getState().orders["t-2"].state).toBe("aborted")
  })

  it("되돌릴 수 있는 완료 오더도 새 대화 뒤 오더 목록에 남는다", () => {
    const store = ready("task")
    store.actOnOrder("t-1", { type: "confirm" })
    store.newConversation()
    expect(selectLiveOrders(store.getState()).map((order) => order.id)).toEqual(["t-1"])
    // 되돌릴 수 없는 결제 확정은 남지 않는다.
    const pay = ready("pay")
    pay.actOnOrder("t-1", { type: "confirm" })
    pay.newConversation()
    expect(selectLiveOrders(pay.getState())).toEqual([])
  })

  it("새 대화는 직전 대화 1칸을 두고, 되돌리면 말풍선·맥락 설정이 돌아온다", () => {
    const store = ready("task")
    store.setContextEnabled(false)
    const before = store.getState().messages
    store.newConversation()
    expect(store.getState().undoSnapshot?.messages).toHaveLength(before.length)
    expect(store.getState().contextEnabled).toBe(true)

    store.restoreConversation()
    const state = store.getState()
    expect(state.messages.map((message) => message.id)).toEqual(before.map((message) => message.id))
    expect(state.contextEnabled).toBe(false)
    expect(state.undoSnapshot).toBeNull()
    // 오더는 한 번도 사라지지 않았다.
    expect(selectPendingOrders(state)).toHaveLength(1)
  })

  it("진행 중이던 답은 멈춘 채 복구되고, 늦게 오는 응답은 버려진다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "할 일", scenario: "task", context: CONTEXT })
    expect(store.getState().busy).toBe(true)
    store.newConversation()
    expect(store.getState().busy).toBe(false)
    store.restoreConversation()

    const restored = store.getState()
    expect(restored.busy).toBe(false)
    expect(restored.messages[1].pending).toBe(false)
    expect(restored.messages[1].blocks).toEqual([{ kind: "text", text: "답변을 멈췄습니다." }])
    // 멈춘 턴의 응답이 시간이 지나 도착해도 오더가 생기지 않는다.
    vi.advanceTimersByTime(1_000)
    expect(store.getState().orderIds).toEqual([])
  })

  it("수정 중인 오더는 새 대화에서 수정 취소로 되돌아가고 만료 시계가 다시 돈다", () => {
    const store = ready("task")
    store.actOnOrder("t-1", { type: "edit" })
    expect(store.getState().orders["t-1"].state).toBe("editing")
    const paused = store.getState().orders["t-1"].pausedRemainingMs ?? 0
    expect(paused).toBeGreaterThan(0)

    vi.advanceTimersByTime(2_000)
    store.newConversation()
    const order = store.getState().orders["t-1"]
    expect(order.state).toBe("draft")
    expect(order.pausedRemainingMs).toBeUndefined()
    expect(order.expiresAt).toBe(Date.now() + paused)
    // 시계가 다시 돌아 만료도 된다.
    vi.advanceTimersByTime(paused)
    expect(store.getState().orders["t-1"].state).toBe("expired")
  })

  it("패널을 닫으면 수정 중이던 카드도 같은 방식으로 되돌아간다", () => {
    const store = ready("task")
    store.setOpen(true)
    store.actOnOrder("t-1", { type: "edit" })
    store.setOpen(false)
    expect(store.getState().orders["t-1"].state).toBe("draft")
  })

  it("revertEditingOrders 는 되돌릴 카드가 있었는지 알려 준다", () => {
    const store = ready("task")
    expect(store.revertEditingOrders()).toBe(false)
    store.actOnOrder("t-1", { type: "edit" })
    expect(store.revertEditingOrders()).toBe(true)
    expect(store.getState().orders["t-1"].state).toBe("draft")
  })

  it("되돌리기 칸은 6초 뒤 닫히고, 새 질문을 하면 바로 닫힌다", () => {
    const store = ready("task")
    store.newConversation()
    vi.advanceTimersByTime(NEW_CONVERSATION_UNDO_MS - 1)
    expect(store.getState().undoSnapshot).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(store.getState().undoSnapshot).toBeNull()
    store.restoreConversation()
    expect(store.getState().messages).toEqual([])

    const second = ready("task")
    second.newConversation()
    second.ask({ text: "새 질문", scenario: "task", context: CONTEXT })
    expect(second.getState().undoSnapshot).toBeNull()
    // 닫힌 뒤에는 되돌려도 새 대화를 덮어쓰지 않는다.
    second.restoreConversation()
    expect(second.getState().messages[0].text).toBe("새 질문")
  })

  it("새 대화마다 입력창을 새로 시작하도록 epoch 가 오른다", () => {
    const store = ready("task")
    const before = store.getState().epoch
    store.newConversation()
    expect(store.getState().epoch).toBe(before + 1)
    store.restoreConversation()
    expect(store.getState().epoch).toBe(before + 2)
  })

  it("열림·크기는 새 대화로 바뀌지 않는다", () => {
    const store = ready("task")
    store.setOpen(true)
    store.setSize("docked")
    store.newConversation()
    expect(store.getState()).toMatchObject({ open: true, size: "docked", view: "chat" })
  })
})

describe("admin ai store — 직전 대화 목록(N5 1단계)", () => {
  it("제목(첫 질문 24자)·시각만 남기고 대화 원문은 담지 않는다", () => {
    const store = createAdminAiStore(instantClient())
    store.ask({ text: "한빛수학학원 내일 오후 3시에 데모 후속 전화 할 일 잡아 줘", scenario: "task", context: CONTEXT })
    vi.advanceTimersByTime(100)
    store.newConversation()

    const [thread] = store.getState().recentThreads
    expect(Object.keys(thread).sort()).toEqual(["at", "id", "title"])
    expect(Array.from(thread.title)).toHaveLength(24)
    expect(thread.at).toBe(Date.now())

    // 되돌리면 목록에서 빠진다 — 같은 대화가 두 번 보이지 않는다.
    store.restoreConversation()
    expect(store.getState().recentThreads).toEqual([])
  })

  it("sessionStorage 에 제목·시각만 쓴다", () => {
    const written: Record<string, string> = {}
    const storage = {
      getItem: (key: string) => written[key] ?? null,
      setItem: (key: string, value: string) => {
        written[key] = value
      },
    }
    vi.stubGlobal("window", { sessionStorage: storage, localStorage: storage })
    try {
      const store = createAdminAiStore(instantClient())
      store.subscribe(() => undefined)
      store.ask({ text: "도담영어 쇼룸 안내 문자", scenario: "sms", context: CONTEXT })
      vi.advanceTimersByTime(100)
      store.newConversation()

      const saved = JSON.parse(written["admin-ai:recent-threads:v1"])
      expect(saved).toHaveLength(1)
      expect(Object.keys(saved[0]).sort()).toEqual(["at", "id", "title"])
      expect(JSON.stringify(saved)).not.toContain("발송")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
