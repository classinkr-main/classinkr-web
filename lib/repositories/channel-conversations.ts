/**
 * 채널톡 상담 대화 저장소 — 듀얼모드(Supabase 우선 ↔ JSON 폴백).
 *
 * 기존 동기(sync) export 시그니처(getConversations/getConversationStats 등)는 외부 소비자
 * (admin channel-talk API, lead-digest-alerts, channel-talk-mining) 호환을 위해 JSON 기반으로 그대로 둔다.
 * 영속(Supabase) 경로는 신규 async 함수(*Durable*, replaceConversationChunks)로 제공하며,
 * Supabase 미설정/실패 시 기존 JSON 폴백으로 떨어진다(계약 4).
 * 운영 FS(Vercel)는 인스턴스 간 JSON을 영속하지 못하므로 실제 영속은 Supabase 경로가 담당한다.
 */

import "server-only"

import fs from "fs"
import path from "path"

import { atomicWriteJsonSync } from "@/lib/atomic-write"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { assertLocalJsonWriteAllowed } from "@/lib/server/runtime-persistence"

const DATA_DIR = path.join(process.cwd(), "data")
const TRACKED_FILE = "channel-conversations.json"
const LOCAL_DEV_FILE = "channel-conversations.local.json"

function getDataFile() {
  const configured = process.env.CHANNEL_TALK_CONVERSATIONS_FILE?.trim()
  if (configured) return configured
  return process.env.NODE_ENV === "development" ? LOCAL_DEV_FILE : TRACKED_FILE
}

function getDataPath() {
  return path.join(DATA_DIR, getDataFile())
}

export type ChannelConversationAuthor = "customer" | "agent" | "bot"
export type ChannelConversationState = "opened" | "closed" | "snoozed" | "unknown"

export interface ChannelConversationMessage {
  id: string
  author: ChannelConversationAuthor
  text: string
  at: string
}

export interface ChannelConversationRecord {
  /** 우리 측 id == 채널톡 userChatId */
  id: string
  userChatId: string
  channelUserId?: string
  name?: string
  email?: string
  phone?: string
  state: ChannelConversationState
  tags: string[]
  messageCount: number
  firstQuestion?: string
  firstAskedAt?: string
  lastMessageText?: string
  lastMessageAt?: string
  /** CRM 리드 매칭 결과 */
  matchedLeadId?: string
  matchedLeadOrg?: string
  syncedAt: string
  transcript: ChannelConversationMessage[]
}

function readAll(): ChannelConversationRecord[] {
  const target = getDataPath()
  try {
    if (!fs.existsSync(target)) return []
    const parsed = JSON.parse(fs.readFileSync(target, "utf8"))
    return Array.isArray(parsed) ? (parsed as ChannelConversationRecord[]) : []
  } catch {
    return []
  }
}

function writeAll(records: ChannelConversationRecord[]) {
  assertLocalJsonWriteAllowed("channel-conversations")
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  atomicWriteJsonSync(getDataPath(), records)
}

export function getConversations(): ChannelConversationRecord[] {
  return readAll().sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
}

export function getConversation(id: string): ChannelConversationRecord | null {
  return readAll().find((record) => record.id === id) ?? null
}

/**
 * id 기준 upsert. 반환값으로 신규 생성된 레코드 id 목록을 알려준다(알림용).
 */
export function upsertConversations(incoming: ChannelConversationRecord[]): {
  upserted: number
  created: string[]
} {
  if (incoming.length === 0) return { upserted: 0, created: [] }

  const existing = readAll()
  const byId = new Map(existing.map((record) => [record.id, record]))
  const created: string[] = []

  for (const record of incoming) {
    if (!byId.has(record.id)) created.push(record.id)
    byId.set(record.id, record)
  }

  writeAll([...byId.values()])
  return { upserted: incoming.length, created }
}

