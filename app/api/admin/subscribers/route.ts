/**
 * ─────────────────────────────────────────────────────────────
 * /api/admin/subscribers  —  구독자 관리 API (관리자 전용)
 * ─────────────────────────────────────────────────────────────
 *
 * [NOTE-9] 인증 체계
 *   기존 블로그 관리와 동일한 Bearer Token 인증 사용.
 *   lib/admin-auth.ts의 verifyAdmin()으로 통일.
 *
 * GET  → 전체 구독자 목록 조회 (필터: ?status=active&tag=원장)
 * POST → 구독자 수동 추가 (관리자가 직접 입력)
 */

import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import {
  getAllSubscribers,
  upsertSubscriber,
  deleteSubscriber,
} from "@/lib/marketing-data"
import type { UpsertSubscriberRequest } from "@/lib/marketing-types"

export async function GET(req: NextRequest) {
  // [NOTE-9] 관리자 인증 확인
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get("status")   // active | unsubscribed
  const tagFilter = searchParams.get("tag")          // 특정 태그

  let subscribers = await getAllSubscribers()

  // 상태 필터
  if (statusFilter) {
    subscribers = subscribers.filter((s) => s.status === statusFilter)
  }
  // 태그 필터
  if (tagFilter) {
    subscribers = subscribers.filter((s) => s.tags.includes(tagFilter))
  }

  return NextResponse.json({
    subscribers,
    total: subscribers.length,
  })
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  try {
    const body: UpsertSubscriberRequest = await req.json()

    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "이름과 이메일은 필수입니다." },
        { status: 400 }
      )
    }

    /**
     * [NOTE-10] 관리자 수동 추가 시 source = "manual"
     * 자동 수집(demo_modal, contact_page, newsletter)과 구분하여
     * 유입 경로 분석이 가능하도록 한다.
     */
    const subscriber = await upsertSubscriber({
      name: body.name,
      email: body.email,
      org: body.org,
      role: body.role,
      size: body.size,
      phone: body.phone,
      tags: body.tags ?? [],
      source: "manual",
    })

    return NextResponse.json({ ok: true, subscriber })
  } catch {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400 }
    )
  }
}

/**
 * DELETE → 구독자 삭제 (query param ?id=123)
 * 주의: 법적 보존 의무가 있을 수 있으므로 실제 삭제는 신중히.
 */
export async function DELETE(req: NextRequest) {
  const authError = verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = Number(searchParams.get("id"))

  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 })
  }

  const deleted = await deleteSubscriber(id)
  if (!deleted) {
    return NextResponse.json({ error: "구독자를 찾을 수 없습니다." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
