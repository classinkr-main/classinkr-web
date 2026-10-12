// 갈매봇 대화 클라이언트의 경계.
//
// 화면은 이 인터페이스만 안다. 지금은 시안 어댑터(샘플 데이터) 하나뿐이고, 서버 오더 엔진
// (기획 §6.2 POST /api/admin/ai/chat)이 생기면 같은 인터페이스의 live 구현을 끼운다.
import {
  buildDemoTurn,
  DEMO_FALLBACK_TEXT,
  demoScenarioSteps,
  matchDemoScenario,
  type DemoScenarioKey,
} from "./demo-scenarios"
import type { AdminAiPageContext, AdminAiTurnResult } from "./types"

export interface AdminAiAskInput {
  text: string
  /** 추천 항목에서 온 요청이면 시나리오 키가 함께 온다(시안 모드 전용). */
  scenario?: DemoScenarioKey
  context: AdminAiPageContext | null
}

export interface AdminAiTurnHandlers {
  onStep: (label: string) => void
  onDone: (result: AdminAiTurnResult) => void
}

export interface AdminAiClient {
  mode: "demo" | "live"
  /** 반환값을 호출하면 진행 중인 답변을 멈춘다. */
  ask: (input: AdminAiAskInput, handlers: AdminAiTurnHandlers) => () => void
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

/** 현재 연결된 클라이언트. 서버 엔진이 붙으면 여기만 바꾼다. */
export const adminAiClient: AdminAiClient = demoAdminAiClient
