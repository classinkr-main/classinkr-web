/**
 * 채널톡 Open API 클라이언트 (server-only).
 *
 * 인증: CHANNEL_ACCESS_KEY / CHANNEL_ACCESS_SECRET (채널톡 설정 > 보안 > API).
 * 위젯용 NEXT_PUBLIC_CHANNEL_PLUGIN_KEY 와는 별개의 키다.
 * 미설정 시 isChannelApiConfigured()가 false를 반환하며, 호출은 ChannelApiError를 던진다.
 *
 * 주의: 응답 필드는 계정 API 버전에 따라 달라질 수 있어 방어적으로 파싱한다.
 * 실제 키로 한 번 검증한 뒤 필드 매핑을 확정할 것.
 */

import "server-only"

const API_BASE = "https://api.channel.io/open/v5"
const REQUEST_TIMEOUT_MS = 15_000

export class ChannelApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ChannelApiError"
    this.status = status
  }
}

function getCredentials() {
  const accessKey = process.env.CHANNEL_ACCESS_KEY?.trim()
  const accessSecret = process.env.CHANNEL_ACCESS_SECRET?.trim()
  if (!accessKey || !accessSecret) return null
  return { accessKey, accessSecret }
}

export function isChannelApiConfigured(): boolean {
  return getCredentials() !== null
}

interface ChannelApiRequest {
  method?: "GET" | "POST" | "PUT" | "DELETE"
  query?: Record<string, string | number | undefined>
  body?: unknown
}

async function channelApiFetch<T>(path: string, request: ChannelApiRequest = {}): Promise<T> {
  const creds = getCredentials()
  if (!creds) {
    throw new ChannelApiError(
      "채널톡 Open API 키가 설정되지 않았습니다 (CHANNEL_ACCESS_KEY / CHANNEL_ACCESS_SECRET).",
      0
    )
  }

  const url = new URL(`${API_BASE}${path}`)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  let res: Response
  try {
    res = await fetch(url.toString(), {
      method: request.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-access-key": creds.accessKey,
        "x-access-secret": creds.accessSecret,
      },
      body: request.body !== undefined ? JSON.stringify(request.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "네트워크 오류"
    throw new ChannelApiError(`채널톡 API 요청 실패: ${message}`, 0)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ChannelApiError(`채널톡 API ${res.status}: ${text.slice(0, 200)}`, res.status)
  }

  return (await res.json()) as T
}

/* ─── 타입 (방어적 partial) ─── */

export interface ChannelUserChat {
  id: string
  channelId?: string
  state?: string
  userId?: string
  name?: string
  tags?: string[]
  createdAt?: number
  openedAt?: number
  closedAt?: number
  frontMessageId?: string
}

export interface ChannelUser {
  id: string
  name?: string
  profile?: Record<string, unknown> | null
}

export interface ChannelMessage {
  id: string
  chatId?: string
  personType?: string
  personId?: string
  plainText?: string
  createdAt?: number
}

export interface ListUserChatsResult {
  userChats: ChannelUserChat[]
  users: ChannelUser[]
  next?: string
}

/* ─── 엔드포인트 ─── */

export async function listUserChats(
  options: { state?: string; limit?: number; since?: string; sortOrder?: "asc" | "desc" } = {}
): Promise<ListUserChatsResult> {
  const data = await channelApiFetch<{
    userChats?: ChannelUserChat[]
    users?: ChannelUser[]
    next?: string
  }>("/user-chats", {
    query: {
      state: options.state,
      limit: options.limit ?? 25,
      since: options.since,
      sortOrder: options.sortOrder ?? "desc",
    },
  })

  return {
    userChats: data.userChats ?? [],
    users: data.users ?? [],
    next: data.next,
  }
}

export async function getUserChatMessages(
  userChatId: string,
  options: { limit?: number; sortOrder?: "asc" | "desc" } = {}
): Promise<ChannelMessage[]> {
  const data = await channelApiFetch<{ messages?: ChannelMessage[] }>(
    `/user-chats/${encodeURIComponent(userChatId)}/messages`,
    {
      query: {
        limit: options.limit ?? 50,
        sortOrder: options.sortOrder ?? "asc",
      },
    }
  )

  return data.messages ?? []
}

/** 봇 명의로 상담 대화에 메시지를 남긴다(예: 챗봇 컨텍스트 인계). */
export async function writeUserChatMessage(
  userChatId: string,
  text: string,
  botName = "Classin Bot"
): Promise<void> {
  await channelApiFetch(`/user-chats/${encodeURIComponent(userChatId)}/messages`, {
    method: "POST",
    query: { botName },
    body: { blocks: [{ type: "text", value: text }] },
  })
}

/** 채널톡 user의 profile에서 email/phone을 추출한다(키 이름이 계정마다 다를 수 있어 방어적). */
export function extractUserContact(user: ChannelUser | undefined): {
  email?: string
  phone?: string
} {
  const profile = user?.profile
  if (!profile || typeof profile !== "object") return {}

  const pick = (keys: string[]) => {
    for (const key of keys) {
      const value = (profile as Record<string, unknown>)[key]
      if (typeof value === "string" && value.trim()) return value.trim()
    }
    return undefined
  }

  return {
    email: pick(["email", "Email", "e-mail"]),
    phone: pick(["mobileNumber", "phone", "phoneNumber", "mobile"]),
  }
}
