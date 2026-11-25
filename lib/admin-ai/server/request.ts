// 갈매봇 대화 API 본문 검사 — { messages: [{ role, text }], pageContext?: { path, label, entity? } }.
// 순수 함수다. 화면 맥락은 어드민 경로만 받는다(그 밖은 버린다).
import type { AdminAiEntity, AdminAiPageContext } from "../types"

export const MAX_MESSAGES = 12
export const MAX_TEXT = 1000

export interface ChatRequestBody {
  text: string
  history: string[]
  context: AdminAiPageContext | null
}

const ENTITY_TYPES = new Set<AdminAiEntity["type"]>(["lead", "customer", "deal", "quote", "hardware_item", "hardware_movement"])

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v)

function parseContext(raw: unknown): AdminAiPageContext | null {
  if (!isRecord(raw)) return null
  const path = typeof raw.path === "string" ? raw.path.trim() : ""
  if (!/^\/admin(?:\/|$|\?)/.test(path) || path.length > 300) return null
  const label = typeof raw.label === "string" ? raw.label.slice(0, 80) : ""
  let entity: AdminAiEntity | undefined
  if (isRecord(raw.entity)) {
    const { type, id, label: entityLabel } = raw.entity
    if (typeof type === "string" && ENTITY_TYPES.has(type as AdminAiEntity["type"]) && typeof id === "string" && /^[A-Za-z0-9:_-]{1,80}$/.test(id)) {
      entity = { type: type as AdminAiEntity["type"], id, label: typeof entityLabel === "string" ? entityLabel.slice(0, 80) : "" }
    }
  }
  return { path, label, ...(entity ? { entity } : {}) }
}

export function parseChatBody(raw: unknown): { ok: true; value: ChatRequestBody } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: "본문은 JSON 객체여야 합니다." }
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) return { ok: false, error: "messages 가 필요합니다." }
  const messages = raw.messages.slice(-MAX_MESSAGES)
  const parsed: Array<{ role: "user" | "assistant"; text: string }> = []
  for (const message of messages) {
    if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant") || typeof message.text !== "string") {
      return { ok: false, error: "messages 의 각 항목은 { role: user|assistant, text } 입니다." }
    }
    parsed.push({ role: message.role, text: message.text })
  }
  const last = parsed.at(-1)
  if (!last || last.role !== "user") return { ok: false, error: "마지막 메시지는 사용자 질문이어야 합니다." }
  const text = last.text.trim()
  if (!text) return { ok: false, error: "질문이 비어 있습니다." }
  if (text.length > MAX_TEXT) return { ok: false, error: `질문은 ${MAX_TEXT}자까지입니다.` }
  const history = parsed
    .slice(0, -1)
    .filter((m) => m.role === "user")
    .map((m) => m.text.trim().slice(0, MAX_TEXT))
    .filter(Boolean)
    .slice(-4)
  return { ok: true, value: { text, history, context: parseContext(raw.pageContext) } }
}
