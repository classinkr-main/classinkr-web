import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { isChannelApiConfigured } from "@/lib/channel-talk-api"
import { computeChannelConversationStats } from "@/lib/channel-talk-insights"
import {
  getConversations,
  listDurableConversations,
} from "@/lib/repositories/channel-conversations"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  // durable(Supabase) 우선 — 크론/수동 동기화가 쓰는 저장소와 같은 곳을 읽는다.
  // 미설정/실패 시에만 레거시 로컬 JSON 폴백(개발 환경 호환).
  const durable = await listDurableConversations()
  const records = durable ?? getConversations()

  let lastSyncedAt: string | null = null
  for (const record of records) {
    if (record.syncedAt && (!lastSyncedAt || record.syncedAt > lastSyncedAt)) {
      lastSyncedAt = record.syncedAt
    }
  }

  return adminCachedJson({
    configured: isChannelApiConfigured(),
    // transcript 는 탭이 쓰지 않는 전문 데이터 — 응답에서 제외해 페이로드·PII 표면을 줄인다.
    conversations: records.map((record) => {
      const { transcript, ...rest } = record
      void transcript
      return rest
    }),
    stats: computeChannelConversationStats(records),
    lastSyncedAt,
    source: durable ? "supabase" : "local_json",
  })
}
