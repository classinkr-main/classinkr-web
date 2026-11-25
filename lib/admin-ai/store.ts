// 갈매봇 화면 상태 — 위젯(어느 화면에서나)과 AI 올인원 탭이 같은 대화·오더를 본다.
//
// Provider 가 아니라 모듈 스토어인 이유: 위젯은 셸이, 탭은 페이지가 그린다. 둘을 하나의
// Provider 로 감싸려면 셸의 children 전체를 클라이언트 경계 안에 넣어야 한다. 구독은
// useSyncExternalStore 로 하고, 서버 스냅샷은 항상 초기 상태다(서버에서는 dispatch 하지 않는다).
import { adminAiClient, type AdminAiClient } from "./client"
import type { DemoScenarioKey } from "./demo-scenarios"
import { canUndoOrder, isLiveOrder, isPendingOrder, transitionOrder, type OrderAction } from "./order-state"
import {
  addRecentThread,
  browserSessionStorage,
  readRecentThreads,
  recentThreadTitle,
  removeRecentThread,
  writeRecentThreads,
  type RecentThread,
} from "./recent-threads"
import type {
  AdminAiPageContext,
  AdminAiTurnResult,
  AiBlock,
  AiMessage,
  OrderTicket,
} from "./types"

/** 새 대화 직후 6초 동안 되돌릴 수 있는 직전 대화 1칸(새 대화 설계 N2). */
export const NEW_CONVERSATION_UNDO_MS = 6000

export interface ConversationSnapshot {
  messages: AiMessage[]
  contextEnabled: boolean
  /** 이 대화가 "직전 대화" 목록에 올린 항목 — 되돌리면 목록에서 뺀다. */
  threadId: string | null
}

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
  /** 대화가 비워지거나 복구될 때마다 오른다 — 입력창 같은 화면 쪽 임시 상태를 새로 시작하는 열쇠. */
  epoch: number
  /** 새 대화 직후의 되돌리기 칸. 6초가 지나거나 새 질문을 하면 없어진다. */
  undoSnapshot: ConversationSnapshot | null
  /** 직전 대화 제목·시각(최대 5개). 원문은 두지 않는다. */
  recentThreads: RecentThread[]
  /** 남은 시간 계산용 현재 시각. 흐르는 오더가 있을 때만 매초 갱신된다. */
  now: number
}

export type AdminAiEvent =
  | { type: "set-open"; open: boolean; now?: number }
  | { type: "set-size"; size: AdminAiPanelSize }
  | { type: "set-view"; view: AdminAiPanelView }
  | { type: "set-context"; enabled: boolean }
  | { type: "new-conversation"; now: number; threadId: string }
  | { type: "restore-conversation" }
  | { type: "drop-undo-snapshot" }
  | { type: "hydrate-recent"; threads: RecentThread[] }
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
  epoch: 0,
  undoSnapshot: null,
  recentThreads: [],
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

/** 수정 중인 오더를 모두 확인 대기로 되돌리고 시계를 다시 돌린다. 바꿀 것이 없으면 같은 state. */
function revertAllEditing(state: AdminAiState, now: number): AdminAiState {
  let changed = false
  const orders: Record<string, OrderTicket> = {}
  for (const id of state.orderIds) {
    const order = state.orders[id]
    const next = transitionOrder(order, { type: "revert-edit" }, now)
    if (next !== order) changed = true
    orders[id] = next
  }
  return changed ? { ...state, now, orders } : state
}

