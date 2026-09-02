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
  // 이 탭은 transcript(전문)를 쓰지 않으므로 select 단계에서부터 제외한다(egress 절감, T5-C).
  const durable = await listDurableConversations(undefined, { withTranscript: false })
  const records = durable ?? getConversations()

  let lastSyncedAt: string | null = null
  for (const record of records) {
    if (record.syncedAt && (!lastSyncedAt || record.syncedAt > lastSyncedAt)) {
      lastSyncedAt = record.syncedAt
    }
  }

  return adminCachedJson({
    configured: isChannelApiConfigured(),
    // transcript 는 탭이 쓰지 않는 전문 데이터. durable 경로는 이미 select 에서 제외했지만
    // (T5-C), 로컬 JSON 폴백 레코드는 여전히 transcript 를 담고 있으므로 방어적으로 유지.
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
