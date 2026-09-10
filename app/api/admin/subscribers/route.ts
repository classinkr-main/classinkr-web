import { NextRequest, NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/admin-auth"
import { adminCachedJson } from "@/lib/admin-api-response"
import {
  countSubscribers,
  getSubscriberAnalyticsRows,
  getSubscribersPage,
  upsertSubscriber,
  deleteSubscriber,
} from "@/lib/repositories/marketing"
import type { UpsertSubscriberRequest } from "@/lib/marketing-types"

function boundedInteger(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(Math.floor(parsed), max))
}

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const statusFilter = searchParams.get("status")
  const tagFilter = searchParams.get("tag")
  const filters = {
    status: statusFilter ?? undefined,
    tag: tagFilter ?? undefined,
  }

  try {
    // ?count=1 은 행을 전송하지 않고 총 구독자 수만 반환한다.(대시보드 KPI용)
    if (searchParams.get("count") === "1") {
      const total = await countSubscribers(filters)
      return adminCachedJson({ subscribers: [], total })
    }

    // Analytics는 전량 롤업이 필요하다. 기존 getAllSubscribers(1000) 투영은 1,001번째부터
    // 조용히 누락했으므로, DB 단계에서 세 필드만 고른 keyset 전량 조회를 사용한다.
    if (searchParams.get("scope") === "analytics") {
      const subscribers = await getSubscriberAnalyticsRows(filters)
      return adminCachedJson({ subscribers, total: subscribers.length })
    }

    const page = await getSubscribersPage(
      boundedInteger(searchParams.get("limit"), 1_000, 1, 1_000),
      boundedInteger(searchParams.get("offset"), 0, 0, 100_000),
      filters
    )
    return adminCachedJson({
      subscribers: page.subscribers,
      total: page.total,
      limit: page.limit,
      offset: page.offset,
      hasMore: page.hasMore,
    })
  } catch (error) {
    console.error("[GET /api/admin/subscribers]", error)
    return NextResponse.json({ error: "Failed to fetch subscribers" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  try {
    const body: UpsertSubscriberRequest = await req.json()

    if (!body.email || !body.name) {
      return NextResponse.json(
        { error: "이름과 이메일은 필수입니다." },
        { status: 400 }
      )
    }

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
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await verifyAdmin(req)
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id 파라미터가 필요합니다." }, { status: 400 })
  }

  const deleted = await deleteSubscriber(id)
  if (!deleted) {
    return NextResponse.json({ error: "구독자를 찾을 수 없습니다." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
