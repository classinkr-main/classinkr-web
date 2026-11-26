// 위컴 지능형 로봇 수신구의 스위치·설정 — 환경변수만 읽는다(값은 로그·응답에 싣지 않는다).
//
// 모두 있어야 열린다. 하나라도 없거나 모양이 틀리면 닫힘(수신구는 없는 경로처럼 404):
//  - WECOM_AIBOT_TOKEN              콜백 Token(로봇 API 설정 화면의 값)
//  - WECOM_AIBOT_ENCODING_AES_KEY   콜백 EncodingAESKey(43자)
//  - WECOM_AIBOT_ID                 로봇 id(콜백 본문의 aibotid 와 같아야 한다)
//  - WECOM_AIBOT_USER_MAP           연결표 JSON {"<위컴 userid>": "<어드민 이메일>"} — 한 사람 이상
// 선택:
//  - WECOM_AIBOT_ALLOWED_CHATIDS    쉼표로 나눈 단체방 chatid. 있으면 그 밖의 단체방 글은 답하지 않는다.
import { decodeAesKey } from "./aibot-crypto"

export const WECOM_AIBOT_ENV = {
  token: "WECOM_AIBOT_TOKEN",
  aesKey: "WECOM_AIBOT_ENCODING_AES_KEY",
  botId: "WECOM_AIBOT_ID",
  userMap: "WECOM_AIBOT_USER_MAP",
  allowedChatIds: "WECOM_AIBOT_ALLOWED_CHATIDS",
} as const

export interface WecomAibotConfig {
  token: string
  key: Buffer
  botId: string
  /** 위컴 userid → 어드민 이메일(소문자). */
  userMap: ReadonlyMap<string, string>
  /** 비어 있으면 단체방 제한 없음. */
  allowedChatIds: ReadonlySet<string>
}

export type WecomAibotConfigResult =
  | { ok: true; config: WecomAibotConfig }
  | { ok: false; reason: "missing_token" | "missing_aes_key" | "bad_aes_key" | "missing_bot_id" | "missing_user_map" | "bad_user_map" }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 연결표 JSON → Map. 모양이 틀리면 null(한 줄이라도 틀리면 전체를 버린다 — 반쯤 열린 표를 쓰지 않는다). */
export function parseUserMap(raw: string | undefined): Map<string, string> | null {
  if (!raw?.trim()) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const map = new Map<string, string>()
  for (const [userId, email] of Object.entries(parsed as Record<string, unknown>)) {
    const id = userId.trim()
    if (!id || id.length > 128 || typeof email !== "string" || !EMAIL.test(email.trim())) return null
    map.set(id, email.trim().toLowerCase())
  }
  return map.size ? map : null
}

export function readWecomAibotConfig(env: Record<string, string | undefined> = process.env): WecomAibotConfigResult {
  const token = env[WECOM_AIBOT_ENV.token]?.trim()
  if (!token) return { ok: false, reason: "missing_token" }
  const rawKey = env[WECOM_AIBOT_ENV.aesKey]?.trim()
  if (!rawKey) return { ok: false, reason: "missing_aes_key" }
  let key: Buffer
  try {
    key = decodeAesKey(rawKey)
  } catch {
    return { ok: false, reason: "bad_aes_key" }
  }
  const botId = env[WECOM_AIBOT_ENV.botId]?.trim()
  if (!botId) return { ok: false, reason: "missing_bot_id" }
  const rawMap = env[WECOM_AIBOT_ENV.userMap]
  if (!rawMap?.trim()) return { ok: false, reason: "missing_user_map" }
  const userMap = parseUserMap(rawMap)
  if (!userMap) return { ok: false, reason: "bad_user_map" }
  const allowedChatIds = new Set(
    (env[WECOM_AIBOT_ENV.allowedChatIds] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
  return { ok: true, config: { token, key, botId, userMap, allowedChatIds } }
}
