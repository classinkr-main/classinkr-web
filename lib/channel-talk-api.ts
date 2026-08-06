/**
 * 채널톡 Open API 클라이언트 (server-only).
 *
 * 인증: CHANNEL_TALK_ACCESS / CHANNEL_TALK_ACCESS_SECRET (채널톡 설정 > 보안 > API).
 * 위젯용 NEXT_PUBLIC_CHANNEL_PLUGIN_KEY 와는 별개의 키다.
 * 미설정 시 isChannelApiConfigured()가 false를 반환하며, 호출은 ChannelApiError를 던진다.
 *
 * 주의: 응답 필드는 계정 API 버전에 따라 달라질 수 있어 방어적으로 파싱한다.
 * 실제 키로 한 번 검증한 뒤 필드 매핑을 확정할 것.
 */

import "server-only"

const API_BASE = "https://api.channel.io/open/v5"
const REQUEST_TIMEOUT_MS = 15_000
const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const DEFAULT_MAX_PAGES = 10
const MAX_TOTAL_ITEMS = 1_000

export class ChannelApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ChannelApiError"
    this.status = status
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function getCredentials() {
  const accessKey = firstNonEmpty(process.env.CHANNEL_TALK_ACCESS, process.env.CHANNEL_ACCESS_KEY)
  const accessSecret = firstNonEmpty(
    process.env.CHANNEL_TALK_ACCESS_SECRET,
    process.env.CHANNEL_ACCESS_SECRET
  )
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
      "채널톡 Open API 키가 설정되지 않았습니다 (CHANNEL_TALK_ACCESS / CHANNEL_TALK_ACCESS_SECRET).",
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
  memberId?: string
  name?: string
  profile?: Record<string, unknown> | null
  tags?: string[]
}

export interface ChannelMessage {
  id: string
  chatId?: string
  personType?: string
  personId?: string
  plainText?: string
  createdAt?: number
  files?: ChannelMessageFile[]
}

export interface ChannelMessageFile {
  type?: string
  contentType?: string
}

export interface ListUserChatsResult {
  userChats: ChannelUserChat[]
  users: ChannelUser[]
  next?: string
  pagesFetched?: number
  complete?: boolean
}

export interface ListUserChatMessagesResult {
  messages: ChannelMessage[]
  next?: string
  pagesFetched: number
  complete: boolean
}

export interface UpsertChannelUserInput {
  memberId: string
  profile?: Record<string, unknown>
  profileOnce?: Record<string, unknown>
  tags?: string[]
  unsubscribeEmail?: boolean
  unsubscribeTexting?: boolean
}

export interface CreateUserChatResult {
  userChat: ChannelUserChat
}

/* ─── 엔드포인트 ─── */

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

async function listUserChatsPage(options: {
  state?: string
  limit: number
  since?: string
  sortOrder: "asc" | "desc"
}) {
  return channelApiFetch<{
    userChats?: ChannelUserChat[]
    users?: ChannelUser[]
    next?: string
  }>("/user-chats", {
    query: options,
  })
}

export async function listUserChats(
  options: {
    state?: string
    /** 모든 페이지를 합친 최대 고유 상담 수. 페이지당 개수가 아니다. */
    limit?: number
    since?: string
    sortOrder?: "asc" | "desc"
    pageSize?: number
    maxPages?: number
  } = {}
): Promise<ListUserChatsResult> {
  const totalLimit = boundedInteger(options.limit, 25, 1, MAX_TOTAL_ITEMS)
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, 1, DEFAULT_MAX_PAGES)
  const sortOrder = options.sortOrder ?? "desc"
  const chatsById = new Map<string, ChannelUserChat>()
  const usersById = new Map<string, ChannelUser>()
  const seenCursors = new Set<string>()
  let cursor = options.since
  let next: string | undefined
  let pagesFetched = 0

  while (pagesFetched < maxPages && chatsById.size < totalLimit) {
    const remaining = totalLimit - chatsById.size
    const data = await listUserChatsPage({
      state: options.state,
      limit: Math.min(pageSize, remaining),
      since: cursor,
      sortOrder,
    })
    pagesFetched += 1

    for (const chat of data.userChats ?? []) {
      if (chat?.id && !chatsById.has(chat.id)) chatsById.set(chat.id, chat)
    }
    for (const user of data.users ?? []) {
      if (user?.id) usersById.set(user.id, user)
    }

    next = typeof data.next === "string" && data.next.trim() ? data.next : undefined
    if (!next || seenCursors.has(next)) break
    seenCursors.add(next)
    cursor = next
  }

  return {
    userChats: [...chatsById.values()].slice(0, totalLimit),
    users: [...usersById.values()],
    next,
    pagesFetched,
    complete: !next,
  }
}

