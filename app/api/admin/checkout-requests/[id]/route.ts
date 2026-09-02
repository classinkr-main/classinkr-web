import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import {
  CHECKOUT_REQUEST_STATUSES,
  isCheckoutRequestStatus,
  updateCheckoutRequestStatus,
} from "@/lib/repositories/checkout-requests-admin"

/**
 * PATCH /api/admin/checkout-requests/[id] — 신청 상태 전이
 *
 * 이 라우트가 없으면 신청은 영원히 `new` 에 머문다. checkout_requests 에는
 * assigned_to 컬럼이 없어(supabase/migrations/20260727_checkout_requests*.sql 확인 —
 * showroom_bookings 와 달리 담당자 컬럼이 추가된 적이 없다) 담당자 배정은 다루지
 * 않는다. status 전이만 한다.
 *
 * body: { status: new|contacted|scheduled|done|canceled }
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
  if (!isCheckoutRequestStatus(raw.status)) {
    return NextResponse.json(
      { error: `status 는 ${CHECKOUT_REQUEST_STATUSES.join(", ")} 중 하나여야 합니다.` },
      { status: 400 }
    )
  }

  try {
    const updated = await updateCheckoutRequestStatus(id, { status: raw.status })
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "도입 신청 상태 변경에 실패했습니다." },
      { status: 500 }
    )
  }
}