export function updateConversation(
  id: string,
  patch: Partial<ChannelConversationRecord>
): ChannelConversationRecord | null {
  const records = readAll()
  const index = records.findIndex((record) => record.id === id)
  if (index === -1) return null

  records[index] = { ...records[index], ...patch, id }
  writeAll(records)
  return records[index]
}

export interface ChannelConversationStats {
  total: number
  byState: Record<ChannelConversationState, number>
  matchedLeads: number
  unmatched: number
  last7Days: number
}

export function getConversationStats(): ChannelConversationStats {
  const records = readAll()
  const byState: Record<ChannelConversationState, number> = {
    opened: 0,
    closed: 0,
    snoozed: 0,
    unknown: 0,
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let matchedLeads = 0
  let last7Days = 0

  for (const record of records) {
    byState[record.state] = (byState[record.state] ?? 0) + 1
    if (record.matchedLeadId) matchedLeads += 1
    if (record.lastMessageAt && new Date(record.lastMessageAt).getTime() >= weekAgo) {
      last7Days += 1
    }
  }

  return {
    total: records.length,
    byState,
    matchedLeads,
    unmatched: records.length - matchedLeads,
    last7Days,
  }
}

export function getLastConversationSyncAt(): string | null {
  let latestMs = 0

  for (const record of readAll()) {
    const syncedMs = record.syncedAt ? new Date(record.syncedAt).getTime() : 0
    if (Number.isFinite(syncedMs) && syncedMs > latestMs) latestMs = syncedMs
  }

  return latestMs > 0 ? new Date(latestMs).toISOString() : null
}

/* ─────────────────────────────────────────────────────────────
 * Supabase 듀얼모드 (계약 1·2·3·4) — 영속 경로
 * ───────────────────────────────────────────────────────────── */

/**
 * 채널톡 상담을 Supabase 로 읽고/쓸 수 있는지 여부.
 * lib/chatbot/service.ts hasSupabaseServerEnv 와 동일 기준(어드민 클라이언트 생성 요건과 일치)이라
 * true 이면 createSupabaseAdminClient() 가 던지지 않는다.
 */
export function channelConversationsSupabaseEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() &&
      (env.SUPABASE_SECRET_KEY?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim())
  )
}

interface SupabaseChannelConversationRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  state: string | null
  tags: string[] | null
  first_question: string | null
  matched_lead_id: string | null
  matched_org: string | null
  last_message_at: string | null
  transcript: unknown
  synced_at: string | null
}

function toRecordState(value: string | null | undefined): ChannelConversationState {
  if (value === "opened" || value === "closed" || value === "snoozed") return value
  return "unknown"
}

function toTranscript(value: unknown): ChannelConversationMessage[] {
  return Array.isArray(value) ? (value as ChannelConversationMessage[]) : []
}

function supabaseRowToRecord(row: SupabaseChannelConversationRow): ChannelConversationRecord {
  const transcript = toTranscript(row.transcript)
  const firstCustomer = transcript.find((message) => message.author === "customer")
  const last = transcript[transcript.length - 1]

  return {
    id: row.id,
    userChatId: row.id,
    // channelUserId 는 계약 1 스키마에 없어 재구성 불가(소비자 미사용).
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    state: toRecordState(row.state),
    tags: Array.isArray(row.tags) ? row.tags : [],
    messageCount: transcript.length,
    firstQuestion: row.first_question ?? undefined,
    firstAskedAt: firstCustomer?.at,
    lastMessageText: last?.text,
    lastMessageAt: row.last_message_at ?? undefined,
    matchedLeadId: row.matched_lead_id ?? undefined,
    matchedLeadOrg: row.matched_org ?? undefined,
    syncedAt: row.synced_at ?? new Date(0).toISOString(),
    transcript,
  }
}

function recordToSupabaseRow(record: ChannelConversationRecord) {
  return {
    id: record.id,
    name: record.name ?? null,
    email: record.email ?? null,
    phone: record.phone ?? null,
    state: record.state,
    tags: record.tags ?? [],
    first_question: record.firstQuestion ?? null,
    matched_lead_id: record.matchedLeadId ?? null,
    matched_org: record.matchedLeadOrg ?? null,
    last_message_at: record.lastMessageAt ?? null,
    transcript: record.transcript ?? [],
    synced_at: record.syncedAt,
  }
}

