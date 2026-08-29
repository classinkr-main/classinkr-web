import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  SHOWROOM_BOOKING_STATUSES,
  isShowroomBookingStatus,
  updateShowroomBookingStatus,
} from "@/lib/repositories/showroom-bookings"

const MAX_ASSIGNED_TO_LENGTH = 100

/**
 * PATCH /api/admin/showroom-bookings/[id] — 접수 상태 전이
 *
 * 이 라우트가 없으면 접수는 영원히 `requested` 에 머문다. 상태 전이는 여기 한 곳에서만
 * 일어난다(캘린더 이벤트는 readonly 다 — lib/showroom/calendar-source.ts).
 *
 * body: { status: requested|confirmed|completed|no_show|canceled, assignedTo?: string|null }
 *  - 미등록 상태값 → 400 (조용히 삼키지 않는다)
 *  - 없는 id → 404
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const err = await verifyAdmin(req)
  if (err) return err

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const raw = body as Record<string, unknown>
  if (!isShowroomBookingStatus(raw.status)) {
    return NextResponse.json(
      { error: `status 는 ${SHOWROOM_BOOKING_STATUSES.join(", ")} 중 하나여야 합니다.` },
      { status: 400 }
    )
  }

  // 미지정이면 기존 담당자를 그대로 두고, null 은 "지운다"는 명시적 의사다.
  let assignedTo: string | null | undefined
  if (raw.assignedTo !== undefined) {
    if (raw.assignedTo === null) {
      assignedTo = null
    } else if (typeof raw.assignedTo === "string") {
      const trimmed = raw.assignedTo.trim().slice(0, MAX_ASSIGNED_TO_LENGTH)
      assignedTo = trimmed.length > 0 ? trimmed : null
    } else {
      return NextResponse.json(
        { error: "assignedTo 는 문자열이거나 null 이어야 합니다." },
        { status: 400 }
      )
    }
  }

  try {
    const updated = await updateShowroomBookingStatus(id, { status: raw.status, assignedTo })
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "쇼룸 예약 상태 변경에 실패했습니다." },
      { status: 500 }
    )
  }
}
