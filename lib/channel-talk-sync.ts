/**
 * 채널톡 Open API → 로컬 상담 저장소 동기화 + CRM 리드 매칭 + 알림.
 *
 * 키가 없으면 configured:false로 안전하게 건너뛴다(기존 graceful fallback 패턴).
 * 크론(app/api/cron/channel-talk-sync)과 어드민 수동 동기화에서 호출한다.
 */

import "server-only"

import {
  extractUserContact,
  isChannelApiConfigured,
  listUserChatMessages,
  listUserChats,
  type ChannelMessage,
  type ChannelUser,
  type ChannelUserChat,
} from "@/lib/channel-talk-api"
import { redactPii } from "@/lib/chatbot/service"
import { normalizeTopicTags } from "@/lib/chatbot/topic-crosswalk"
import { emitNotificationEvent } from "@/lib/notifications/emit-event"
import {
  buildConversationChunkInputs,
  getDurableConversationsByIds,
  getDurableConversationSyncMeta,
  replaceConversationChunks,
  upsertDurableConversations,
  type ChannelConversationAuthor,
  type ChannelConversationMessage,
  type ChannelConversationRecord,
  type ChannelConversationState,
} from "@/lib/repositories/channel-conversations"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"

const DEFAULT_SYNC_LIMIT = 25
// 최근 메시지부터 최대 200개를 페이지로 가져온다. 그 이상이면 partial warning으로 표면화한다.
const MESSAGES_PER_CHAT = 200
const CHANNEL_API_PAGE_SIZE = 50
const ATTACHMENT_PLACEHOLDERS = new Set([
  "[이미지 첨부]",
  "[파일 첨부]",
  "[이미지 첨부] [파일 첨부]",
])
const DEFAULT_RECENT_SYNC_TTL_MS = 2 * 60_000
const ACTIVE_SYNC_STALE_MS = 10 * 60_000
let activeSync:
  | { promise: Promise<ChannelSyncResult>; startedAt: number }
  | null = null

function normalizePhone(value?: string): string | undefined {
  if (!value) return undefined
  const digits = value.replace(/\D/g, "")
  return digits.length >= 9 ? digits : undefined
}

function toState(state?: string): ChannelConversationState {
  if (state === "opened" || state === "closed" || state === "snoozed") return state
  return "unknown"
}

function toIso(ms?: number): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined
  return new Date(ms).toISOString()
}

function authorOf(message: ChannelMessage): ChannelConversationAuthor {
  if (message.personType === "user") return "customer"
  if (message.personType === "bot") return "bot"
  return "agent"
}

function safeMessageText(message: ChannelMessage): string {
  const plainText = typeof message.plainText === "string" ? message.plainText.trim() : ""
  if (plainText) return plainText

  const files = Array.isArray(message.files) ? message.files : []
  const hasImage = files.some(
    (file) => file?.type === "image" || file?.contentType?.toLowerCase().startsWith("image/")
  )
  const hasFile = files.some(
    (file) => file?.type !== "image" && !file?.contentType?.toLowerCase().startsWith("image/")
  )

  // 파일 URL·버킷·스토리지 키·파일명은 transcript/청크로 전달하지 않는다.
  if (hasImage && hasFile) return "[이미지 첨부] [파일 첨부]"
  if (hasImage) return "[이미지 첨부]"
  if (hasFile) return "[파일 첨부]"
  return ""
}

function chatActivityAt(chat: ChannelUserChat): number {
  return Math.max(chat.closedAt ?? 0, chat.openedAt ?? 0, chat.createdAt ?? 0)
}

async function fetchRecentUserChats(limit: number, state?: string): Promise<{
  chats: ChannelUserChat[]
  users: ChannelUser[]
  partial: boolean
  warnings: string[]
}> {
  // Channel API의 state 미지정 기본 동작에 기대지 않는다. 열린 상담과 종료 상담을 각각
  // 최신순으로 가져온 뒤 전체 limit(페이지별 limit이 아님) 안에서 합치고 id 중복을 제거한다.
  const states = state ? [state] : ["opened", "closed"]
  const results = await Promise.all(
    states.map((targetState) =>
      listUserChats({
        state: targetState,
        limit,
        pageSize: CHANNEL_API_PAGE_SIZE,
        sortOrder: "desc",
      })
    )
  )

  const chatsById = new Map<string, ChannelUserChat>()
  const usersById = new Map<string, ChannelUser>()
  const warnings: string[] = []

  results.forEach((result, index) => {
    for (const chat of result.userChats) {
      const existing = chatsById.get(chat.id)
      if (!existing || chatActivityAt(chat) > chatActivityAt(existing)) chatsById.set(chat.id, chat)
    }
    for (const user of result.users) usersById.set(user.id, user)
    if (result.complete === false || result.next) {
      warnings.push(`채널톡 ${states[index]} 상담이 조회 한도에 도달해 일부만 동기화되었습니다.`)
    }
  })

  return {
    chats: [...chatsById.values()]
      .sort((left, right) => chatActivityAt(right) - chatActivityAt(left) || left.id.localeCompare(right.id))
      .slice(0, limit),
    users: [...usersById.values()],
    partial: warnings.length > 0,
    warnings,
  }
}

