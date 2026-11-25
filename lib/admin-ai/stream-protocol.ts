// 갈매봇 대화 API(POST /api/admin/ai/chat)의 NDJSON 한 줄 꼴 — 서버와 화면 클라이언트가 같이 쓴다.
//
// 한 줄 = JSON 하나 + "\n". 순서: step* → (block | order)* → done. 실패하면 error 한 줄로 끝난다.
//  - step: 진행 단계 한 줄(화면의 "질문 분류 → 근거 찾기" 같은 줄).
//  - block: 카드 하나(AiBlock). 질문 조각마다 순서대로 낸다.
//  - order: 오더 카드의 값(OrderTicket). 같은 턴의 { kind: "order", orderId } 블록이 이 값을 가리킨다.
//  - done / error: 끝.
// 순수 모듈이다(server-only·브라우저 API 없음).
import type { AiBlock, OrderTicket } from "./types"

export type AdminAiStreamEvent =
  | { type: "step"; label: string }
  | { type: "block"; block: AiBlock }
  | { type: "order"; order: OrderTicket }
  | { type: "done" }
  | { type: "error"; message: string; code?: string }

export const ADMIN_AI_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8"

export function encodeStreamEvent(event: AdminAiStreamEvent): string {
  return `${JSON.stringify(event)}\n`
}

const EVENT_TYPES = new Set(["step", "block", "order", "done", "error"])

function isStreamEvent(value: unknown): value is AdminAiStreamEvent {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    EVENT_TYPES.has((value as { type?: unknown }).type as string)
  )
}

/** 받은 글 조각을 줄 단위로 끊는다. 끝나지 않은 마지막 줄은 rest 로 돌려준다. 모르는 줄·깨진 줄은 버린다. */
export function parseStreamChunk(buffer: string): { events: AdminAiStreamEvent[]; rest: string } {
  const lines = buffer.split("\n")
  const rest = lines.pop() ?? ""
  const events: AdminAiStreamEvent[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isStreamEvent(parsed)) events.push(parsed)
    } catch {
      // 깨진 줄은 버린다.
    }
  }
  return { events, rest }
}
