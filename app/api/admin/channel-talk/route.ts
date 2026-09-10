import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { isChannelApiConfigured } from "@/lib/channel-talk-api"
import { computeChannelConversationStats } from "@/lib/channel-talk-insights"
import {
  getConversations,
  listDurableConversationsLite,
  type ChannelConversationListRecord,
} from "@/lib/repositories/channel-conversations"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  // durable(Supabase) 우선 — 크론/수동 동기화가 쓰는 저장소와 같은 곳을 읽는다.
  // 목록은 transcript(전문)를 쓰지 않으므로 경량 select(생성 컬럼)로 읽는다(레버 08).
  // 미설정/실패 시에만 레거시 로컬 JSON 폴백(개발 환경 호환) — JSON 경로는 transcript 를 걷어낸다.
  const durable = await listDurableConversationsLite()
  const records: ChannelConversationListRecord[] =
    durable ??
    getConversations().map((record) => {
      const { transcript, ...rest } = record
      void transcript
      return rest
    })

  let lastSyncedAt: string | null = null
  for (const record of records) {
    if (record.syncedAt && (!lastSyncedAt || record.syncedAt > lastSyncedAt)) {
      lastSyncedAt = record.syncedAt
    }
  }

  return adminCachedJson({
    configured: isChannelApiConfigured(),
    conversations: records,
    stats: computeChannelConversationStats(records),
    lastSyncedAt,
    source: durable ? "supabase" : "local_json",
  })
}
