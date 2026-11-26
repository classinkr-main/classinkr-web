// 갈매봇 대화 클라이언트의 경계.
//
// 화면은 이 인터페이스만 안다. 시안 어댑터(샘플 데이터)와 실제 어댑터(서버 1단계 — POST /api/admin/ai/chat 의
// NDJSON 스트림을 읽어 기존 블록으로)가 같은 모양을 낸다. 어느 쪽을 쓸지는 lib/admin-ai/preview.ts adminAiMode() 한 곳에서 정한다.
import {
  buildDemoTurn,
  DEMO_FALLBACK_TEXT,
  demoScenarioSteps,
  matchDemoScenario,
  type DemoScenarioKey,
} from "./demo-scenarios"
import { adminAiMode } from "./preview"
import { parseStreamChunk } from "./stream-protocol"
import type { AdminAiPageContext, AdminAiTurnResult, AiBlock, OrderTicket } from "./types"

export interface AdminAiAskInput {
  text: string
  /** 추천 항목에서 온 요청이면 시나리오 키가 함께 온다(시안 모드 전용). */
  scenario?: DemoScenarioKey
  context: AdminAiPageContext | null
  /** 앞선 사용자 질문(최근 것이 뒤) — 실제 모드에서 짧은 되물음의 대상을 잇는 데만 쓴다. */
  history?: string[]
}

export type AdminAiConfirmResult =
  | { ok: true; text: string }
  /**
   * alreadyProcessed: 확인표가 이미 쓰였다(409 already_processed) — 카드는 "이미 처리됨" + 화면 링크.
   * consumed: 표를 쓴 뒤 실행이 실패했다 — 같은 카드로는 다시 확인할 수 없다(새 미리보기).
   */
  | { ok: false; text: string; alreadyProcessed?: boolean; consumed?: boolean }

export interface AdminAiTurnHandlers {
  onStep: (label: string) => void
  onDone: (result: AdminAiTurnResult) => void
}

export interface AdminAiClient {
  mode: "demo" | "live"
  /** 반환값을 호출하면 진행 중인 답변을 멈춘다. */
  ask: (input: AdminAiAskInput, handlers: AdminAiTurnHandlers) => () => void
  /** 서버 오더 확인(실제 모드만) — 카드의 서명 표를 확인 경로로 보낸다. */
  confirmOrder?: (ticket: string) => Promise<AdminAiConfirmResult>
}

const DEMO_STEP_DELAY_MS = 520

let orderSequence = 0
function nextOrderId(now: number) {
  orderSequence += 1
  return `demo-${now.toString(36)}-${orderSequence}`
}

export const demoAdminAiClient: AdminAiClient = {
  mode: "demo",
  ask(input, handlers) {
    const key = input.scenario ?? matchDemoScenario(input.text)
    const timers: Array<ReturnType<typeof setTimeout>> = []
    let stopped = false

    if (!key) {
      timers.push(
        setTimeout(() => {
          if (!stopped) handlers.onDone({ blocks: [{ kind: "text", text: DEMO_FALLBACK_TEXT }] })
        }, DEMO_STEP_DELAY_MS)
      )
    } else {
      const steps = demoScenarioSteps(key)
      steps.forEach((label, index) => {
        timers.push(
          setTimeout(() => {
            if (!stopped) handlers.onStep(label)
          }, DEMO_STEP_DELAY_MS * index)
        )
      })
      timers.push(
        setTimeout(() => {
          if (stopped) return
          const now = Date.now()
          handlers.onDone(
            buildDemoTurn(key, {
              now,
              orderId: nextOrderId(now),
              pagePath: input.context?.path,
            })
          )
        }, DEMO_STEP_DELAY_MS * steps.length)
      )
    }

    return () => {
      stopped = true
      timers.forEach(clearTimeout)
    }
  },
}

const LIVE_ERROR_TEXT = "답을 받지 못했습니다. 잠시 뒤 다시 물어봐 주세요."
/** done 도 error 도 없이 스트림이 끝났을 때(함수 시간 초과·연결 끊김) — 받은 블록 뒤에 붙인다(검토 동작-6). */
export const LIVE_CUT_TEXT = "답이 중간에 끊겼습니다 — 다시 물어봐 주세요."
/** 클라이언트 전체 시간 상한을 넘겨 멈췄을 때. */
export const LIVE_TIMEOUT_TEXT = "답이 너무 오래 걸려 멈췄습니다 — 다시 물어봐 주세요."
/** 한 턴의 전체 시간 상한 — 서버 함수 상한(60초)보다 짧게 둔다. */
export const LIVE_TURN_TIMEOUT_MS = 45_000

