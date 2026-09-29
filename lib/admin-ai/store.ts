// 갈매봇 화면 상태 — 위젯(어느 화면에서나)과 AI 올인원 탭이 같은 대화·오더를 본다.
//
// Provider 가 아니라 모듈 스토어인 이유: 위젯은 셸이, 탭은 페이지가 그린다. 둘을 하나의
// Provider 로 감싸려면 셸의 children 전체를 클라이언트 경계 안에 넣어야 한다. 구독은
// useSyncExternalStore 로 하고, 서버 스냅샷은 항상 초기 상태다(서버에서는 dispatch 하지 않는다).
import { adminAiClient, type AdminAiClient } from "./client"
import type { DemoScenarioKey } from "./demo-scenarios"
import { isLiveOrder, isPendingOrder, transitionOrder, type OrderAction } from "./order-state"
import type {
  AdminAiPageContext,
  AdminAiTurnResult,
  AiBlock,
  AiMessage,
  OrderTicket,
} from "./types"

export type AdminAiPanelSize = "floating" | "docked"
export type AdminAiPanelView = "chat" | "orders"

export interface AdminAiState {
  open: boolean
  size: AdminAiPanelSize
  view: AdminAiPanelView
  /** 화면 맥락을 갈매봇에 넘길지. 대화 단위 설정이다. */
  contextEnabled: boolean
  messages: AiMessage[]
  orders: Record<string, OrderTicket>
  /** 만든 순서. */
  orderIds: string[]
  busy: boolean
  /** 남은 시간 계산용 현재 시각. 흐르는 오더가 있을 때만 매초 갱신된다. */
  now: number
}

export type AdminAiEvent =
  | { type: "set-open"; open: boolean }
  | { type: "set-size"; size: AdminAiPanelSize }
  | { type: "set-view"; view: AdminAiPanelView }
  | { type: "set-context"; enabled: boolean }
  | { type: "new-conversation" }
  | { type: "ask"; userId: string; assistantId: string; text: string }
  | { type: "step"; assistantId: string; label: string }
  | { type: "turn-done"; assistantId: string; result: AdminAiTurnResult; now: number }
  | { type: "turn-stopped"; assistantId: string }
  | { type: "order-action"; orderId: string; action: OrderAction; now: number }
  | { type: "tick"; now: number }
  | { type: "hydrate"; open: boolean; size: AdminAiPanelSize }

export const INITIAL_ADMIN_AI_STATE: AdminAiState = {
  open: false,
  size: "floating",
  view: "chat",
  contextEnabled: true,
  messages: [],
  orders: {},
  orderIds: [],
  busy: false,
  now: 0,
}

function updateMessage(
  messages: AiMessage[],
  id: string,
  update: (message: AiMessage) => AiMessage
): AiMessage[] {
  return messages.map((message) => (message.id === id ? update(message) : message))
}

function appendStep(blocks: AiBlock[], label: string): AiBlock[] {
  const existing = blocks.find((block) => block.kind === "steps")
  const steps = existing && existing.kind === "steps" ? existing.steps : []
  const next: AiBlock = {
    kind: "steps",
    steps: [...steps.map((step) => ({ ...step, done: true })), { label, done: false }],
  }
  return [next]
}

export function reduceAdminAi(state: AdminAiState, event: AdminAiEvent): AdminAiState {
  switch (event.type) {
    case "set-open":
      return state.open === event.open ? state : { ...state, open: event.open }
    case "set-size":
      return state.size === event.size ? state : { ...state, size: event.size }
    case "set-view":
      return state.view === event.view ? state : { ...state, view: event.view }
    case "set-context":
      return { ...state, contextEnabled: event.enabled }
    case "hydrate":
      return { ...state, open: event.open, size: event.size }

    case "new-conversation":
      // 대화만 비운다. 확인을 기다리는 오더는 남는다 — 대화를 지웠다고 오더가 사라지면 안 된다.
      return { ...state, messages: [], busy: false, view: "chat", contextEnabled: true }

    case "ask": {
      if (state.busy) return state
      return {
        ...state,
        view: "chat",
        busy: true,
        messages: [
          ...state.messages,
          { id: event.userId, role: "user", text: event.text, blocks: [] },
          { id: event.assistantId, role: "assistant", blocks: [], pending: true },
        ],
      }
    }

    case "step":
      return {
        ...state,
        messages: updateMessage(state.messages, event.assistantId, (message) =>
          message.pending ? { ...message, blocks: appendStep(message.blocks, event.label) } : message
        ),
      }

    case "turn-done": {
      const target = state.messages.find((message) => message.id === event.assistantId)
      // 새 대화로 비운 뒤 늦게 도착한 답변은 버린다.
      if (!target?.pending) return { ...state, busy: false }

      const order = event.result.order
      const finishedSteps = target.blocks
        .filter((block) => block.kind === "steps")
        .map((block) =>
          block.kind === "steps"
            ? { ...block, steps: block.steps.map((step) => ({ ...step, done: true })) }
            : block
        )

      return {
        ...state,
        busy: false,
        now: event.now,
        messages: updateMessage(state.messages, event.assistantId, (message) => ({
          ...message,
          pending: false,
          blocks: [...finishedSteps, ...event.result.blocks],
        })),
        orders: order ? { ...state.orders, [order.id]: order } : state.orders,
        orderIds: order ? [...state.orderIds, order.id] : state.orderIds,
      }
    }

    case "turn-stopped":
      return {
        ...state,
        busy: false,
        messages: updateMessage(state.messages, event.assistantId, (message) => ({
          ...message,
          pending: false,
          blocks: [{ kind: "text", text: "답변을 멈췄습니다." }],
        })),
      }

    case "order-action": {
      const order = state.orders[event.orderId]
      if (!order) return state
      const next = transitionOrder(order, event.action, event.now)
      if (next === order) return state
      return { ...state, now: event.now, orders: { ...state.orders, [order.id]: next } }
    }

    case "tick": {
      let changed = false
      const orders: Record<string, OrderTicket> = {}
      for (const id of state.orderIds) {
        const order = state.orders[id]
        const next = transitionOrder(order, { type: "tick" }, event.now)
        if (next !== order) changed = true
        orders[id] = next
      }
      return { ...state, now: event.now, orders: changed ? orders : state.orders }
    }
  }
}

