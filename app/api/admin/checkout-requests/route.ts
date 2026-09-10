import { NextRequest, NextResponse } from "next/server"

import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import { isDateString } from "@/lib/admin-calendar/range"
import {
  CHECKOUT_REQUEST_KINDS,
  CHECKOUT_REQUEST_STATUSES,
  isCheckoutRequestKind,
  isCheckoutRequestStatus,
  listCheckoutRequests,
} from "@/lib/repositories/checkout-requests-admin"

/**
 * GET /api/admin/checkout-requests — 결제창 무결제 도입 신청 목록
 *
 * 공개 접수(lib/checkout-requests.ts)는 신청 행을 만들고 leads 로 미러링만 한다.
 * 담당자가 그 신청을 읽고 응대 상태를 올릴 경로가 이 라우트와 [id] PATCH 다 —
 * 신청이 leads 미러링으로만 발견되고 status 가 영원히 new 에 머무는 문제를 푼다.
 *
 * 필터: ?from&to (접수일 created_at 기준, YYYY-MM-DD 포함 — 축 선택 이유는
 *       lib/repositories/checkout-requests-admin.ts 의 listCheckoutRequests 주석 참조)
 *       ?status (스키마 CHECK 와 같은 목록) · ?kind (hardware|software)
 */
export async function GET(req: NextRequest) {
  const err = await verifyAdmin(req)
  if (err) return err

  try {
    const { searchParams } = req.nextUrl
    const from = searchParams.get("from")
    const to = searchParams.get("to")
    const status = searchParams.get("status")
    const kind = searchParams.get("kind")

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
    if (status !== null && !isCheckoutRequestStatus(status)) {
      return NextResponse.json(
        { error: `status 는 ${CHECKOUT_REQUEST_STATUSES.join(", ")} 중 하나여야 합니다.` },
        { status: 400 }
      )
    }
    if (kind !== null && !isCheckoutRequestKind(kind)) {
      return NextResponse.json(
        { error: `kind 는 ${CHECKOUT_REQUEST_KINDS.join(", ")} 중 하나여야 합니다.` },
        { status: 400 }
      )
    }

    return adminCachedJson(
      await listCheckoutRequests({
        from: from ?? undefined,
        to: to ?? undefined,
        status: status ?? undefined,
        kind: kind ?? undefined,
      })
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "도입 신청 조회에 실패했습니다." },
      { status: 500 }
    )
  }
}
