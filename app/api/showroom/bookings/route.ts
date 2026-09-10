/**
 * POST /api/showroom/bookings — 쇼룸 방문 예약 접수(공개·무인증).
 *
 * 검증·저장·알림 오케스트레이션은 `lib/showroom/bookings.ts` 가 소유하고,
 * 라우트는 출처/과도 요청 방어와 상태 코드 매핑만 한다
 * (`/api/lead`, `/api/checkout/request` 와 같은 관례).
 *
 * 응답: 200 { ok, bookingId } / 400 { ok:false, error:'validation', field? }
 *       / 403 / 409 { ok:false, error:'slot_unavailable' } / 413 / 429 / 500 { ok:false }
 */

import { after, type NextRequest, NextResponse } from "next/server"

import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { isCrossOriginRequest } from "@/lib/server/same-origin"
import { isShowroomSlotAvailable } from "@/lib/showroom/availability"
import { submitShowroomBooking } from "@/lib/showroom/bookings"

export const runtime = "nodejs"

/**
 * 본문 상한(바이트). 정상 접수는 메모 2000자에 짧은 필드 몇 개라 8KB 안쪽이다.
 * Content-Length 가 없는 요청(chunked)은 통과시키고 플랫폼 제한에 맡긴다.
 */
const MAX_BODY_BYTES = 8_192

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

    // /api/lead·/api/checkout/request 와 같은 수준(IP당 1분 5회).
    const ip = getClientIp(req)
    const { allowed, resetAt } = await checkRateLimitDistributed(ip, "showroom-booking", {
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

    // 리드 미러링·ops 알림은 응답 이후로 미룬다 — 예약 행이 남는 즉시 성공을 돌려준다.
    const result = await submitShowroomBooking(body, {
      deferTask: (task) => after(task),
      isSlotOpen: (date, time) => isShowroomSlotAvailable(date, time),
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (error) {
    console.error("[POST /api/showroom/bookings] unexpected error:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
