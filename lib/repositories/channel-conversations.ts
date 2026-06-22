/**
 * 채널톡 상담 대화 저장소 — data/channel-conversations.json 폴백 저장소.
 *
 * Supabase 테이블을 새로 만들지 않고 lib/db.ts 와 동일한 JSON 폴백 패턴을 따른다.
 * 주의: Vercel 서버리스 FS는 배포/인스턴스 간 영속되지 않으므로, 운영 영속이 필요하면
 * Supabase 테이블로 승격할 것. 인터페이스는 그 전환을 쉽게 하도록 좁게 유지한다.
 */

import "server-only"

import fs from "fs"
import path from "path"

import { atomicWriteJsonSync } from "@/lib/atomic-write"

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