export interface ChannelConversationChunkInput {
  seq: number
  content: string
  category: string | null
}

const CHUNK_ROLE_LABEL: Record<"customer" | "agent", string> = {
  customer: "고객",
  agent: "상담원",
}

/**
 * 트랜스크립트를 고객/상담원 턴 단위로 청킹한다(계약 2·4).
 * - 연속된 동일 화자 메시지는 하나의 턴으로 묶는다.
 * - 봇(메뉴/라우팅) 턴은 제외한다.
 * - content 는 redact(주입) 통과본만 담는다 — 원문 PII 저장 금지.
 * redact 를 주입받아 순수 함수로 유지한다(테스트에서 stub 주입).
 */
export function buildConversationChunkInputs(
  transcript: ChannelConversationMessage[],
  redact: (value: string) => string,
  // 대화 태그를 topic-crosswalk 로 정규화한 결과(대화 단위 단일 값). 호출부(sync)가 계산해 주입한다.
  category: string | null = null
): ChannelConversationChunkInput[] {
  const chunks: ChannelConversationChunkInput[] = []
  let seq = 0
  let index = 0

  while (index < transcript.length) {
    const author = transcript[index].author
    if (author !== "customer" && author !== "agent") {
      index += 1
      continue
    }

    const parts: string[] = []
    while (index < transcript.length && transcript[index].author === author) {
      const text = transcript[index].text?.trim()
      if (text) parts.push(text)
      index += 1
    }

    if (parts.length === 0) continue
    const redacted = redact(parts.join(" ")).replace(/\s+/g, " ").trim()
    if (!redacted) continue

    chunks.push({
      seq: seq++,
      content: `${CHUNK_ROLE_LABEL[author]}: ${redacted}`,
      category,
    })
  }

  return chunks
}

/**
 * 주어진 id 들의 기존 상담 레코드를 조회한다(Supabase 우선, 미설정/실패 시 JSON 폴백).
 * sync 의 트랜스크립트 재사용 판단 + 신규 대화 판별에 쓴다.
 */
export async function getDurableConversationsByIds(
  ids: string[]
): Promise<Map<string, ChannelConversationRecord>> {
  const result = new Map<string, ChannelConversationRecord>()
  if (ids.length === 0) return result

  if (channelConversationsSupabaseEnabled()) {
    try {
      const supabase = createSupabaseAdminClient()
      const { data, error } = await supabase
        .from("channel_conversations")
        .select("*")
        .in("id", ids)
      if (error) throw new Error(error.message)
      for (const row of (data ?? []) as SupabaseChannelConversationRow[]) {
        result.set(row.id, supabaseRowToRecord(row))
      }
      return result
    } catch (error) {
      console.warn(
        "[channel-conversations] Supabase 조회 실패, JSON 폴백:",
        error instanceof Error ? error.message : error
      )
    }
  }

  const idSet = new Set(ids)
  for (const record of getConversations()) {
    if (idSet.has(record.id)) result.set(record.id, record)
  }
  return result
}

export interface ChannelConversationSyncMeta {
  lastSyncedAt: string | null
  matchedLeads: number
  total: number
}

/**
 * TTL 판단 + locked/cached 조기 반환에 쓰는 경량 메타(Supabase 우선, 미설정/실패 시 JSON 폴백).
 * transcript(무거운 jsonb)는 제외하고 synced_at/matched_lead_id 만 스캔한다.
 */
/**
 * 어드민 탭 읽기 경로 — durable(Supabase) 목록을 최신 응답 순으로 읽는다.
 * 미설정/실패 시 null 을 돌려 호출자(라우트)가 레거시 JSON 으로 폴백하게 한다(무음 빈 배열 금지).
 */
