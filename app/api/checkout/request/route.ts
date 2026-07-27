/**
 * POST /api/checkout/request — 결제창 "무결제 신청(도입 신청)" 접수(공개·무인증).
 *
 * 결제가 성사되지 않아도 신청을 받아 우리가 연락해 진행하는 경로다.
 * 검증·저장·알림 오케스트레이션은 lib/checkout-requests.ts 가 소유하고,
 * 라우트는 출처/과도 요청 방어와 상태 코드 매핑만 한다(/api/lead 와 동일한 관례).
 *
 * 응답: 200 { ok, requestId } / 400 { ok:false, error:'validation', field? } / 413 / 429 / 500 { ok:false }
 */

import { after, type NextRequest, NextResponse } from "next/server"

import { submitCheckoutRequest } from "@/lib/checkout-requests"
import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"

export const runtime = "nodejs"

/**
 * 본문 상한(바이트). 정상 신청은 품목 20개 + 메모 2000자라 넉넉히 32KB 안쪽이다.
 * Content-Length 가 없는 요청(chunked)은 통과시키고 플랫폼 요청 크기 제한에 맡긴다 —
 * 스트림을 직접 세면서 파싱을 늦추는 비용이 이 공개 엔드포인트에서 얻는 것보다 크다.
 */
const MAX_BODY_BYTES = 32_768

export async function POST(req: NextRequest) {
  try {
    if (isCrossOriginRequest(req)) {
      return NextResponse.json({ ok: false }, { status: 403 })
    }

    // 파싱 전에 자른다 — 공개 무인증 경로라 대형 JSON 파싱 비용부터 막는다.
    const contentLength = Number(req.headers.get("content-length"))
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false }, { status: 413 })
    }

    // /api/lead 와 같은 수준(IP당 1분 5회) — 신청은 사람 손으로 몇 번 누르는 행위다.
    const ip = getClientIp(req)
    const { allowed, resetAt } = await checkRateLimitDistributed(ip, "checkout-request", {
      windowMs: 60_000,
      max: 5,
    })

    if (!allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }

    const body = await req.json().catch(() => null)
    // 리드 미러링·ops 알림은 응답 이후로 미룬다 — 신청 행이 남는 즉시 성공을 돌려준다.
    const result = await submitCheckoutRequest(body, { deferTask: (task) => after(task) })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[POST /api/checkout/request] unexpected error:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
