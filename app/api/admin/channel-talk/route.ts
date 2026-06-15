import { NextRequest } from "next/server"

import { adminCachedJson } from "@/lib/admin-api-response"
import { verifyAdmin } from "@/lib/admin-auth"
import { isChannelApiConfigured } from "@/lib/channel-talk-api"
import {
  getConversations,
  getConversationStats,
} from "@/lib/repositories/channel-conversations"

export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  return adminCachedJson({
    configured: isChannelApiConfigured(),
    conversations: getConversations(),
    stats: getConversationStats(),
  })
}
