import "server-only"

// 상담 내역 찾기(consultations.ts)의 서버 연결 — 기존 저장소 조회 함수만 쓴다(새 쿼리·색인·마이그레이션 없음).
//
//  - 채널톡 상담: listDurableConversationsLite(Supabase 경량 목록 — 상담 Inbox API 와 같은 함수, 전문·연락처 칸은 넘기지 않는다).
//    Supabase 가 없으면 로컬 JSON(getConversations)으로 떨어진다(개발 환경 — Inbox API 와 같은 규칙).
//  - 내부 CS 대화: listInternalCsConversations(목록 칸만 — customer_context 원문 없음, 한 번에 200건 상한).
//  - 고객 찾기: buildContactDeps().findCustomersInText(CRM 통합 고객 이름 일치).
//  - 임베딩 검색: ADMIN_AI_CONSULTATION_SEMANTIC=1 일 때만(비용·범위 결정 전이라 기본 끔). 채널톡 상담 청크 검색을 쓴다.
// 두 저장소 모두 낱말 검색 함수가 없어(채널톡 목록은 검색 인자가 없고, 내부 CS 의 q 는 제목·담당자 ilike 하나) 최근 N건을 읽어
// consultations.ts 가 거른다. 같은 인스턴스에서 1분 동안은 읽은 목록을 다시 쓴다(묻기 답의 "관련 상담 n건"과 함께 불려도 한 번 읽게).
// 로그에는 출처 이름과 오류 종류만 남긴다(질문·상담 글 없음).
import { searchConsultationEvidence } from "@/lib/internal-cs-chat/consultation-search"
import { buildContactDeps } from "@/lib/internal-cs-chat/contact-deps"
import {
  channelConversationsSupabaseEnabled,
  getConversations,
  listDurableConversationsLite,
  type ChannelConversationListRecord,
} from "@/lib/repositories/channel-conversations"
import { listInternalCsConversations, type InternalCsConversationListRow } from "@/lib/repositories/internal-cs-chat"

import type { ConsultationBatch, ConsultationDeps, ConsultationRecord } from "./consultations"

const CACHE_MS = 60_000
/** listInternalCsConversations 의 한 번 상한. */
const INTERNAL_CS_MAX = 200

const cache = new Map<string, { at: number; value: Promise<ConsultationBatch | null> }>()

function cached(key: string, load: () => Promise<ConsultationBatch | null>): Promise<ConsultationBatch | null> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.value
  const value = load().catch((error: unknown) => {
    cache.delete(key)
    throw error
  })
  cache.set(key, { at: now, value })
  return value
}

export function channelRecordOf(row: ChannelConversationListRecord): ConsultationRecord {
  return {
    id: row.id,
    source: "channel_talk",
    at: row.lastMessageAt ?? row.firstAskedAt ?? null,
    org: row.matchedLeadOrg ?? null,
    person: row.name ?? null,
    leadId: row.matchedLeadId ?? null,
    subject: row.firstQuestion || row.lastMessageText || "",
    ...(row.lastMessageText ? { extra: row.lastMessageText } : {}),
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.state,
  }
}

export function internalCsRecordOf(row: InternalCsConversationListRow): ConsultationRecord {
  return {
    id: row.id,
    source: "internal_cs",
    at: row.last_message_at ?? row.updated_at ?? row.created_at ?? null,
    org: null,
    person: null,
    leadId: null,
    subject: row.title ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    status: row.status,
  }
}

async function loadChannelTalk(limit: number): Promise<ConsultationBatch | null> {
  const durable = await listDurableConversationsLite(limit)
  const rows: ChannelConversationListRecord[] =
    durable ??
    getConversations()
      .slice(0, limit)
      .map(({ transcript, ...rest }) => {
        void transcript
        return rest
      })
  return { records: rows.map(channelRecordOf), limit }
}

async function loadInternalCs(limit: number): Promise<ConsultationBatch | null> {
  // 내부 CS 대화는 Supabase 에만 있다 — 설정이 없으면 출처 없음(실패가 아니다).
  if (!channelConversationsSupabaseEnabled()) return null
  const capped = Math.min(limit, INTERNAL_CS_MAX)
  const { conversations } = await listInternalCsConversations({ status: "all", limit: capped })
  return { records: conversations.map(internalCsRecordOf), limit: capped }
}

function logged<T>(source: string, task: () => Promise<T>): Promise<T> {
  return task().catch((error: unknown) => {
    console.warn(`[admin-ai/consultations] source_failed source=${source} code=${error instanceof Error ? error.name.replace(/\W/g, "") : "unknown"}`)
    throw error
  })
}

export function buildConsultationDeps(): ConsultationDeps {
  const contact = buildContactDeps()
  const semanticOn = process.env.ADMIN_AI_CONSULTATION_SEMANTIC === "1"
  return {
    channelTalk: (limit) => logged("channel_talk", () => cached(`channel_talk:${limit}`, () => loadChannelTalk(limit))),
    internalCs: (limit) => logged("internal_cs", () => cached(`internal_cs:${limit}`, () => loadInternalCs(limit))),
    ...(contact.findCustomersInText ? { findCustomersInText: contact.findCustomersInText } : {}),
    ...(semanticOn
      ? {
          semantic: async (question: string, limit: number) => {
            const hits = await searchConsultationEvidence(question, { limit })
            return hits.map((hit) => ({ id: hit.conversationId, source: "channel_talk" as const }))
          },
        }
      : {}),
  }
}
