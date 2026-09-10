/**
 * GET /api/showroom/availability — 쇼룸 예약 가용성(공개·무인증).
 *
 * 예약 화면이 달력을 그리는 데 쓴다. 개인정보를 담지 않고 날짜·슬롯 상태만 돌려준다.
 * 원천(공휴일·쇼룸 ICS)은 각자 캐시를 갖고 있고, 여기서는 짧은 공개 캐시만 얹는다 —
 * 우리 DB 의 신규 접수가 오래 반영되지 않으면 이미 찬 슬롯을 계속 열어 보이게 된다.
 *
 * 응답: 200 { ok, todayIso, minIso, maxIso, days } / 400 / 429 / 500 { ok:false }
 */

import { type NextRequest, NextResponse } from "next/server"

import { checkRateLimitDistributed, getClientIp } from "@/lib/server/rate-limit"
import { getShowroomAvailability } from "@/lib/showroom/availability"
import {
  SHOWROOM_SLOT_DURATION_MINUTES,
  SHOWROOM_SLOT_TIMES,
  isValidIsoDate,
} from "@/lib/showroom/slots"

export const runtime = "nodejs"

/** 달력을 넘길 때마다 부르는 읽기 경로라 신청보다 넉넉하게 잡는다. */
const RATE_LIMIT = { windowMs: 60_000, max: 30 }

function pickIsoDate(value: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return isValidIsoDate(trimmed) ? trimmed : undefined
}

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const { allowed, resetAt } = await checkRateLimitDistributed(
      ip,
      "showroom-availability",
      RATE_LIMIT
    )

    if (!allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
      return NextResponse.json(
        { ok: false },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }

    const params = req.nextUrl.searchParams
    const rawFrom = params.get("from")
    const rawTo = params.get("to")

    // 형식이 깨진 값을 조용히 무시하면 화면이 엉뚱한 범위를 받고도 모른다.
    if ((rawFrom && !pickIsoDate(rawFrom)) || (rawTo && !pickIsoDate(rawTo))) {
      return NextResponse.json({ ok: false, error: "invalid_range" }, { status: 400 })
    }

    const availability = await getShowroomAvailability({
      fromIso: pickIsoDate(rawFrom),
      toIso: pickIsoDate(rawTo),
    })

    return NextResponse.json(
      {
        ok: true,
        ...availability,
        slotTimes: SHOWROOM_SLOT_TIMES,
        slotDurationMinutes: SHOWROOM_SLOT_DURATION_MINUTES,
      },
      {
        // 신규 접수가 오래 묵지 않게 짧게 잡는다.
        headers: { "Cache-Control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120" },
      }
    )
  } catch (error) {
    console.error("[GET /api/showroom/availability] unexpected error:", error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
