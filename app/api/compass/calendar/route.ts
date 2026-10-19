import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

import { daysBetween, isDateString } from "@/lib/admin-calendar/range"
import { getEventsByRangeWithDiagnostics } from "@/lib/calendar-data"

/**
 * Compass(mkt.classin.co.kr) 전용 읽기 전용 캘린더 피드.
 *
 * 왜 /api/admin/calendar 를 그냥 못 쓰나: 그쪽은 verifyAdmin → getVerifiedAdminContext 가
 * **어드민 세션 쿠키**를 요구한다. 크론에는 세션이 없고, 기계가 어드민 세션을 흉내내게
 * 만들면 그 앱의 인증 모델이 무너진다. 그래서 전용 Bearer 토큰을 쓴다.
 *
 * CRON_SECRET 을 재사용하지 않는다 — 그 값 하나가 /api/cron/* 를 전부 연다. 달력 하나 때문에
 * 그 권한을 넘길 이유가 없고, 나중에 Compass 쪽만 회수할 수도 없어진다.
 *
 * 비교는 timingSafeEqual 이다. 이웃 크론 라우트들은 아직 `!==` 를 쓰지만 그건 고칠 대상이지
 * 따라할 대상이 아니다(응답 시간으로 비밀값을 한 글자씩 맞춰 볼 여지가 있다).
 *
 * 소스는 **allowlist** 다. `compass_demo` 만 빼는 blocklist 로 하면 어드민에 열 번째 소스가
 * 생겼을 때 조용히 Compass 로 흘러든다. compass_demo 를 빼는 이유는 그 소스의 원본이
 * Compass 자신이기 때문이다(public.compass_cal_events_v) — 돌려주면 자기가 보낸 것을 되받는다.
 */
export const dynamic = "force-dynamic"
// 콜드 호출은 걸치는 달마다 외부 소스를 긁는다(소스별 9초 하드 마감). 기본값으로는 잘릴 수 있다.
export const maxDuration = 60

const MAX_RANGE_DAYS = 120

/** Compass 가 미러하는 소스. 여기 없는 것은 내려가지 않는다. */
const MIRRORED = new Set([
  "calendar",
  "partner",
  "event",
  "notion",
  "showroom",
  "showroom_booking",
  "team_event",
  "holiday",
])

function tokenOk(header: string | null): boolean {
  const secret = process.env.COMPASS_CALENDAR_TOKEN
  if (!secret || !header) return false
  const got = Buffer.from(header, "utf8")
  const want = Buffer.from(`Bearer ${secret}`, "utf8")
  // timingSafeEqual 은 길이가 다르면 던진다 — 길이만 드러나고 내용은 드러나지 않는다
  if (got.length !== want.length) return false
  return timingSafeEqual(got, want)
}

export async function GET(req: NextRequest) {
  if (!tokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const from = searchParams.get("from")
  const to = searchParams.get("to")

  if (!isDateString(from) || !isDateString(to)) {
    return NextResponse.json({ error: "from/to 는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 })
  }
  const span = daysBetween(from, to)
  if (span < 0) {
    return NextResponse.json({ error: "from 이 to 보다 뒤일 수 없습니다." }, { status: 400 })
  }
  if (span > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `조회 기간은 최대 ${MAX_RANGE_DAYS}일입니다.` }, { status: 400 })
  }

  try {
    const { events, diagnostics } = await getEventsByRangeWithDiagnostics(from, to)
    return NextResponse.json(
      {
        events: events.filter((e) => e.source && MIRRORED.has(e.source)),
        // Compass 의 보존 규칙이 degraded 를 본다 — "0건"과 "지금 못 읽었다"를 구별해야
        // 타임아웃 한 번에 그쪽 미러가 비워지지 않는다.
        diagnostics: diagnostics.filter((d) => MIRRORED.has(d.source)),
      },
      // 미러는 브라우저가 아니다. adminCachedJson 의 private/max-age 규약을 쓰지 않는다 —
      // 서버 쪽 60초 unstable_cache 가 이미 중복 계산을 막는다.
      { headers: { "cache-control": "no-store" } }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "캘린더 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