export async function listDurableConversations(
  limit = 500
): Promise<ChannelConversationRecord[] | null> {
  if (!channelConversationsSupabaseEnabled()) return null

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("channel_conversations")
      .select(
        "id, name, email, phone, state, tags, first_question, matched_lead_id, matched_org, last_message_at, transcript, synced_at"
      )
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit)
    if (error) throw new Error(error.message)

    return ((data ?? []) as SupabaseChannelConversationRow[]).map(supabaseRowToRecord)
  } catch (error) {
    console.warn(
      "[channel-conversations] Supabase 목록 조회 실패, JSON 폴백:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}

/**
 * 목록 전용(transcript 미포함) 레코드 — 상세/sync 경로(ChannelConversationRecord)와 달리
 * 상담 전문을 담지 않는다. app/api/admin/channel-talk/route.ts 전용.
 */
export type ChannelConversationListRecord = Omit<ChannelConversationRecord, "transcript">

const LIST_LITE_COLUMNS =
  "id, name, email, phone, state, tags, first_question, matched_lead_id, matched_org, last_message_at, message_count, last_message_text, synced_at"

interface SupabaseChannelConversationListRow {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  state: string | null
  tags: string[] | null
  first_question: string | null
  matched_lead_id: string | null
  matched_org: string | null
  last_message_at: string | null
  message_count: number | null
  last_message_text: string | null
  synced_at: string | null
}

// 배포 스큐 감지 — 마이그레이션(20260827_channel_conv_list_columns) 미적용 DB에서
// message_count/last_message_text select가 undefined_column(42703)으로 실패하는 경우.
// 선례: lib/admin-docs.ts 의 isMissingContentLengthColumn.
function isMissingListColumns(error: { code?: string; message?: string; details?: string; hint?: string }) {
  if (error.code === "42703") return true
  const haystack = [error.message, error.details, error.hint].filter(Boolean).join(" ").toLowerCase()
  return haystack.includes("message_count") || haystack.includes("last_message_text")
}

function supabaseListRowToRecord(row: SupabaseChannelConversationListRow): ChannelConversationListRecord {
  return {
    id: row.id,
    userChatId: row.id,
    name: row.name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    state: toRecordState(row.state),
    tags: Array.isArray(row.tags) ? row.tags : [],
    messageCount: row.message_count ?? 0,
    firstQuestion: row.first_question ?? undefined,
    lastMessageText: row.last_message_text ?? undefined,
    lastMessageAt: row.last_message_at ?? undefined,
    matchedLeadId: row.matched_lead_id ?? undefined,
    matchedLeadOrg: row.matched_org ?? undefined,
    syncedAt: row.synced_at ?? new Date(0).toISOString(),
  }
}

/**
 * 어드민 상담 목록(app/api/admin/channel-talk/route.ts) 전용 경량 조회 — transcript(상담 전문 jsonb)를
 * select 하지 않고 생성 컬럼(message_count/last_message_text)만 읽는다.
 * 컬럼 미적용(42703) 시 listDurableConversations() 전체 경로로 재시도해 transcript만 걷어낸다
 * (JSON 폴백보다 우선 — 같은 Supabase 데이터를 그대로 쓴다). 그 외 실패/미설정 시 null.
 */
export async function listDurableConversationsLite(
  limit = 500
): Promise<ChannelConversationListRecord[] | null> {
  if (!channelConversationsSupabaseEnabled()) return null

  try {
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase
      .from("channel_conversations")
      .select(LIST_LITE_COLUMNS)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(limit)

    if (error) {
      if (isMissingListColumns(error)) {
        const full = await listDurableConversations(limit)
        if (!full) return null
        return full.map(({ transcript, ...rest }) => {
          void transcript
          return rest
        })
      }
      throw new Error(error.message)
    }

    return ((data ?? []) as SupabaseChannelConversationListRow[]).map(supabaseListRowToRecord)
  } catch (error) {
    console.warn(
      "[channel-conversations] Supabase 경량 목록 조회 실패, JSON 폴백:",
      error instanceof Error ? error.message : error
    )
    return null
  }
}

export async function getDurableConversationSyncMeta(): Promise<ChannelConversationSyncMeta> {
  if (channelConversationsSupabaseEnabled()) {
    try {
      const supabase = createSupabaseAdminClient()
      const { data, error } = await supabase
        .from("channel_conversations")
        .select("synced_at, matched_lead_id")
      if (error) throw new Error(error.message)

      const rows = (data ?? []) as { synced_at: string | null; matched_lead_id: string | null }[]
      let latestMs = 0
      let matchedLeads = 0
      for (const row of rows) {
        const ms = row.synced_at ? new Date(row.synced_at).getTime() : 0
        if (Number.isFinite(ms) && ms > latestMs) latestMs = ms
        if (row.matched_lead_id) matchedLeads += 1
      }
      return {
        lastSyncedAt: latestMs > 0 ? new Date(latestMs).toISOString() : null,
        matchedLeads,
        total: rows.length,
      }
    } catch (error) {
      console.warn(
        "[channel-conversations] Supabase 메타 조회 실패, JSON 폴백:",
        error instanceof Error ? error.message : error
      )
    }
  }

  const stats = getConversationStats()
  return {
    lastSyncedAt: getLastConversationSyncAt(),
    matchedLeads: stats.matchedLeads,
    total: stats.total,
  }
}

/**
 * 상담 레코드를 영속 저장한다(Supabase 우선, 미설정/실패 시 JSON 폴백).
 * 신규/기존 판별(created)은 호출자가 사전 조회한 기존 맵으로 계산하므로 여기서는 upserted 수만 반환한다.
 * 주의: JSON 폴백은 운영 FS(Vercel)에서 assertLocalJsonWriteAllowed 로 던진다(무음 데이터 유실 방지). 호출자가 감싼다.
 */
export async function upsertDurableConversations(
  records: ChannelConversationRecord[]
): Promise<{ upserted: number }> {
  if (records.length === 0) return { upserted: 0 }

  if (channelConversationsSupabaseEnabled()) {
    try {
      const supabase = createSupabaseAdminClient()
      const { error } = await supabase
        .from("channel_conversations")
        .upsert(records.map(recordToSupabaseRow), { onConflict: "id" })
      if (error) throw new Error(error.message)
      return { upserted: records.length }
    } catch (error) {
      console.warn(
        "[channel-conversations] Supabase upsert 실패, JSON 폴백:",
        error instanceof Error ? error.message : error
      )
    }
  }

  const { upserted } = upsertConversations(records)
  return { upserted }
}

/**
 * 한 상담의 청크를 통째로 교체한다(delete-then-insert). Supabase 전용 — 미설정이면 no-op(written 0).
 * embedding 은 null 로 두고 scripts/embed-channel-chunks.ts 백필이 채운다(계약 5).
 * 실패 시 던진다 — 호출자(sync)가 대화 단위로 감싸 한 건 실패가 전체 동기화를 막지 않게 한다.
 */
export async function replaceConversationChunks(
  conversationId: string,
  chunks: ChannelConversationChunkInput[]
): Promise<{ written: number }> {
  if (!channelConversationsSupabaseEnabled()) return { written: 0 }

  const supabase = createSupabaseAdminClient()

  const { error: deleteError } = await supabase
    .from("channel_conversation_chunks")
    .delete()
    .eq("conversation_id", conversationId)
  if (deleteError) {
    throw new Error(`[channel-conversations] 청크 삭제 실패(${conversationId}): ${deleteError.message}`)
  }

  if (chunks.length === 0) return { written: 0 }

  const { error: insertError } = await supabase.from("channel_conversation_chunks").insert(
    chunks.map((chunk) => ({
      conversation_id: conversationId,
      seq: chunk.seq,
      content: chunk.content,
      category: chunk.category,
      embedding: null,
    }))
  )
  if (insertError) {
    throw new Error(`[channel-conversations] 청크 저장 실패(${conversationId}): ${insertError.message}`)
  }

  return { written: chunks.length }
}
