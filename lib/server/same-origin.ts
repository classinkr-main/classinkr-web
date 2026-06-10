import "server-only"

import type { NextRequest } from "next/server"

/**
 * 브라우저발 cross-origin POST를 차단하는 가벼운 필터.
 * Origin 헤더가 존재하면서 요청 호스트와 다르면 거부한다.
 * (Origin이 없는 비브라우저 요청은 rate limit 등 다른 방어에 맡긴다 —
 *  봇은 어차피 헤더를 위조할 수 있으므로 이 체크는 naive한 남용 차단 용도)
 */
export function isCrossOriginRequest(req: NextRequest): boolean {
  const origin = req.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).host !== req.nextUrl.host
  } catch {
    return true
  }
}