export function reduceAdminAi(state: AdminAiState, event: AdminAiEvent): AdminAiState {
  switch (event.type) {
    case "set-open": {
      if (state.open === event.open) return state
      // 닫으면 수정 중이던 카드는 입력값과 함께 사라진다 — 오더가 "수정 중" 에 멈춰 시계가 서 있지 않도록
      // 되돌려 시계를 다시 돌린다(수정 취소와 같다).
      return event.open ? { ...state, open: true } : { ...revertAllEditing(state, event.now ?? state.now), open: false }
    }
    case "set-size":
      return state.size === event.size ? state : { ...state, size: event.size }
    case "set-view":
      return state.view === event.view ? state : { ...state, view: event.view }
    case "set-context":
      return { ...state, contextEnabled: event.enabled }
    case "hydrate":
      return { ...state, open: event.open, size: event.size }

    case "new-conversation": {
      // 지울 대화가 없으면 아무 일도 없다(버튼도 꺼져 있다).
      if (state.messages.length === 0) return state

      // 지우는 것: 말풍선·진행 중 답변·맥락 켬·입력 중 글(epoch)·수정 중 카드(되돌린 뒤 시계 재개).
      // 지우지 않는 것: 확인 대기·유예 중·되돌릴 수 있는 완료 오더와 화면 맥락, 열림·크기·옆에 붙임.
      // 오더는 대화가 아니라 사람이 확인해야 하는 일이다 — 대화를 지웠다고 사라지면 안 된다.
      const stopped = state.messages.map((message) =>
        message.pending
          ? { ...message, pending: false, blocks: [{ kind: "text" as const, text: "답변을 멈췄습니다." }] }
          : message
      )
      const reverted = revertAllEditing(state, event.now)

      const title = recentThreadTitle(state.messages, state.orders)
      return {
        ...state,
        messages: [],
        busy: false,
        view: "chat",
        contextEnabled: true,
        epoch: state.epoch + 1,
        now: event.now,
        orders: reverted.orders,
        undoSnapshot: {
          messages: stopped,
          contextEnabled: state.contextEnabled,
          threadId: title ? event.threadId : null,
        },
        recentThreads: title
          ? addRecentThread(state.recentThreads, { id: event.threadId, title, at: event.now })
          : state.recentThreads,
      }
    }

    case "restore-conversation": {
      const snapshot = state.undoSnapshot
      if (!snapshot) return state
      // 진행 중이던 답은 새 대화를 시작할 때 멈춰 두었다 — 멈춘 채로 돌아온다.
      return {
        ...state,
        messages: snapshot.messages,
        contextEnabled: snapshot.contextEnabled,
        busy: false,
        view: "chat",
        epoch: state.epoch + 1,
        undoSnapshot: null,
        recentThreads: snapshot.threadId
          ? removeRecentThread(state.recentThreads, snapshot.threadId)
          : state.recentThreads,
      }
    }

    case "drop-undo-snapshot":
      return state.undoSnapshot ? { ...state, undoSnapshot: null } : state

    case "hydrate-recent":
      return { ...state, recentThreads: event.threads }

    case "ask": {
      if (state.busy) return state
      return {
        ...state,
        view: "chat",
        busy: true,
        // 새 질문을 시작했으면 직전 대화로 돌아갈 자리는 없다 — 되돌리면 새 대화를 덮어쓴다.
        undoSnapshot: null,
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
      if (!target?.pending) {
        return { ...state, busy: state.messages.some((message) => message.pending) }
      }

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

/** 발송 유예 중인 오더 — 30초 안에 취소할 수 있는 것. */
export function selectGraceOrders(state: AdminAiState): OrderTicket[] {
  return selectOrders(state).filter((order) => order.state === "grace")
}

/**
 * 위젯 "오더" 탭이 보여 주는 오더 — 아직 사람이 손댈 수 있는 것 전부.
 * 확인 대기·수정 중, 발송 유예 중, 되돌릴 수 있는 완료. 유예 중을 맨 위에 둔다(시간이 가장 급하다).
 * 새 대화로 말풍선이 비워져도 이 목록은 그대로다 — 오더는 대화에 매이지 않는다.
 */
export function selectLiveOrders(state: AdminAiState): OrderTicket[] {
  const all = selectOrders(state)
  const grace = all.filter((order) => order.state === "grace")
  const pending = all.filter(isPendingOrder)
  const undoable = all.filter((order) => order.state === "done" && canUndoOrder(order, state.now))
  return [...grace, ...pending, ...undoable]
}

/** 지금 조치가 필요한 오더 수 — 확인 대기·수정 중·발송 유예 중. 오더 탭 숫자. */
export function countActionableOrders(state: AdminAiState): number {
  return selectOrders(state).filter((order) => isPendingOrder(order) || order.state === "grace").length
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
  let undoTimer: ReturnType<typeof setTimeout> | null = null

  function syncTicker() {
    const live = selectOrders(state).some((order) => isLiveOrder(order, state.now))
    if (live && !ticker) {
      ticker = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 1000)
    } else if (!live && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  // 되돌리기 칸이 생기면 6초 뒤 닫고, 없어지면(복구·새 질문) 시계를 치운다.
  function syncUndoTimer(previous: ConversationSnapshot | null) {
    if (state.undoSnapshot === previous) return
    if (undoTimer) {
      clearTimeout(undoTimer)
      undoTimer = null
    }
    if (state.undoSnapshot) {
      undoTimer = setTimeout(() => {
        undoTimer = null
        dispatch({ type: "drop-undo-snapshot" })
      }, NEW_CONVERSATION_UNDO_MS)
    }
  }

  function dispatch(event: AdminAiEvent) {
    const next = reduceAdminAi(state, event)
    if (next === state) return
    const prefsChanged = next.open !== state.open || next.size !== state.size
    const recentChanged = next.recentThreads !== state.recentThreads
    const previousSnapshot = state.undoSnapshot
    state = next
    if (prefsChanged && hydrated) writePrefs({ open: state.open, size: state.size })
    if (recentChanged && hydrated && event.type !== "hydrate-recent") {
      writeRecentThreads(browserSessionStorage(), state.recentThreads)
    }
    syncUndoTimer(previousSnapshot)
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
        state = reduceAdminAi(state, {
          type: "hydrate-recent",
          threads: readRecentThreads(browserSessionStorage()),
        })
      }
      return () => {
        listeners.delete(listener)
      }
    },

    setOpen: (open: boolean) => dispatch({ type: "set-open", open, now: Date.now() }),
    toggleOpen: () => dispatch({ type: "set-open", open: !state.open, now: Date.now() }),
    setSize: (size: AdminAiPanelSize) => dispatch({ type: "set-size", size }),
    setView: (view: AdminAiPanelView) => dispatch({ type: "set-view", view }),
    setContextEnabled: (enabled: boolean) => dispatch({ type: "set-context", enabled }),

    /** 새 대화. 확인창 없이 한 번 — 실수는 6초 안에 restoreConversation 으로 되돌린다. */
    newConversation() {
      if (state.messages.length === 0) return
      stopCurrentTurn?.()
      stopCurrentTurn = null
      currentAssistantId = null
      dispatch({ type: "new-conversation", now: Date.now(), threadId: nextId("th") })
    },

    /** Esc — 수정 중인 카드가 있으면 모두 수정 취소로 되돌린다. 되돌린 것이 있었는지 알려 준다. */
    revertEditingOrders(): boolean {
      const editing = selectOrders(state).filter((order) => order.state === "editing")
      const now = Date.now()
      for (const order of editing) {
        dispatch({ type: "order-action", orderId: order.id, action: { type: "revert-edit" }, now })
      }
      return editing.length > 0
    },

    restoreConversation() {
      dispatch({ type: "restore-conversation" })
    },

    /** 발송 유예 중인 오더를 모두 취소한다 — 새 대화 토스트의 "발송 취소". */
    abortGraceOrders() {
      const now = Date.now()
      for (const order of selectGraceOrders(state)) {
        dispatch({ type: "order-action", orderId: order.id, action: { type: "abort" }, now })
      }
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