export function selectOrders(state: AdminAiState): OrderTicket[] {
  return state.orderIds.map((id) => state.orders[id]).filter(Boolean)
}

export function selectPendingOrders(state: AdminAiState): OrderTicket[] {
  return selectOrders(state).filter(isPendingOrder)
}

// ── 스토어 ─────────────────────────────────────────────────────────────────────

const PREFS_KEY = "admin-ai:prefs:v1"

interface StoredPrefs {
  open: boolean
  size: AdminAiPanelSize
}

function readPrefs(): StoredPrefs | null {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    const { open, size } = parsed as Record<string, unknown>
    if (typeof open !== "boolean") return null
    if (size !== "floating" && size !== "docked") return null
    return { open, size }
  } catch {
    // 사생활 보호 모드·저장소 차단 — 기억하지 못할 뿐 동작에는 지장이 없다.
    return null
  }
}

function writePrefs(prefs: StoredPrefs) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // 위와 같음.
  }
}

export function createAdminAiStore(client: AdminAiClient = adminAiClient) {
  let state = INITIAL_ADMIN_AI_STATE
  const listeners = new Set<() => void>()
  let ticker: ReturnType<typeof setInterval> | null = null
  let stopCurrentTurn: (() => void) | null = null
  let currentAssistantId: string | null = null
  let hydrated = false
  let sequence = 0

  function syncTicker() {
    const live = selectOrders(state).some((order) => isLiveOrder(order, state.now))
    if (live && !ticker) {
      ticker = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000)
    } else if (!live && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function dispatch(event: AdminAiEvent) {
    const next = reduceAdminAi(state, event)
    if (next === state) return
    const prefsChanged = next.open !== state.open || next.size !== state.size
    state = next
    if (prefsChanged && hydrated) writePrefs({ open: state.open, size: state.size })
    syncTicker()
    listeners.forEach((listener) => listener())
  }

  function nextId(prefix: string) {
    sequence += 1
    return `${prefix}-${sequence}`
  }

  return {
    mode: client.mode,
    getState: () => state,
    getServerState: () => INITIAL_ADMIN_AI_STATE,

    subscribe(listener: () => void) {
      listeners.add(listener)
      if (!hydrated && typeof window !== "undefined") {
        hydrated = true
        const prefs = readPrefs()
        if (prefs) {
          // 좁은 화면에서는 패널이 화면을 덮는 하단 시트다. 지난번에 열어 뒀다는 이유로
          // 들어오자마자 화면을 가리지 않는다 — 열림 상태는 넓은 화면에서만 되살린다.
          const wide = window.matchMedia?.("(min-width: 1024px)").matches ?? true
          state = reduceAdminAi(state, {
            type: "hydrate",
            open: prefs.open && wide,
            size: prefs.size,
          })
        }
      }
      return () => {
        listeners.delete(listener)
      }
    },

    setOpen: (open: boolean) => dispatch({ type: "set-open", open }),
    toggleOpen: () => dispatch({ type: "set-open", open: !state.open }),
    setSize: (size: AdminAiPanelSize) => dispatch({ type: "set-size", size }),
    setView: (view: AdminAiPanelView) => dispatch({ type: "set-view", view }),
    setContextEnabled: (enabled: boolean) => dispatch({ type: "set-context", enabled }),

    newConversation() {
      stopCurrentTurn?.()
      stopCurrentTurn = null
      currentAssistantId = null
      dispatch({ type: "new-conversation" })
    },

    ask(input: { text: string; scenario?: DemoScenarioKey; context: AdminAiPageContext | null }) {
      const text = input.text.trim()
      if (!text || state.busy) return

      const assistantId = nextId("a")
      currentAssistantId = assistantId
      dispatch({ type: "ask", userId: nextId("u"), assistantId, text })

      stopCurrentTurn = client.ask(
        { text, scenario: input.scenario, context: state.contextEnabled ? input.context : null },
        {
          onStep: (label) => dispatch({ type: "step", assistantId, label }),
          onDone: (result) => {
            stopCurrentTurn = null
            currentAssistantId = null
            dispatch({ type: "turn-done", assistantId, result, now: Date.now() })
          },
        }
      )
    },

    stop() {
      if (!currentAssistantId) return
      stopCurrentTurn?.()
      stopCurrentTurn = null
      dispatch({ type: "turn-stopped", assistantId: currentAssistantId })
      currentAssistantId = null
    },

    actOnOrder(orderId: string, action: OrderAction) {
      dispatch({ type: "order-action", orderId, action, now: Date.now() })
    },
  }
}

export type AdminAiStore = ReturnType<typeof createAdminAiStore>

export const adminAiStore: AdminAiStore = createAdminAiStore()