interface LeadMatchIndex {
  byEmail: Map<string, LeadRecord>
  byPhone: Map<string, LeadRecord>
}

function buildLeadIndex(leads: LeadRecord[]): LeadMatchIndex {
  const byEmail = new Map<string, LeadRecord>()
  const byPhone = new Map<string, LeadRecord>()
  for (const lead of leads) {
    if (lead.email) byEmail.set(lead.email.toLowerCase(), lead)
    const phone = normalizePhone(lead.phone)
    if (phone) byPhone.set(phone, lead)
  }
  return { byEmail, byPhone }
}

function matchLead(index: LeadMatchIndex, email?: string, phone?: string): LeadRecord | undefined {
  if (email) {
    const found = index.byEmail.get(email.toLowerCase())
    if (found) return found
  }
  const normalized = normalizePhone(phone)
  if (normalized) {
    const found = index.byPhone.get(normalized)
    if (found) return found
  }
  return undefined
}

export interface ChannelSyncResult {
  ok: boolean
  configured: boolean
  cached?: boolean
  locked?: boolean
  fetchedChats: number
  upserted: number
  newConversations: number
  matchedLeads: number
  lastSyncedAt?: string | null
  messageFetches?: number
  reusedTranscripts?: number
  chunksRewritten?: number
  /** API 페이지/대화 일부가 조회 한도 또는 부분 실패로 빠졌는지 여부. */
  partial?: boolean
  // 재시도까지 실패한 청크 재생성 대화 수 — best-effort 계약이라 ok 는 유지되고, 운영자는 이 값으로 감지한다.
  chunkFailures?: number
  warning?: string
  // 대화 단위 부분 실패 경고(해당 대화 id 포함). warning(전역 상태 안내)과 별개로 집계형 경고를 담는다.
  warnings?: string[]
}

export async function syncChannelConversations(
  options: { force?: boolean; limit?: number; recentSyncTtlMs?: number; state?: string } = {}
): Promise<ChannelSyncResult> {
  if (activeSync && Date.now() - activeSync.startedAt < ACTIVE_SYNC_STALE_MS) {
    const meta = await getDurableConversationSyncMeta()
    return {
      ok: true,
      configured: true,
      cached: true,
      locked: true,
      fetchedChats: 0,
      upserted: 0,
      newConversations: 0,
      matchedLeads: meta.matchedLeads,
      lastSyncedAt: meta.lastSyncedAt,
      messageFetches: 0,
      reusedTranscripts: 0,
      warning: "이미 채널톡 동기화가 진행 중입니다. 완료 후 최신 상담 목록을 다시 확인하세요.",
    }
  }

  const promise = runChannelConversationSync(options)
  activeSync = { promise, startedAt: Date.now() }

  try {
    return await promise
  } finally {
    if (activeSync?.promise === promise) activeSync = null
  }
}