async function getUserChatMessagesPage(
  userChatId: string,
  options: { limit: number; sortOrder: "asc" | "desc"; since?: string }
) {
  return channelApiFetch<{ messages?: ChannelMessage[]; next?: string }>(
    `/user-chats/${encodeURIComponent(userChatId)}/messages`,
    {
      query: {
        limit: options.limit,
        sortOrder: options.sortOrder,
        since: options.since,
      },
    }
  )
}

/**
 * 메시지 페이지를 bounded하게 합친다. limit은 모든 페이지를 합친 최대 고유 메시지 수다.
 * complete=false/next는 제한 또는 반복 cursor 때문에 후속 메시지가 남았음을 호출자에게 알린다.
 */
export async function listUserChatMessages(
  userChatId: string,
  options: {
    limit?: number
    sortOrder?: "asc" | "desc"
    since?: string
    pageSize?: number
    maxPages?: number
  } = {}
): Promise<ListUserChatMessagesResult> {
  const totalLimit = boundedInteger(options.limit, 50, 1, MAX_TOTAL_ITEMS)
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
  const maxPages = boundedInteger(options.maxPages, DEFAULT_MAX_PAGES, 1, DEFAULT_MAX_PAGES)
  const sortOrder = options.sortOrder ?? "asc"
  const messagesById = new Map<string, ChannelMessage>()
  const seenCursors = new Set<string>()
  let cursor = options.since
  let next: string | undefined
  let pagesFetched = 0

  while (pagesFetched < maxPages && messagesById.size < totalLimit) {
    const remaining = totalLimit - messagesById.size
    const data = await getUserChatMessagesPage(userChatId, {
      limit: Math.min(pageSize, remaining),
      sortOrder,
      since: cursor,
    })
    pagesFetched += 1

    for (const message of data.messages ?? []) {
      if (message?.id && !messagesById.has(message.id)) messagesById.set(message.id, message)
    }

    next = typeof data.next === "string" && data.next.trim() ? data.next : undefined
    if (!next || seenCursors.has(next)) break
    seenCursors.add(next)
    cursor = next
  }

  return {
    messages: [...messagesById.values()].slice(0, totalLimit),
    next,
    pagesFetched,
    complete: !next,
  }
}

/** 기존 배열 반환 계약. 페이지 상태가 필요한 동기화는 listUserChatMessages를 사용한다. */
export async function getUserChatMessages(
  userChatId: string,
  options: {
    limit?: number
    sortOrder?: "asc" | "desc"
    since?: string
    pageSize?: number
    maxPages?: number
  } = {}
): Promise<ChannelMessage[]> {
  const result = await listUserChatMessages(userChatId, options)

  return result.messages
}

/** memberId 기준으로 채널톡 User를 생성/갱신한다. */
export async function upsertChannelUserByMemberId(input: UpsertChannelUserInput): Promise<ChannelUser> {
  const body: Record<string, unknown> = {}
  if (input.profile && Object.keys(input.profile).length > 0) body.profile = input.profile
  if (input.profileOnce && Object.keys(input.profileOnce).length > 0) body.profileOnce = input.profileOnce
  if (input.tags && input.tags.length > 0) body.tags = input.tags
  if (typeof input.unsubscribeEmail === "boolean") body.unsubscribeEmail = input.unsubscribeEmail
  if (typeof input.unsubscribeTexting === "boolean") body.unsubscribeTexting = input.unsubscribeTexting

  const data = await channelApiFetch<{ user?: ChannelUser }>(
    `/users/@${encodeURIComponent(input.memberId)}`,
    {
      method: "PUT",
      body,
    }
  )

  if (!data.user?.id) {
    throw new ChannelApiError("채널톡 User upsert 응답에 user.id가 없습니다.", 0)
  }

  return data.user
}

/** 특정 User에 새 UserChat을 생성한다. */
export async function createUserChat(userId: string): Promise<ChannelUserChat> {
  const data = await channelApiFetch<CreateUserChatResult>(
    `/users/${encodeURIComponent(userId)}/user-chats`,
    { method: "POST" }
  )

  if (!data.userChat?.id) {
    throw new ChannelApiError("채널톡 UserChat 생성 응답에 userChat.id가 없습니다.", 0)
  }

  return data.userChat
}

/** 봇 명의로 상담 대화에 메시지를 남긴다(예: 챗봇 컨텍스트 인계). */
export async function writeUserChatMessage(
  userChatId: string,
  text: string,
  botName = "Classin Bot"
): Promise<ChannelMessage | null> {
  const data = await channelApiFetch<{ message?: ChannelMessage }>(
    `/user-chats/${encodeURIComponent(userChatId)}/messages`,
    {
      method: "POST",
      query: { botName },
      body: { blocks: [{ type: "text", value: text }] },
    }
  )

  return data.message ?? null
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
