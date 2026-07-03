import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { listMessageLogs, maskRecipient } from "@/lib/messaging/message-log-repository"
import type { MessageChannel, MessageLogStatus } from "@/lib/messaging/types"

/**
 * GET /api/admin/messaging/logs?channel=&status=&limit=50&offset=0
 *
 * message_logs 조회. recipient 는 마스킹(010****5678)해 응답한다.
 * data: { logs:[{id,channel,provider,recipient,templateId,status,statusCode,error,context,createdAt}], total }
 */

const VALID_CHANNELS: MessageChannel[] = [
  "sms",
  "lms",
  "kakao_alimtalk",
  "kakao_friendtalk",
  "email",
]
const VALID_STATUSES: MessageLogStatus[] = ["requested", "sent", "failed", "simulated"]

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = req.nextUrl

  const channelParam = searchParams.get("channel")
  const statusParam = searchParams.get("status")
  const channel = VALID_CHANNELS.includes(channelParam as MessageChannel)
    ? (channelParam as MessageChannel)
    : undefined
  const status = VALID_STATUSES.includes(statusParam as MessageLogStatus)
    ? (statusParam as MessageLogStatus)
    : undefined

  const limitRaw = Number(searchParams.get("limit") ?? "50")
  const offsetRaw = Number(searchParams.get("offset") ?? "0")
  const limit = Number.isFinite(limitRaw) ? limitRaw : 50
  const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0

  try {
    const { logs, total } = await listMessageLogs({ channel, status, limit, offset })

    return NextResponse.json({
      data: {
        logs: logs.map((log) => ({
          id: log.id,
          channel: log.channel,
          provider: log.provider,
          recipient: maskRecipient(log.recipient),
          templateId: log.templateId,
          status: log.status,
          statusCode: log.statusCode,
          error: log.error,
          context: log.context,
          createdAt: log.createdAt,
        })),
        total,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "로그 조회 실패"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
