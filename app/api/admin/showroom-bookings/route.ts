import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isDateString } from "@/lib/admin-calendar/range"
import {
  SHOWROOM_BOOKING_STATUSES,
  isShowroomBookingStatus,
  listShowroomBookings,
} from "@/lib/repositories/showroom-bookings"

/**
 * GET /api/admin/showroom-bookings — 쇼룸 예약 접수 목록
 *
 * 공개 접수(app/api/showroom)는 행을 만들기만 한다. 담당자가 그 접수를 읽고 확정할
 * 경로가 이 라우트와 [id] PATCH 다 — checkout_requests 처럼 "테이블만 있고 읽는 곳이
 * 없는" 상태로 두지 않기 위한 최소 표면이다.
 *
 * 필터: ?from&to (방문일, YYYY-MM-DD 포함) · ?status (스키마 CHECK 와 같은 목록)
 */
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { searchParams } = req.nextUrl
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const status = searchParams.get("status")

    if (from !== null && !isDateString(from)) {
      return NextResponse.json({ error: "from 은 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 })
    }
    if (to !== null && !isDateString(to)) {
      return NextResponse.json({ error: "to 는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 })
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: "from 이 to 보다 뒤일 수 없습니다." }, { status: 400 })
    }
    // 미등록 상태값을 조용히 무시하면 "전량"이 필터된 목록으로 오독된다.
    if (status !== null && !isShowroomBookingStatus(status)) {
      return NextResponse.json(
        { error: `status 는 ${SHOWROOM_BOOKING_STATUSES.join(", ")} 중 하나여야 합니다.` },
        { status: 400 }
      )
    }

    return adminCachedJson(
      await listShowroomBookings({
        from: from ?? undefined,
        to: to ?? undefined,
        status: status ?? undefined,
      })
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "쇼룸 예약 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