function httpErrorText(status: number): string {
  if (status === 401) return "로그인이 끝났습니다. 다시 로그인한 뒤 물어봐 주세요."
  if (status === 403) return "이 계정의 역할로는 갈매봇을 쓸 수 없습니다."
  if (status === 413) return "질문이 너무 깁니다. 줄여서 다시 물어봐 주세요."
  if (status === 429) return "요청이 너무 잦습니다. 잠시 뒤 다시 물어봐 주세요."
  return LIVE_ERROR_TEXT
}

/**
 * NDJSON 응답을 읽어 단계는 onStep 으로, 블록·오더는 모아 onDone 으로 넘긴다. fetch 는 시험에서 바꿔 끼운다.
 * 끝이 정직해야 한다: done 없이 끝나거나 연결이 끊기면 받은 블록은 남기고 "중간에 끊겼습니다" 한 줄을 붙인다.
 * 전체 시간 상한(timeoutMs)을 넘기면 요청을 멈추고 같은 식으로 알린다.
 */
export function createLiveAdminAiClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
  options: { timeoutMs?: number } = {}
): AdminAiClient {
  const timeoutMs = options.timeoutMs ?? LIVE_TURN_TIMEOUT_MS
  return {
    mode: "live",
    ask(input, handlers) {
      const controller = new AbortController()
      let stopped = false
      let timedOut = false
      const timer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeoutMs)
      const finish = (result: AdminAiTurnResult) => {
        clearTimeout(timer)
        if (!stopped) handlers.onDone(result)
      }
      const blocks: AiBlock[] = []
      let order: OrderTicket | undefined
      /** 오더 블록이 가리키는 오더가 없으면 그 블록을 버린다(화면이 빈 카드를 그리지 않게). */
      const result = (tail: string | null): AdminAiTurnResult => {
        const kept = blocks.filter((block) => block.kind !== "order" || block.orderId === order?.id)
        if (tail) kept.push({ kind: "text", text: tail })
        return { blocks: kept.length ? kept : [{ kind: "text", text: LIVE_ERROR_TEXT }], ...(order ? { order } : {}) }
      }
      void (async () => {
        try {
          const res = await fetcher("/api/admin/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            signal: controller.signal,
            body: JSON.stringify({
              messages: [...(input.history ?? []).map((text) => ({ role: "user", text })), { role: "user", text: input.text }],
              ...(input.context ? { pageContext: input.context } : {}),
            }),
          })
          if (!res.ok || !res.body) {
            finish({ blocks: [{ kind: "text", text: httpErrorText(res.status) }] })
            return
          }
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""
          let failed: string | null = null
          let ended = false
          for (;;) {
            const { value, done } = await reader.read()
            if (value) buffer += decoder.decode(value, { stream: !done })
            const parsed = parseStreamChunk(done ? `${buffer}\n` : buffer)
            buffer = parsed.rest
            for (const event of parsed.events) {
              if (event.type === "step" && !stopped) handlers.onStep(event.label)
              else if (event.type === "block") blocks.push(event.block)
              else if (event.type === "order" && !order) order = event.order
              else if (event.type === "error") {
                failed = event.message
                ended = true
              } else if (event.type === "done") ended = true
            }
            if (done) break
          }
          if (failed) blocks.push({ kind: "text", text: failed })
          finish(result(ended ? null : blocks.length ? LIVE_CUT_TEXT : null))
        } catch {
          if (stopped) return
          // 받은 블록은 버리지 않는다 — 끊긴 자리를 알리는 한 줄을 붙인다.
          const tail = timedOut ? LIVE_TIMEOUT_TEXT : blocks.length ? LIVE_CUT_TEXT : null
          finish(result(tail))
        }
      })()
      return () => {
        stopped = true
        clearTimeout(timer)
        controller.abort()
      }
    },
    async confirmOrder(ticket) {
      try {
        const res = await fetcher("/api/admin/ai/orders/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ticket }),
        })
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean
          result?: string
          error?: string
          code?: string
          consumed?: boolean
        } | null
        if (res.ok && body?.ok) return { ok: true, text: body.result ?? "실행했습니다." }
        return {
          ok: false,
          text: body?.error ?? httpErrorText(res.status),
          ...(res.status === 409 && body?.code === "already_processed" ? { alreadyProcessed: true } : {}),
          ...(body?.consumed === true ? { consumed: true } : {}),
        }
      } catch {
        return { ok: false, text: "확인 요청을 보내지 못했습니다. 연결을 확인해 주세요." }
      }
    },
  }
}

export const liveAdminAiClient: AdminAiClient = createLiveAdminAiClient()

/** 현재 연결된 클라이언트 — 실제 모드 스위치(NEXT_PUBLIC_ADMIN_AI_LIVE=1)가 켜져 있으면 실제, 아니면 시안. */
export const adminAiClient: AdminAiClient = adminAiMode() === "live" ? liveAdminAiClient : demoAdminAiClient