async function runChannelConversationSync(
  options: { force?: boolean; limit?: number; recentSyncTtlMs?: number; state?: string } = {}
): Promise<ChannelSyncResult> {
  if (!isChannelApiConfigured()) {
    return {
      ok: false,
      configured: false,
      fetchedChats: 0,
      upserted: 0,
      newConversations: 0,
      matchedLeads: 0,
      warning:
        "채널톡 Open API 키가 없어 동기화를 건너뜁니다 (CHANNEL_TALK_ACCESS / CHANNEL_TALK_ACCESS_SECRET).",
    }
  }

  const meta = await getDurableConversationSyncMeta()
  const lastSyncedAt = meta.lastSyncedAt
  const recentSyncTtlMs = options.recentSyncTtlMs ?? DEFAULT_RECENT_SYNC_TTL_MS
  if (!options.force && lastSyncedAt && recentSyncTtlMs > 0) {
    const lastSyncedMs = new Date(lastSyncedAt).getTime()
    if (Number.isFinite(lastSyncedMs) && Date.now() - lastSyncedMs < recentSyncTtlMs) {
      return {
        ok: true,
        configured: true,
        cached: true,
        fetchedChats: 0,
        upserted: 0,
        newConversations: 0,
        matchedLeads: meta.matchedLeads,
        lastSyncedAt,
        messageFetches: 0,
        reusedTranscripts: 0,
        warning: "최근 동기화 결과를 사용했습니다. 잠시 후 다시 시도하거나 강제 동기화로 갱신하세요.",
      }
    }
  }

  const limit = options.limit ?? DEFAULT_SYNC_LIMIT

  let chats: ChannelUserChat[]
  let users: ChannelUser[]
  let partial = false
  const syncWarnings: string[] = []
  try {
    const list = await fetchRecentUserChats(limit, options.state)
    chats = list.chats
    users = list.users
    partial = list.partial
    syncWarnings.push(...list.warnings)
  } catch (error) {
    return {
      ok: false,
      configured: true,
      fetchedChats: 0,
      upserted: 0,
      newConversations: 0,
      matchedLeads: 0,
      warning: error instanceof Error ? error.message : "상담 목록 조회 실패",
    }
  }

  const userById = new Map(users.map((user) => [user.id, user]))

  // 리드 인덱스(매칭용) — 실패해도 동기화는 계속한다.
  let leadIndex: LeadMatchIndex = { byEmail: new Map(), byPhone: new Map() }
  try {
    leadIndex = buildLeadIndex(await getLeads())
  } catch {
    // 리드 조회 실패 시 매칭 없이 진행
  }

  // 기존 상담을 한 번에 조회(Supabase 우선, JSON 폴백) — 트랜스크립트 재사용 + 신규 판별에 쓴다.
  const existingById = await getDurableConversationsByIds(chats.map((chat) => chat.id))

  const syncedAt = new Date().toISOString()
  const records: ChannelConversationRecord[] = []
  // frontMessageId 가 바뀐(=트랜스크립트를 새로 받은) 대화만 청크를 재생성한다(계약 4).
  const chunkRegenTargets: { id: string; transcript: ChannelConversationMessage[]; tags: string[] }[] = []
  let matchedLeads = 0
  let messageFetches = 0
  let reusedTranscripts = 0

  for (const chat of chats) {
    const existing = existingById.get(chat.id)
    const lastTranscriptMessageId = existing?.transcript.at(-1)?.id
    const canReuseTranscript =
      Boolean(existing?.transcript.length) &&
      Boolean(chat.frontMessageId) &&
      chat.frontMessageId === lastTranscriptMessageId

    let transcript: ChannelConversationMessage[] = []
    let transcriptRefreshed = false
    if (canReuseTranscript && existing) {
      transcript = existing.transcript
      reusedTranscripts += 1
    } else {
      let messages: ChannelMessage[] = []
      try {
        const messageResult = await listUserChatMessages(chat.id, {
          limit: MESSAGES_PER_CHAT,
          pageSize: CHANNEL_API_PAGE_SIZE,
          // 긴 상담에서도 최종 진단·조치와 frontMessageId를 우선 보존한다.
          sortOrder: "desc",
        })
        messages = [...messageResult.messages].sort(
          (left, right) =>
            (left.createdAt ?? 0) - (right.createdAt ?? 0) || left.id.localeCompare(right.id)
        )
        messageFetches += 1
        if (messageResult.complete === false || messageResult.next) {
          partial = true
          syncWarnings.push(`상담 메시지가 조회 한도에 도달해 일부만 동기화되었습니다: ${chat.id}`)
        }
      } catch {
        // 개별 대화 메시지 실패는 건너뛰고 기존 transcript가 있으면 재사용한다.
        transcript = existing?.transcript ?? []
        partial = true
        syncWarnings.push(`상담 메시지 조회 실패로 기존 내용을 유지했습니다: ${chat.id}`)
      }

      if (messages.length > 0) {
        transcript = messages
          .map((message) => ({ message, text: safeMessageText(message) }))
          .filter(({ text }) => Boolean(text))
          .map(({ message, text }) => ({
            id: message.id,
            author: authorOf(message),
            text,
            at: toIso(message.createdAt) ?? syncedAt,
          }))
        transcriptRefreshed = true
      }
    }

    if (transcriptRefreshed && transcript.length > 0) {
      chunkRegenTargets.push({ id: chat.id, transcript, tags: Array.isArray(chat.tags) ? chat.tags : [] })
    }

    const user = chat.userId ? userById.get(chat.userId) : undefined
    const contact = extractUserContact(user)
    const matched = matchLead(leadIndex, contact.email, contact.phone)
    if (matched) matchedLeads += 1

    const firstCustomer = transcript.find((message) => message.author === "customer")
    const last = transcript[transcript.length - 1]

    records.push({
      id: chat.id,
      userChatId: chat.id,
      channelUserId: chat.userId,
      name: chat.name ?? user?.name,
      email: contact.email,
      phone: contact.phone,
      state: toState(chat.state),
      tags: Array.isArray(chat.tags) ? chat.tags : [],
      messageCount: transcript.length,
      firstQuestion: firstCustomer?.text,
      firstAskedAt: firstCustomer?.at ?? toIso(chat.createdAt),
      lastMessageText: last?.text,
      lastMessageAt: last?.at ?? toIso(chat.openedAt) ?? toIso(chat.createdAt),
      matchedLeadId: matched?.id,
      matchedLeadOrg: matched?.org,
      syncedAt,
      transcript,
    })
  }

  // 신규 대화는 사전 조회한 기존 맵에 없던 id — Supabase/JSON 모드 무관하게 동일하게 판별한다.
  const created = records.filter((record) => !existingById.has(record.id)).map((record) => record.id)

  let upserted = 0
  try {
    const result = await upsertDurableConversations(records)
    upserted = result.upserted
  } catch (error) {
    // Supabase 실패 후 JSON 폴백이 운영 FS(Vercel)에서 던지는 경우 등 — 무음 유실 대신 경고로 표면화한다.
    return {
      ok: false,
      configured: true,
      fetchedChats: chats.length,
      upserted: 0,
      newConversations: 0,
      matchedLeads,
      lastSyncedAt: meta.lastSyncedAt,
      messageFetches,
      reusedTranscripts,
      warning: error instanceof Error ? error.message : "상담 저장 실패",
    }
  }

  // 트랜스크립트가 바뀐 대화만 청크를 재생성한다. 부모(conversations) upsert 이후에 수행해야 FK 가 성립한다.
  // 대화 단위 best-effort — 한 건 실패가 전체 동기화를 막지 않는다. embedding 은 null → 백필 스크립트가 채운다.
  // replaceConversationChunks 는 delete→insert 비원자라 transient 실패 시 청크가 빈 채 남을 수 있어
  // 즉시 1회 재시도하고, 재시도도 실패하면 chunkFailures/warnings 로 표면화한다(콘솔 로그만으로는 운영자가 못 본다).
  let chunksRewritten = 0
  let chunkFailures = 0
  const chunkWarnings: string[] = []
  for (const target of chunkRegenTargets) {
    try {
      // 대화 태그 → ChatbotCategory 정규화(topic-crosswalk). 검색 시 주제 필터/배지 근거가 된다.
      // 첨부 존재는 transcript 시각 정합용일 뿐 원인 확정 근거가 아니다. 벡터 검색 청크에는 넣지 않는다.
      const searchableTranscript = target.transcript.filter(
        (message) => !ATTACHMENT_PLACEHOLDERS.has(message.text)
      )
      const chunks = buildConversationChunkInputs(
        searchableTranscript,
        redactPii,
        normalizeTopicTags(target.tags)
      )
      try {
        await replaceConversationChunks(target.id, chunks)
      } catch {
        await replaceConversationChunks(target.id, chunks)
      }
      chunksRewritten += chunks.length
    } catch (error) {
      chunkFailures += 1
      partial = true
      chunkWarnings.push(`상담 청크 재생성 실패(재시도 포함): ${target.id}`)
      console.error("[channel-talk-sync] 상담 청크 재생성 실패(재시도 포함):", target.id, error)
    }
  }

  if (created.length > 0) {
    void emitNotificationEvent({
      eventType: "channel_talk.synced",
      notificationType: "status_update",
      categoryTag: "lead",
      severity: "info",
      scopeTag: "org_admin",
      title: `새 채널톡 상담 ${created.length}건`,
      message: `채널톡에서 새 상담 ${created.length}건을 동기화했습니다. CRM 매칭 ${matchedLeads}건.`,
      routeUrl: "/admin/channel-talk",
      source: "channel_talk",
      payload: { created: created.length, matchedLeads, fetchedChats: chats.length },
      channels: ["wecom_cs_webhook"],
    }).catch((error) => {
      console.error("[channel-talk-sync] notification emit failed:", error)
    })
  }

  return {
    ok: true,
    configured: true,
    fetchedChats: chats.length,
    upserted,
    newConversations: created.length,
    matchedLeads,
    lastSyncedAt: syncedAt,
    messageFetches,
    reusedTranscripts,
    chunksRewritten,
    chunkFailures,
    partial,
    ...(syncWarnings.length + chunkWarnings.length > 0
      ? { warnings: [...syncWarnings, ...chunkWarnings] }
      : {}),
  }
}
