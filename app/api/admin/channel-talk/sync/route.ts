import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { syncChannelConversations } from "@/lib/channel-talk-sync"

export async function POST(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  let limit: number | undefined
  try {
    const body = (await req.json()) as { limit?: unknown }
    if (typeof body.limit === "number" && Number.isFinite(body.limit)) {
      limit = Math.min(Math.max(Math.trunc(body.limit), 1), 200)
    }
  } catch {
    // 본문 없음 — 기본값 사용
  }

  const result = await syncChannelConversations({ limit })

  // 미설정(키 없음)은 정상 상태(200)로 알리고, 설정됐는데 실패하면 502.
  const status = result.ok ? 200 : result.configured ? 502 : 200
  return NextResponse.json(result, { status })
}
